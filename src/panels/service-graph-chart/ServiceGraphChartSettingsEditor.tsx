import { ReactElement } from "react";
import { MenuItem, Switch, TextField } from "@mui/material";
import {
  OptionsEditorColumn,
  OptionsEditorControl,
  OptionsEditorGrid,
  OptionsEditorGroup,
} from "@perses-dev/components";
import { DatasourceSelect } from "@perses-dev/plugin-system";
import {
  DEFAULT_CLIENT_LABEL,
  DEFAULT_CLIENT_NAMESPACE_LABEL,
  DEFAULT_CONNECTION_TYPE_LABEL,
  DEFAULT_ERROR_THRESHOLDS,
  DEFAULT_LATENCY_THRESHOLDS,
  DEFAULT_METRIC_PREFIX,
  DEFAULT_SERVER_LABEL,
  DEFAULT_SERVER_NAMESPACE_LABEL,
  EdgeColorBy,
  EdgeLabel,
  GraphLayout,
  LatencyPercentile,
  LatencySource,
  NamespaceMatch,
  PROMETHEUS_DATASOURCE_KIND,
  ServiceGraphChartEditorProps,
  ServiceGraphChartOptions,
  TEMPO_DATASOURCE_KIND,
  Thresholds,
} from "./service-graph-chart-types";

function parseNumber(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function TextControl({
  label,
  description,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  placeholder?: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}): ReactElement {
  return (
    <OptionsEditorControl
      label={label}
      description={description}
      control={
        <TextField
          size="small"
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      }
    />
  );
}

function SelectControl<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}): ReactElement {
  return (
    <OptionsEditorControl
      label={label}
      description={description}
      control={
        <TextField
          select
          size="small"
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map(([id, name]) => (
            <MenuItem key={id} value={id}>
              {name}
            </MenuItem>
          ))}
        </TextField>
      }
    />
  );
}

function ThresholdControls({
  label,
  unit,
  value,
  defaults,
  onChange,
}: {
  label: string;
  unit: string;
  value: Thresholds | undefined;
  defaults: Thresholds;
  onChange: (v: Thresholds) => void;
}): ReactElement {
  const cur = value ?? defaults;
  return (
    <>
      <OptionsEditorControl
        label={`${label} warning (${unit})`}
        control={
          <TextField
            size="small"
            type="number"
            value={cur.warning}
            onChange={(e) =>
              onChange({
                ...cur,
                warning: parseNumber(e.target.value) ?? defaults.warning,
              })
            }
          />
        }
      />
      <OptionsEditorControl
        label={`${label} critical (${unit})`}
        control={
          <TextField
            size="small"
            type="number"
            value={cur.critical}
            onChange={(e) =>
              onChange({
                ...cur,
                critical: parseNumber(e.target.value) ?? defaults.critical,
              })
            }
          />
        }
      />
    </>
  );
}

