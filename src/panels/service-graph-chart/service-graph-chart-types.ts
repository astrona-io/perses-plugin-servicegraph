import { DatasourceSelector } from "@perses-dev/spec";
import {
  DatasourceSelectValue,
  OptionsEditorProps,
  PanelProps,
} from "@perses-dev/plugin-system";

export type ServiceGraphChartProps = PanelProps<ServiceGraphChartOptions>;
export type ServiceGraphChartEditorProps =
  OptionsEditorProps<ServiceGraphChartOptions>;

export type NamespaceMatch = "either" | "both" | "client" | "server";
export type LatencyPercentile = "p50" | "p90" | "p95" | "p99";
export type LatencySource = "server" | "client";
export type EdgeColorBy = "errors" | "latency";
export type GraphLayout = "force" | "hierarchical";
export type EdgeLabel = "none" | "rate" | "errors" | "latency";

export interface Thresholds {
  warning: number;
  critical: number;
}

export interface ServiceGraphChartOptions {
  /** Prometheus datasource (selector or `$variable`). The default Prometheus datasource when unset. */
  datasource?: DatasourceSelectValue<DatasourceSelector>;
  /** Prefix of the service-graph metrics. Default `traces_service_graph`. */
  metricPrefix?: string;
  /** Histogram base name for latency, without `_bucket`. Default `<prefix>_request_<source>_seconds`. */
  latencyMetric?: string;
  /** Label holding the calling service. Default `client`. */
  clientLabel?: string;
  /** Label holding the called service. Default `server`. */
  serverLabel?: string;
  /** Label telling databases, queues and virtual nodes apart. Default `connection_type`; empty turns it off. */
  connectionTypeLabel?: string;
  /** Extra label matchers added to every selector, e.g. `cluster="prod"`. Variables are expanded. */
  labelSelector?: string;
  /** Rate window. Empty means the dashboard's whole time range. */
  window?: string;

  /** Namespace value or regex, usually a variable such as `$namespace`. Empty means no namespace filter. */
  namespace?: string;
  /** Namespace label of the client side. Default `client_k8s_namespace_name`. */
  clientNamespaceLabel?: string;
  /** Namespace label of the server side. Default `server_k8s_namespace_name`. */
  serverNamespaceLabel?: string;
  /** Which side of an edge must be in the namespace. Default `either`. */
  namespaceMatch?: NamespaceMatch;
  /** Regex on service names; an edge is kept when either end matches. */
  serviceFilter?: string;

  /** Latency percentile from the histogram. Default `p95`. */
  latencyPercentile?: LatencyPercentile;
  /** Server-side (callee) or client-side (caller) latency histogram. Default `server`. */
  latencySource?: LatencySource;
  /** What edge and node colours show. Default `errors`. */
  edgeColorBy?: EdgeColorBy;
  /** Error ratio thresholds in percent. Default warning 1, critical 5. */
  errorThresholds?: Thresholds;
  /** Latency thresholds in seconds. Default warning 0.5, critical 1. */
  latencyThresholds?: Thresholds;

  /** Default `force`. */
  layout?: GraphLayout;
  /** Text drawn on each edge. Default `none`. */
  edgeLabel?: EdgeLabel;
  /** Scale nodes by their request rate. Default true. */
  nodeSizeByThroughput?: boolean;
  /** Keep nodes whose edges had no requests in the window. Default false. */
  showUnconnected?: boolean;
  /** Default true. */
  showLegend?: boolean;
}

export const DEFAULT_METRIC_PREFIX = "traces_service_graph";
export const DEFAULT_CLIENT_LABEL = "client";
export const DEFAULT_SERVER_LABEL = "server";
export const DEFAULT_CONNECTION_TYPE_LABEL = "connection_type";
export const DEFAULT_CLIENT_NAMESPACE_LABEL = "client_k8s_namespace_name";
export const DEFAULT_SERVER_NAMESPACE_LABEL = "server_k8s_namespace_name";
export const DEFAULT_ERROR_THRESHOLDS: Thresholds = { warning: 1, critical: 5 };
export const DEFAULT_LATENCY_THRESHOLDS: Thresholds = {
  warning: 0.5,
  critical: 1,
};
export const PROMETHEUS_DATASOURCE_KIND = "PrometheusDatasource";

