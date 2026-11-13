import { useQuery } from "@tanstack/react-query";
import {
  useDatasourceClient,
  useDatasourceSelectValueToSelector,
  useTimeRange,
} from "@perses-dev/plugin-system";
import { Percentiles } from "./graph";
import {
  ServiceGraphChartOptions,
  TEMPO_DATASOURCE_KIND,
  TOOLTIP_PERCENTILES,
} from "./service-graph-chart-types";

/**
 * The part of the Tempo datasource client this panel uses: its proxy URL and headers. Declared here
 * rather than imported, so the plugin does not depend on the Tempo plugin. The client has no TraceQL
 * metrics call, so the panel fetches `/api/metrics/query` itself.
 */
interface TempoLikeClient {
  options?: { datasourceUrl?: string; headers?: Record<string, string> };
}

interface TempoMetricsResponse {
  series?: Array<{
    labels?: Array<{
      key: string;
      value: { stringValue?: string; doubleValue?: number };
    }>;
    value?: number;
  }>;
}

export interface FullRequestTime {
  /** Trace duration percentiles per node, keyed like `Percentiles` (p25 … p99). */
  byNode?: Map<string, Percentiles>;
  /** Seconds the query covered; Tempo caps TraceQL metrics at `MAX_RANGE_SECONDS`. */
  rangeSeconds: number;
  /** Whether the dashboard range was longer and only its last `rangeSeconds` were queried. */
  clamped: boolean;
  isLoading: boolean;
  error?: Error;
}

/** Tempo's default `query_frontend.metrics.max_duration`. */
const MAX_RANGE_SECONDS = 3 * 3600;
const QUANTILES = TOOLTIP_PERCENTILES.map(([, q]) => q).join(", ");

/** A TraceQL string literal. */
function str(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The whole duration of traces that reach each node, from Tempo's TraceQL metrics: for every service
 * that has a span in a trace, and every address a client span called (databases and other nodes
 * without spans of their own), the percentiles of `trace:duration`. `requesters` limits it to traces
 * whose root span belongs to one of those services; undefined means every trace.
 *
 * A trace is counted once per span it has on a node, so a node a trace calls many times weighs that
 * trace more. Tempo's duration histogram has power-of-two buckets, so values are approximate.
 */
export function useFullRequestTime(
  spec: ServiceGraphChartOptions,
  enabled: boolean,
  requesters: string[] | undefined,
): FullRequestTime {
  const selector = useDatasourceSelectValueToSelector(
    spec.traceDatasource ?? { kind: TEMPO_DATASOURCE_KIND },
    TEMPO_DATASOURCE_KIND,
  );
  const client = useDatasourceClient<TempoLikeClient>(selector);
  const { absoluteTimeRange } = useTimeRange();
  const end = Math.floor(absoluteTimeRange.end.getTime() / 1000);
  const fullRange = Math.max(
    60,
    end - Math.floor(absoluteTimeRange.start.getTime() / 1000),
  );
  const rangeSeconds = Math.min(fullRange, MAX_RANGE_SECONDS);

  // No requester left (for example `user` with no entry calls in range): nothing can match.
  const none = requesters !== undefined && requesters.length === 0;
  const root =
    requesters && requesters.length > 0
      ? `(${requesters.map((r) => `trace:rootService = ${str(r)}`).join(" || ")})`
      : "";
  const queries: Array<[string, string]> = [
    [
      `{ ${root} } | quantile_over_time(trace:duration, ${QUANTILES}) by (resource.service.name)`,
      "resource.service.name",
    ],
    [
      `{ ${root ? `${root} && ` : ""}span:kind = client && span.server.address != nil } | quantile_over_time(trace:duration, ${QUANTILES}) by (span.server.address)`,
      "span.server.address",
    ],
  ];

  const result = useQuery<Map<string, Percentiles>, Error>({
    queryKey: ["ServiceGraphChart:fullRequest", selector, queries, end],
    enabled: enabled && !none && client.isSuccess,
    keepPreviousData: true,
    queryFn: async () => {
      const base = client.data?.options?.datasourceUrl;
      if (!base)
        throw new Error(
          "The trace datasource is not a Tempo datasource (no URL to query).",
        );
      const run = async (q: string): Promise<TempoMetricsResponse> => {
        const params = new URLSearchParams({
          q,
          start: String(end - rangeSeconds),
          end: String(end),
        });
        const res = await fetch(`${base}/api/metrics/query?${params}`, {
          headers: client.data?.options?.headers,
        });
        if (!res.ok)
          throw new Error(
            `Tempo: ${(await res.text()).trim() || res.statusText}`,
          );
        return res.json();
      };
      const [services, addresses] = await Promise.all(
        queries.map(([q]) => run(q)),
      );
      const byNode = new Map<string, Percentiles>();
      // Service spans first: a node that is a service keeps its own value over an address match.
      for (const [res, [, key]] of [
        [services, queries[0]!],
        [addresses, queries[1]!],
      ] as const) {
        const seen = new Set<string>();
        for (const s of res?.series ?? []) {
          const labels = new Map(
            (s.labels ?? []).map((l) => [
              l.key,
              l.value.stringValue ?? l.value.doubleValue,
            ]),
          );
          const node = labels.get(key);
          const q = labels.get("p");
          if (typeof node !== "string" || typeof q !== "number") continue;
          if (byNode.has(node) && !seen.has(node)) continue;
          seen.add(node);
          const name = TOOLTIP_PERCENTILES.find(([, v]) => v === q)?.[0];
          if (!name || !Number.isFinite(s.value)) continue;
          const p = byNode.get(node) ?? {};
          p[name] = s.value!;
          byNode.set(node, p);
        }
      }
      return byNode;
    },
  });

  return {
    byNode: none ? new Map() : result.data,
    rangeSeconds,
    clamped: fullRange > rangeSeconds,
    isLoading:
      enabled &&
      !none &&
      (client.isLoading || (result.isLoading && result.fetchStatus !== "idle")),
    error: enabled
      ? ((client.error as Error | null) ?? result.error ?? undefined)
      : undefined,
  };
}
