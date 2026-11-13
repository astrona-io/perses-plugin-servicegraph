import { PanelPlugin } from "@perses-dev/plugin-system";
import { ServiceGraphChartComponent } from "./ServiceGraphChartComponent";
import {
  ServiceGraphChartOptions,
  ServiceGraphChartProps,
  createInitialServiceGraphChartOptions,
} from "./service-graph-chart-types";
import { ServiceGraphChartSettingsEditor } from "./ServiceGraphChartSettingsEditor";

/**
 * Service graph of the requests between services, from Prometheus service-graph metrics.
 *
 * The panel builds and runs its own PromQL (through the selected Prometheus datasource) instead of
 * taking the panel's queries: it needs four related queries whose labels must line up, and they all
 * follow from a handful of settings (metric prefix, label names, filters).
 */
export const ServiceGraphChart: PanelPlugin<
  ServiceGraphChartOptions,
  ServiceGraphChartProps
> = {
  PanelComponent: ServiceGraphChartComponent,
  panelOptionsEditorComponents: [
    { label: "Settings", content: ServiceGraphChartSettingsEditor },
  ],
  hideQueryEditor: true,
  createInitialOptions: createInitialServiceGraphChartOptions,
};
