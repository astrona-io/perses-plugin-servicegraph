# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-11-13

### Added

- Requester picker in the panel: choose `user` or any calling service and see the single flow its
  requests take, down to the last hop. Starts at `root`; `showRequesterPicker` hides it.
- Clicking a node traces the flow through it (every path into it and everything downstream) instead
  of only its direct neighbours.
- Latency p25, p50, p75, p90, p95 and p99 in edge and node tooltips.

### Changed

- Colouring by latency is a gradient: neutral under the warning threshold, then from the warning
  colour to the critical colour between the two thresholds. The legend shows the gradient.
- Latency comes from one bucket query per edge and per node, with the percentiles computed in the
  browser, instead of a `histogram_quantile` query per percentile. An edge seen in several
  namespaces now has one merged histogram rather than the worst of its quantiles.
- The requester of a flow is always the first column of the hierarchical layout, in bold.

## [0.2.0] - 2026-11-13

### Added

- `root` option ("Start from"): draws one flow, the calls the matching nodes make and everything they
  lead to downstream. Usually `$root`, with `user` for incoming requests or a job's name for its work.
- `rate-latency` edge label: the request rate with the latency percentile below it.
- Node icons: a coloured disc with a white glyph per kind (cube for a service/pod, cylinder for a
  database, envelope for messaging, person for the user, question mark with a dashed ring for an
  uninstrumented callee), and role glyphs picked from common infrastructure names (cache, search,
  object storage, identity provider, mail, web front). The legend uses the same icons.

### Changed

- Rates below 0.01 req/s are shown per minute or per hour instead of `<0.01 req/s`.

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
