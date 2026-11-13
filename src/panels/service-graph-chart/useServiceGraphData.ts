import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  replaceVariablesInString,
  useAllVariableValues,
  useDatasourceClient,
  useDatasourceSelectValueToSelector,
  useTimeRange,
} from "@perses-dev/plugin-system";
import { GraphResults, Sample } from "./graph";
import { GraphQueries, buildQueries } from "./queries";
import {
  PROMETHEUS_DATASOURCE_KIND,
  ResolvedOptions,
  ServiceGraphChartOptions,
} from "./service-graph-chart-types";

/**
 * The part of the Prometheus datasource client this panel uses. Declared here rather than imported, so
 * the plugin does not bundle or depend on the Prometheus plugin: the client comes from the datasource
 * at runtime through `useDatasourceClient`.
 */
interface PrometheusLikeClient {
  instantQuery?: (params: { query: string; time?: number }) => Promise<{
    status: string;
    error?: string;
    data?: {
      resultType: string;
      result: Array<{
        metric: Record<string, string>;
        value: [number, string];
      }>;
    };
  }>;
}

export interface ServiceGraphData {
  results?: GraphResults;
  queries?: GraphQueries;
  namespacePattern: string;
  rootPattern: string;
  isLoading: boolean;
  error?: Error;
}

const MIN_WINDOW_SECONDS = 60;

/**
 * Runs the four instant queries at the end of the dashboard's time range. Variables in the namespace,
 * service filter, root and label selector are expanded here, with Perses' default formatting (a multi-value
 * variable becomes `(a|b)`, which suits the `=~` matchers the queries use).
 */
export function useServiceGraphData(
  spec: ServiceGraphChartOptions,
  o: ResolvedOptions,
): ServiceGraphData {
  const selector = useDatasourceSelectValueToSelector(
    spec.datasource ?? { kind: PROMETHEUS_DATASOURCE_KIND },
    PROMETHEUS_DATASOURCE_KIND,
  );
  const client = useDatasourceClient<PrometheusLikeClient>(selector);
  const { absoluteTimeRange } = useTimeRange();
  const variables = useAllVariableValues();

  const end = Math.floor(absoluteTimeRange.end.getTime() / 1000);
  const rangeSeconds = Math.max(
    MIN_WINDOW_SECONDS,
    Math.ceil(
      (absoluteTimeRange.end.getTime() - absoluteTimeRange.start.getTime()) /
        1000,
    ),
  );

  const expand = (s: string): string =>
    s ? replaceVariablesInString(s, variables).trim() : "";
  const namespace = expand(o.namespace);
  const serviceFilter = expand(o.serviceFilter);
  const labelSelector = expand(o.labelSelector);
  const window = expand(o.window) || `${rangeSeconds}s`;

  const queries = useMemo(
    () => buildQueries(o, { namespace, serviceFilter, labelSelector, window }),
    [o, namespace, serviceFilter, labelSelector, window],
  );

  const result = useQuery<GraphResults, Error>({
    queryKey: ["ServiceGraphChart", selector, queries, end],
    enabled: client.isSuccess,
    keepPreviousData: true,
    queryFn: async () => {
      const c = client.data;
      if (!c?.instantQuery)
        throw new Error(
          "The selected datasource is not a Prometheus datasource (no instant query support).",
        );
      const run = async (query: string): Promise<Sample[]> => {
        const res = await c.instantQuery!({ query, time: end });
        if (res.status !== "success")
          throw new Error(res.error || `Query failed: ${query}`);
        if (res.data?.resultType !== "vector") return [];
        return res.data.result.map((r) => ({
          metric: r.metric,
          value: Number(r.value[1]),
        }));
      };
      const [requests, failed, edgeBuckets, nodeBuckets] = await Promise.all([
        run(queries.requests),
        run(queries.failed),
        run(queries.edgeBuckets),
        run(queries.nodeBuckets),
      ]);
      return { requests, failed, edgeBuckets, nodeBuckets };
    },
  });

  return {
    results: result.data,
    queries,
    namespacePattern: namespace,
    rootPattern: expand(o.root),
    isLoading:
      client.isLoading || (result.isLoading && result.fetchStatus !== "idle"),
    error: (client.error as Error | null) ?? result.error ?? undefined,
  };
}