export function ServiceGraphChartSettingsEditor(
  props: ServiceGraphChartEditorProps,
): ReactElement {
  const { onChange, value } = props;
  const set = (patch: Partial<ServiceGraphChartOptions>): void =>
    onChange({ ...value, ...patch });

  return (
    <OptionsEditorGrid>
      <OptionsEditorColumn>
        <OptionsEditorGroup title="Data">
          <OptionsEditorControl
            label="Datasource"
            control={
              <DatasourceSelect
                datasourcePluginKind={PROMETHEUS_DATASOURCE_KIND}
                value={value.datasource ?? { kind: PROMETHEUS_DATASOURCE_KIND }}
                onChange={(datasource) => set({ datasource })}
              />
            }
          />
          <TextControl
            label="Metric prefix"
            description="Tempo and the OpenTelemetry servicegraph connector both use traces_service_graph"
            placeholder={DEFAULT_METRIC_PREFIX}
            value={value.metricPrefix}
            onChange={(metricPrefix) => set({ metricPrefix })}
          />
          <TextControl
            label="Client label"
            placeholder={DEFAULT_CLIENT_LABEL}
            value={value.clientLabel}
            onChange={(clientLabel) => set({ clientLabel })}
          />
          <TextControl
            label="Server label"
            placeholder={DEFAULT_SERVER_LABEL}
            value={value.serverLabel}
            onChange={(serverLabel) => set({ serverLabel })}
          />
          <OptionsEditorControl
            label="Connection type label"
            description="Marks databases, queues and virtual nodes. Clear to ignore."
            control={
              <TextField
                size="small"
                value={
                  value.connectionTypeLabel ?? DEFAULT_CONNECTION_TYPE_LABEL
                }
                onChange={(e) => set({ connectionTypeLabel: e.target.value })}
              />
            }
          />
          <TextControl
            label="Label selector"
            description='Extra matchers for every query, e.g. cluster="prod"'
            value={value.labelSelector}
            onChange={(labelSelector) => set({ labelSelector })}
          />
          <TextControl
            label="Rate window"
            description="e.g. 5m. Empty: the dashboard's whole time range"
            value={value.window}
            onChange={(window) => set({ window })}
          />
          <TextControl
            label="Latency histogram"
            description="Base name without _bucket. Empty: <prefix>_request_<source>_seconds"
            value={value.latencyMetric}
            onChange={(latencyMetric) => set({ latencyMetric })}
          />
          <OptionsEditorControl
            label="Trace datasource"
            description="Tempo, for the full request time of whole traces"
            control={
              <DatasourceSelect
                datasourcePluginKind={TEMPO_DATASOURCE_KIND}
                value={value.traceDatasource ?? { kind: TEMPO_DATASOURCE_KIND }}
                onChange={(traceDatasource) => set({ traceDatasource })}
              />
            }
          />
        </OptionsEditorGroup>
        <OptionsEditorGroup title="Filter">
          <TextControl
            label="Namespace"
            description="Value or regex, usually $namespace. Empty: no filter"
            value={value.namespace}
            onChange={(namespace) => set({ namespace })}
          />
          <SelectControl<NamespaceMatch>
            label="Keep edges where"
            value={value.namespaceMatch ?? "either"}
            options={[
              ["either", "Either end is in the namespace"],
              ["both", "Both ends are in the namespace"],
              ["client", "The caller is in the namespace"],
              ["server", "The callee is in the namespace"],
            ]}
            onChange={(namespaceMatch) => set({ namespaceMatch })}
          />
          <TextControl
            label="Client namespace label"
            placeholder={DEFAULT_CLIENT_NAMESPACE_LABEL}
            value={value.clientNamespaceLabel}
            onChange={(clientNamespaceLabel) => set({ clientNamespaceLabel })}
          />
          <TextControl
            label="Server namespace label"
            placeholder={DEFAULT_SERVER_NAMESPACE_LABEL}
            value={value.serverNamespaceLabel}
            onChange={(serverNamespaceLabel) => set({ serverNamespaceLabel })}
          />
          <TextControl
            label="Service filter"
            description="Regex on service names; keeps edges where either end matches"
            value={value.serviceFilter}
            onChange={(serviceFilter) => set({ serviceFilter })}
          />
          <TextControl
            label="Requester"
            description="Regex on node names, such as $root or user: draws only the calls these nodes make and what those lead to downstream. The requester picker starts here."
            value={value.root}
            onChange={(root) => set({ root })}
          />
          <OptionsEditorControl
            label="Requester picker"
            description="Pick in the panel which caller the flow starts from"
            control={
              <Switch
                checked={value.showRequesterPicker ?? true}
                onChange={(_, showRequesterPicker) =>
                  set({ showRequesterPicker })
                }
              />
            }
          />
        </OptionsEditorGroup>
      </OptionsEditorColumn>
      <OptionsEditorColumn>
        <OptionsEditorGroup title="Display">
          <SelectControl<GraphLayout>
            label="Layout"
            value={value.layout ?? "force"}
            options={[
              ["force", "Force-directed"],
              ["hierarchical", "Hierarchical (left to right)"],
            ]}
            onChange={(layout) => set({ layout })}
          />
          <SelectControl<EdgeLabel>
            label="Edge label"
            value={value.edgeLabel ?? "none"}
            options={[
              ["none", "None"],
              ["rate", "Request rate"],
              ["errors", "Error ratio"],
              ["latency", "Latency"],
              ["rate-latency", "Request rate and latency"],
            ]}
            onChange={(edgeLabel) => set({ edgeLabel })}
          />
          <OptionsEditorControl
            label="Node size by throughput"
            control={
              <Switch
                checked={value.nodeSizeByThroughput ?? false}
                onChange={(_, nodeSizeByThroughput) =>
                  set({ nodeSizeByThroughput })
                }
              />
            }
          />
          <OptionsEditorControl
            label="Show unconnected nodes"
            description="Keep services whose calls had no requests in the window"
            control={
              <Switch
                checked={value.showUnconnected ?? false}
                onChange={(_, showUnconnected) => set({ showUnconnected })}
              />
            }
          />
          <OptionsEditorControl
            label="Details panel"
            description="Click a node or edge to open its details on the right"
            control={
              <Switch
                checked={value.showDetails ?? true}
                onChange={(_, showDetails) => set({ showDetails })}
              />
            }
          />
          <OptionsEditorControl
            label="Full request time"
            description="Whole-trace duration from the requester to each node, from the trace datasource"
            control={
              <Switch
                checked={value.showFullRequestTime ?? true}
                onChange={(_, showFullRequestTime) =>
                  set({ showFullRequestTime })
                }
              />
            }
          />
          <OptionsEditorControl
            label="Show legend"
            control={
              <Switch
                checked={value.showLegend ?? true}
                onChange={(_, showLegend) => set({ showLegend })}
              />
            }
          />
        </OptionsEditorGroup>
        <OptionsEditorGroup title="Colour and latency">
          <SelectControl<EdgeColorBy>
            label="Colour by"
            value={value.edgeColorBy ?? "errors"}
            options={[
              ["errors", "Error ratio"],
              ["latency", "Latency"],
            ]}
            onChange={(edgeColorBy) => set({ edgeColorBy })}
          />
          <ThresholdControls
            label="Errors"
            unit="%"
            value={value.errorThresholds}
            defaults={DEFAULT_ERROR_THRESHOLDS}
            onChange={(errorThresholds) => set({ errorThresholds })}
          />
          <ThresholdControls
            label="Latency"
            unit="s"
            value={value.latencyThresholds}
            defaults={DEFAULT_LATENCY_THRESHOLDS}
            onChange={(latencyThresholds) => set({ latencyThresholds })}
          />
          <SelectControl<LatencyPercentile>
            label="Latency percentile"
            value={value.latencyPercentile ?? "p95"}
            options={[
              ["p50", "p50"],
              ["p90", "p90"],
              ["p95", "p95"],
              ["p99", "p99"],
            ]}
            onChange={(latencyPercentile) => set({ latencyPercentile })}
          />
          <SelectControl<LatencySource>
            label="Edge latency from"
            description="Server: time the callee took. Client: time the caller waited, network included"
            value={value.latencySource ?? "server"}
            options={[
              ["server", "Server side"],
              ["client", "Client side"],
            ]}
            onChange={(latencySource) => set({ latencySource })}
          />
        </OptionsEditorGroup>
      </OptionsEditorColumn>
    </OptionsEditorGrid>
  );
}
