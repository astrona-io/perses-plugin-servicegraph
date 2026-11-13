# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-13

### Added

- `ServiceGraphChart` panel: a service graph from the `traces_service_graph_*` metrics of the Tempo
  metrics-generator or the OpenTelemetry Collector `servicegraph` connector, queried from a Prometheus
  datasource.
- Request rate, error ratio and latency percentile (p50, p90, p95, p99; server or client side) on
  nodes and edges, with tooltips, edge labels, and colours from configurable error or latency
  thresholds.
- Namespace filter on `client_k8s_namespace_name` / `server_k8s_namespace_name` (labels configurable)
  with either, both, client or server matching; out-of-namespace nodes are dimmed.
- Service-name regex filter and extra label selector.
- Force-directed and hierarchical layouts, both deterministic; disconnected parts are stacked.
- Node kinds from `connection_type`: service, database, messaging, user and uninstrumented.
- Hover and click focus on a node's neighbours, node size by throughput, optional unconnected nodes,
  legend, light and dark themes, and a "No data" message.
- Panel settings editor and CUE schema.
- `Containerfile` for a plugin-only OCI image, for use as a Kubernetes image volume.

Tested with Perses v0.54.0.

[0.1.0]: https://github.com/astrona-io/perses-plugin-servicegraph/releases/tag/v0.1.0