export const PERCENTILES: Record<LatencyPercentile, number> = {
  p50: 0.5,
  p90: 0.9,
  p95: 0.95,
  p99: 0.99,
};

export function createInitialServiceGraphChartOptions(): ServiceGraphChartOptions {
  return {
    metricPrefix: DEFAULT_METRIC_PREFIX,
    clientLabel: DEFAULT_CLIENT_LABEL,
    serverLabel: DEFAULT_SERVER_LABEL,
    connectionTypeLabel: DEFAULT_CONNECTION_TYPE_LABEL,
    latencyPercentile: "p95",
    latencySource: "server",
    edgeColorBy: "errors",
    errorThresholds: DEFAULT_ERROR_THRESHOLDS,
    latencyThresholds: DEFAULT_LATENCY_THRESHOLDS,
    layout: "force",
    edgeLabel: "none",
    nodeSizeByThroughput: true,
    showUnconnected: false,
    showLegend: true,
  };
}

/** Spec with every default filled in, so the rest of the code does not repeat them. */
export interface ResolvedOptions {
  metricPrefix: string;
  latencyMetric: string;
  clientLabel: string;
  serverLabel: string;
  connectionTypeLabel: string;
  labelSelector: string;
  window: string;
  namespace: string;
  clientNamespaceLabel: string;
  serverNamespaceLabel: string;
  namespaceMatch: NamespaceMatch;
  serviceFilter: string;
  latencyPercentile: LatencyPercentile;
  latencySource: LatencySource;
  edgeColorBy: EdgeColorBy;
  errorThresholds: Thresholds;
  latencyThresholds: Thresholds;
  layout: GraphLayout;
  edgeLabel: EdgeLabel;
  nodeSizeByThroughput: boolean;
  showUnconnected: boolean;
  showLegend: boolean;
}

export function resolveOptions(
  spec: ServiceGraphChartOptions,
): ResolvedOptions {
  const metricPrefix = spec.metricPrefix || DEFAULT_METRIC_PREFIX;
  const latencySource = spec.latencySource ?? "server";
  return {
    metricPrefix,
    latencyMetric:
      spec.latencyMetric || `${metricPrefix}_request_${latencySource}_seconds`,
    clientLabel: spec.clientLabel || DEFAULT_CLIENT_LABEL,
    serverLabel: spec.serverLabel || DEFAULT_SERVER_LABEL,
    // An explicit empty string turns connection types off; undefined means the default.
    connectionTypeLabel:
      spec.connectionTypeLabel ?? DEFAULT_CONNECTION_TYPE_LABEL,
    labelSelector: spec.labelSelector ?? "",
    window: spec.window ?? "",
    namespace: spec.namespace ?? "",
    clientNamespaceLabel:
      spec.clientNamespaceLabel || DEFAULT_CLIENT_NAMESPACE_LABEL,
    serverNamespaceLabel:
      spec.serverNamespaceLabel || DEFAULT_SERVER_NAMESPACE_LABEL,
    namespaceMatch: spec.namespaceMatch ?? "either",
    serviceFilter: spec.serviceFilter ?? "",
    latencyPercentile: spec.latencyPercentile ?? "p95",
    latencySource,
    edgeColorBy: spec.edgeColorBy ?? "errors",
    errorThresholds: spec.errorThresholds ?? DEFAULT_ERROR_THRESHOLDS,
    latencyThresholds: spec.latencyThresholds ?? DEFAULT_LATENCY_THRESHOLDS,
    layout: spec.layout ?? "force",
    edgeLabel: spec.edgeLabel ?? "none",
    nodeSizeByThroughput: spec.nodeSizeByThroughput ?? true,
    showUnconnected: spec.showUnconnected ?? false,
    showLegend: spec.showLegend ?? true,
  };
}
