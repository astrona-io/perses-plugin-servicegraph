import { ResolvedOptions } from "./service-graph-chart-types";

/** The four instant queries the panel runs. Each returns one sample per edge (or per node, or bucket). */
export interface GraphQueries {
  /** Requests per second, by edge. */
  requests: string;
  /** Failed requests per second, by edge. */
  failed: string;
  /** Latency histogram bucket rates, by edge and `le`; the percentiles are read from them (histogram.ts). */
  edgeBuckets: string;
  /** Bucket rates of everything a service served (server side), by node and `le`. */
  nodeBuckets: string;
}

/** Values after dashboard variables have been expanded. */
export interface QueryInputs {
  namespace: string;
  serviceFilter: string;
  labelSelector: string;
  /** PromQL range, e.g. `3600s` or `5m`. */
  window: string;
}

/** Escapes a value for a double-quoted PromQL string. */
export function promString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Alternatives of label matchers; the series selected is the union (`or`) of all of them. */
function filterSets(o: ResolvedOptions, inputs: QueryInputs): string[][] {
  let sets: string[][] = [[]];
  const cross = (alternatives: string[][]): void => {
    const next: string[][] = [];
    for (const base of sets)
      for (const alt of alternatives) next.push([...base, ...alt]);
    sets = next;
  };

  if (inputs.namespace) {
    const v = promString(inputs.namespace);
    const c = `${o.clientNamespaceLabel}=~${v}`;
    const s = `${o.serverNamespaceLabel}=~${v}`;
    switch (o.namespaceMatch) {
      case "both":
        cross([[c, s]]);
        break;
      case "client":
        cross([[c]]);
        break;
      case "server":
        cross([[s]]);
        break;
      default:
        cross([[c], [s]]);
    }
  }
  if (inputs.serviceFilter) {
    const v = promString(inputs.serviceFilter);
    cross([[`${o.clientLabel}=~${v}`], [`${o.serverLabel}=~${v}`]]);
  }
  const extra = inputs.labelSelector
    .trim()
    .replace(/^\{|\}$/g, "")
    .trim();
  if (extra) sets = sets.map((s) => [extra, ...s]);
  return sets;
}

function rateOf(metric: string, sets: string[][], window: string): string {
  const parts = sets.map((m) =>
    m.length
      ? `rate(${metric}{${m.join(", ")}}[${window}])`
      : `rate(${metric}[${window}])`,
  );
  return parts.length === 1 ? parts[0]! : `(${parts.join(" or ")})`;
}

/** Labels the per-edge queries group by: the two ends, plus the optional connection type and namespaces. */
export function edgeGroupLabels(
  o: ResolvedOptions,
  withNamespace: boolean,
): string[] {
  const labels = [o.clientLabel, o.serverLabel];
  if (o.connectionTypeLabel) labels.push(o.connectionTypeLabel);
  if (withNamespace)
    labels.push(o.clientNamespaceLabel, o.serverNamespaceLabel);
  return labels;
}

export function buildQueries(
  o: ResolvedOptions,
  inputs: QueryInputs,
): GraphQueries {
  const sets = filterSets(o, inputs);
  const by = edgeGroupLabels(o, inputs.namespace !== "").join(", ");
  const p = o.metricPrefix;
  const w = inputs.window;
  // Node latency is always what the service took to answer, so it reads the server-side histogram.
  const serverHistogram =
    o.latencySource === "server"
      ? o.latencyMetric
      : `${p}_request_server_seconds`;
  return {
    requests: `sum by (${by}) (${rateOf(`${p}_request_total`, sets, w)})`,
    failed: `sum by (${by}) (${rateOf(`${p}_request_failed_total`, sets, w)})`,
    // Only the two ends: series of one edge in several namespaces add up to one histogram.
    edgeBuckets: `sum by (${o.clientLabel}, ${o.serverLabel}, le) (${rateOf(
      `${o.latencyMetric}_bucket`,
      sets,
      w,
    )})`,
    nodeBuckets: `sum by (${o.serverLabel}, le) (${rateOf(
      `${serverHistogram}_bucket`,
      sets,
      w,
    )})`,
  };
}
