package model

import (
	"github.com/perses/shared/cue/common"
)

#labelName:  string & =~"^[a-zA-Z_][a-zA-Z0-9_]*$"
#metricName: string & =~"^[a-zA-Z_:][a-zA-Z0-9_:]*$"

#thresholds: close({
	warning:  number & >=0
	critical: number & >=0
})

kind: "ServiceGraphChart"
spec: close({
	// Prometheus datasource: a selector or a variable. The default Prometheus datasource when unset.
	common.#datasourceSelector & {_kind: "PrometheusDatasource"}

	// Prefix of the service-graph metrics (default traces_service_graph).
	metricPrefix?: #metricName
	// Latency histogram base name, without _bucket.
	latencyMetric?: #metricName
	clientLabel?:   #labelName
	serverLabel?:   #labelName
	// Empty turns connection types off.
	connectionTypeLabel?: #labelName | ""
	// Extra label matchers added to every selector, e.g. cluster="prod".
	labelSelector?: string
	// Rate window such as 5m. Empty means the dashboard's time range.
	window?: string

	// Namespace value or regex, usually $namespace.
	namespace?:            string
	clientNamespaceLabel?: #labelName
	serverNamespaceLabel?: #labelName
	namespaceMatch?:       "either" | "both" | "client" | "server"
	// Regex on service names.
	serviceFilter?: string

	latencyPercentile?: "p50" | "p90" | "p95" | "p99"
	latencySource?:     "server" | "client"
	edgeColorBy?:       "errors" | "latency"
	// Percent.
	errorThresholds?: #thresholds
	// Seconds.
	latencyThresholds?: #thresholds

	layout?:               "force" | "hierarchical"
	edgeLabel?:            "none" | "rate" | "errors" | "latency"
	nodeSizeByThroughput?: bool
	showUnconnected?:      bool
	showLegend?:           bool
})
