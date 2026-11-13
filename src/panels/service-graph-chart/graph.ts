import { ResolvedOptions, Thresholds } from "./service-graph-chart-types";

/** One sample of an instant-vector result. */
export interface Sample {
  metric: Record<string, string>;
  value: number;
}

export interface GraphResults {
  requests: Sample[];
  failed: Sample[];
  edgeLatency: Sample[];
  nodeLatency: Sample[];
}

/**
 * `service`: an instrumented service. `database` and `messaging`: the server end of a call that only
 * the client reported, with the connection type the generator derived from span attributes.
 * `user`: the client end of a call that only the server reported (Tempo names it `user`).
 * `external`: any other node that only one side reported.
 */
export type NodeKind =
  "service" | "database" | "messaging" | "user" | "external";
export type Severity = "ok" | "warning" | "critical" | "none";

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  rate: number;
  failedRate: number;
  /** 0..1, NaN without requests. */
  errorRatio: number;
  /** Seconds, NaN when the histogram had no samples. */
  latency: number;
  connectionType: string;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  namespace: string;
  /** Whether the node is inside the namespace filter; true when there is no filter or no namespace is known. */
  inScope: boolean;
  inRate: number;
  inFailed: number;
  outRate: number;
  outFailed: number;
  /** Requests per second served, or sent for a node that serves nothing (a root such as `user`). */
  throughput: number;
  errorRatio: number;
  latency: number;
}

export interface ServiceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const SEP = "\u0000";

function edgeKey(client: string, server: string): string {
  return `${client}${SEP}${server}`;
}

/** Anchored regex for the namespace filter, as PromQL's `=~` would match it. Undefined when invalid. */
function scopeMatcher(pattern: string): RegExp | undefined {
  if (!pattern) return undefined;
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return undefined;
  }
}

function kindFromConnectionType(connectionType: string): NodeKind | undefined {
  switch (connectionType) {
    case "database":
      return "database";
    case "messaging_system":
      return "messaging";
    case "virtual_node":
      return "external";
    default:
      return undefined;
  }
}

