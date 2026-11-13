import { Buckets, addBucket, histogramQuantile } from "./histogram";
import {
  PERCENTILES,
  ResolvedOptions,
  TOOLTIP_PERCENTILES,
  Thresholds,
} from "./service-graph-chart-types";

/** One sample of an instant-vector result. */
export interface Sample {
  metric: Record<string, string>;
  value: number;
}

export interface GraphResults {
  requests: Sample[];
  failed: Sample[];
  edgeBuckets: Sample[];
  nodeBuckets: Sample[];
}

/** Latency in seconds per tooltip percentile (`p25` ... `p99`); NaN without samples. */
export type Percentiles = Record<string, number>;

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
  /** Seconds at the configured percentile, NaN when the histogram had no samples. */
  latency: number;
  percentiles: Percentiles;
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
  percentiles: Percentiles;
}

export interface ServiceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Every node that makes calls, before the root filter: the choices for the requester picker. */
  callers: string[];
  /** The nodes the drawn flow starts from; empty when every flow is drawn. */
  roots: string[];
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
  rootPattern = "",
): ServiceGraph {
  const c = o.clientLabel;
  const s = o.serverLabel;
  const ct = o.connectionTypeLabel;

  interface EdgeAcc {
    client: string;
    server: string;
    rate: number;
    failed: number;
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
  const edgeBuckets = bucketsBy(results.edgeBuckets, (m) =>
    m[c] && m[s] ? edgeKey(m[c], m[s]) : undefined,
  );
  const nodeBuckets = bucketsBy(results.nodeBuckets, (m) => m[s]);
  const q = PERCENTILES[o.latencyPercentile];

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
        latency: histogramQuantile(q, nodeBuckets.get(id)),
        percentiles: percentilesOf(nodeBuckets.get(id)),
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
      latency: histogramQuantile(
        q,
        edgeBuckets.get(edgeKey(e.client, e.server)),
      ),
      percentiles: percentilesOf(edgeBuckets.get(edgeKey(e.client, e.server))),
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

  const callers = [...new Set(graphEdges.map((e) => e.source))].sort(
    (a, b) => Number(b === "user") - Number(a === "user") || a.localeCompare(b),
  );
  const root = scopeMatcher(rootPattern);
  const roots = root ? callers.filter((id) => root.test(id)) : [];
  const drawn = reachableFrom(graphEdges, root);
  const connected = new Set<string>();
  for (const e of drawn) {
    connected.add(e.source);
    connected.add(e.target);
  }
  const nodeList = [...nodes.values()]
    .filter(
      (n) =>
        connected.has(n.id) ||
        (o.showUnconnected && (drawn === graphEdges || !!root?.test(n.id))),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  return { nodes: nodeList, edges: drawn, callers, roots };
}

function bucketsBy(
  samples: Sample[],
  key: (metric: Record<string, string>) => string | undefined,
): Map<string, Buckets> {
  const out = new Map<string, Buckets>();
  for (const sample of samples) {
    const k = key(sample.metric);
    const le = sample.metric.le;
    if (!k || le === undefined) continue;
    let b = out.get(k);
    if (!b) out.set(k, (b = new Map()));
    addBucket(b, le, sample.value);
  }
  return out;
}

function percentilesOf(buckets: Buckets | undefined): Percentiles {
  const out: Percentiles = {};
  for (const [name, q] of TOOLTIP_PERCENTILES)
    out[name] = histogramQuantile(q, buckets);
  return out;
}

/**
 * The flow through one node: every call on a path into it (its callers, their callers, ...) and every
 * call it leads to downstream. Clicking a node highlights this, so a request can be followed end to end.
 */
export function flowThrough(
  edges: GraphEdge[],
  id: string,
): { nodes: Set<string>; edges: Set<string> } {
  const walk = (
    from: (e: GraphEdge) => string,
    to: (e: GraphEdge) => string,
  ): Set<string> => {
    const next = new Map<string, string[]>();
    for (const e of edges) {
      const list = next.get(from(e)) ?? [];
      list.push(to(e));
      next.set(from(e), list);
    }
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length)
      for (const n of next.get(queue.shift()!) ?? [])
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
    return seen;
  };
  const up = walk(
    (e) => e.target,
    (e) => e.source,
  );
  const down = walk(
    (e) => e.source,
    (e) => e.target,
  );
  const kept = new Set<string>();
  for (const e of edges)
    if (
      (up.has(e.source) && up.has(e.target)) ||
      (down.has(e.source) && down.has(e.target))
    )
      kept.add(e.id);
  return { nodes: new Set([...up, ...down]), edges: kept };
}

/**
 * The edges a flow takes: every call made by a node matching `root`, then every call made by the
 * nodes those reach, and so on downstream. All edges when there is no root.
 */
function reachableFrom(edges: GraphEdge[], root?: RegExp): GraphEdge[] {
  if (!root) return edges;
  const out = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    const list = out.get(e.source) ?? [];
    list.push(e);
    out.set(e.source, list);
  }
  const seen = new Set([...out.keys()].filter((id) => root.test(id)));
  const queue = [...seen];
  const kept: GraphEdge[] = [];
  while (queue.length) {
    for (const e of out.get(queue.shift()!) ?? []) {
      kept.push(e);
      if (!seen.has(e.target)) {
        seen.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return kept;
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