/** Turns the four query results into nodes and edges. */
export function buildGraph(
  results: GraphResults,
  o: ResolvedOptions,
  namespacePattern: string,
): ServiceGraph {
  const c = o.clientLabel;
  const s = o.serverLabel;
  const ct = o.connectionTypeLabel;

  interface EdgeAcc {
    client: string;
    server: string;
    rate: number;
    failed: number;
    latency: number;
    connectionType: string;
    clientNs: string;
    serverNs: string;
  }
  const edges = new Map<string, EdgeAcc>();

  for (const sample of results.requests) {
    const client = sample.metric[c];
    const server = sample.metric[s];
    if (!client || !server || !Number.isFinite(sample.value)) continue;
    const key = edgeKey(client, server);
    const acc = edges.get(key) ?? {
      client,
      server,
      rate: 0,
      failed: 0,
      latency: NaN,
      connectionType: "",
      clientNs: "",
      serverNs: "",
    };
    acc.rate += sample.value;
    acc.connectionType ||= (ct && sample.metric[ct]) || "";
    acc.clientNs ||= sample.metric[o.clientNamespaceLabel] ?? "";
    acc.serverNs ||= sample.metric[o.serverNamespaceLabel] ?? "";
    edges.set(key, acc);
  }
  for (const sample of results.failed) {
    const acc = edges.get(
      edgeKey(sample.metric[c] ?? "", sample.metric[s] ?? ""),
    );
    if (acc && Number.isFinite(sample.value)) acc.failed += sample.value;
  }
  for (const sample of results.edgeLatency) {
    const acc = edges.get(
      edgeKey(sample.metric[c] ?? "", sample.metric[s] ?? ""),
    );
    // With extra grouping labels there can be several quantiles per edge; keep the worst.
    if (acc && Number.isFinite(sample.value))
      acc.latency = Number.isNaN(acc.latency)
        ? sample.value
        : Math.max(acc.latency, sample.value);
  }
  const nodeLatency = new Map<string, number>();
  for (const sample of results.nodeLatency) {
    const id = sample.metric[s];
    if (id && Number.isFinite(sample.value)) nodeLatency.set(id, sample.value);
  }

  const scope = scopeMatcher(namespacePattern);
  const nodes = new Map<string, GraphNode>();
  const node = (id: string): GraphNode => {
    let n = nodes.get(id);
    if (!n) {
      n = {
        id,
        kind: "service",
        namespace: "",
        inScope: true,
        inRate: 0,
        inFailed: 0,
        outRate: 0,
        outFailed: 0,
        throughput: 0,
        errorRatio: NaN,
        latency: nodeLatency.get(id) ?? NaN,
      };
      nodes.set(id, n);
    }
    return n;
  };

  // Kinds: a node that ever acts as a client of a non-virtual edge, or is the server of an edge without a
  // connection type, is an instrumented service. Otherwise the connection type of its edges decides.
  const instrumented = new Set<string>();
  const hint = new Map<string, NodeKind>();

  const graphEdges: GraphEdge[] = [];
  for (const e of edges.values()) {
    const from = node(e.client);
    const to = node(e.server);
    if (e.clientNs) from.namespace ||= e.clientNs;
    if (e.serverNs) to.namespace ||= e.serverNs;

    const kind = kindFromConnectionType(e.connectionType);
    if (e.connectionType === "virtual_node") {
      // A virtual edge has one real end. Without a client span the generator names the caller `user`
      // and the server is instrumented; without a server span the callee is a peer name.
      if (e.client === "user") {
        hint.set(e.client, "user");
        instrumented.add(e.server);
      } else {
        instrumented.add(e.client);
        if (!hint.has(e.server)) hint.set(e.server, "external");
      }
    } else {
      instrumented.add(e.client);
      if (kind) hint.set(e.server, kind);
      else instrumented.add(e.server);
    }

    if (e.rate <= 0) continue;
    from.outRate += e.rate;
    from.outFailed += e.failed;
    to.inRate += e.rate;
    to.inFailed += e.failed;
    if (e.client === e.server) continue; // self-calls count towards the node but are not drawn
    graphEdges.push({
      id: edgeKey(e.client, e.server),
      source: e.client,
      target: e.server,
      rate: e.rate,
      failedRate: e.failed,
      errorRatio: e.rate > 0 ? e.failed / e.rate : NaN,
      latency: e.latency,
      connectionType: e.connectionType,
    });
  }

  // A hint only applies to nodes that never show up as an instrumented service.
  for (const n of nodes.values()) {
    const h = hint.get(n.id) ?? (n.id === "user" ? "user" : undefined);
    if (h && !instrumented.has(n.id)) n.kind = h;

    n.throughput = n.inRate > 0 ? n.inRate : n.outRate;
    n.errorRatio =
      n.inRate > 0
        ? n.inFailed / n.inRate
        : n.outRate > 0
          ? n.outFailed / n.outRate
          : NaN;
    if (scope && n.namespace) n.inScope = scope.test(n.namespace);
  }

  const connected = new Set<string>();
  for (const e of graphEdges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  const nodeList = [...nodes.values()]
    .filter((n) => o.showUnconnected || connected.has(n.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { nodes: nodeList, edges: graphEdges };
}

export function severity(value: number, t: Thresholds): Severity {
  if (!Number.isFinite(value)) return "none";
  if (value >= t.critical) return "critical";
  if (value >= t.warning) return "warning";
  return "ok";
}

/** Severity of the metric the panel colours by: error ratio in percent, or latency in seconds. */
export function itemSeverity(
  item: { errorRatio: number; latency: number },
  o: ResolvedOptions,
): Severity {
  return o.edgeColorBy === "latency"
    ? severity(item.latency, o.latencyThresholds)
    : severity(item.errorRatio * 100, o.errorThresholds);
}
