import {
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  MenuItem,
  TextField,
  Theme,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { LoadingOverlay, useChartsTheme } from "@perses-dev/components";
import {
  GraphEdge,
  GraphNode,
  NodeKind,
  Percentiles,
  ServiceGraph,
  Severity,
  buildGraph,
  flowThrough,
  itemSeverity,
} from "./graph";
import { escapeHtml, formatPercent, formatRate, formatSeconds } from "./format";
import { iconDataUrl, iconFor } from "./icons";
import { forceLayout, hierarchicalLayout } from "./layout";
import { GraphCanvas } from "./GraphCanvas";
import { Legend, LegendColors } from "./Legend";
import {
  ResolvedOptions,
  ServiceGraphChartProps,
  TOOLTIP_PERCENTILES,
  resolveOptions,
} from "./service-graph-chart-types";
import { useServiceGraphData } from "./useServiceGraphData";
import { useFullRequestTime } from "./useFullRequestTime";
import { DetailPanel, Selection } from "./DetailPanel";
import { KIND_LABELS, itemColor } from "./style";

const NODE_SIZE = 34;
const MIN_NODE = 18;
const MAX_NODE = 56;
const FADED = 0.12;
// A small graph is spread out at most this much, so two nodes do not end up at opposite edges.
const MAX_UPSCALE = 1.6;
/** Picker value for "every flow". */
const ALL_FLOWS = "\u0000all";
/** Picker value for a `root` that is a pattern rather than one caller's name. */
const ROOT_PATTERN = "\u0000pattern";

export function ServiceGraphChartComponent(
  props: ServiceGraphChartProps,
): ReactElement | null {
  const { spec, contentDimensions } = props;
  const muiTheme = useTheme();
  const chartsTheme = useChartsTheme();
  const o = useMemo(() => resolveOptions(spec), [spec]);
  const { results, isLoading, error, namespacePattern, rootPattern } =
    useServiceGraphData(spec, o);

  // The requester picked in the panel; undefined follows the spec's `root` (usually a variable). It is
  // kept in the URL, so a reload or a shared link opens the same flow.
  const [picked, setPickedState] = useState<string | undefined>(
    readRequesterParam,
  );
  const setPicked = useCallback((v: string | undefined): void => {
    const next = v === ROOT_PATTERN ? undefined : v;
    setPickedState(next);
    writeRequesterParam(next);
  }, []);
  // A changed `root` (the variable) starts over from it. Only once data has loaded: until then the
  // variables are still resolving, and that must not drop a requester the URL brought.
  const settledRoot = useRef<string | undefined>();
  useEffect(() => {
    if (!results) return;
    if (
      settledRoot.current !== undefined &&
      settledRoot.current !== rootPattern
    )
      setPicked(undefined);
    settledRoot.current = rootPattern;
  }, [results, rootPattern, setPicked]);
  const flowPattern =
    picked === undefined
      ? rootPattern
      : picked === ALL_FLOWS
        ? ""
        : escapeRegex(picked);

  const graph: ServiceGraph | undefined = useMemo(
    () =>
      results
        ? buildGraph(results, o, namespacePattern, flowPattern)
        : undefined,
    [results, o, namespacePattern, flowPattern],
  );
  const pickerValue =
    picked ??
    (!rootPattern || rootPattern === ".*"
      ? ALL_FLOWS
      : graph?.callers.includes(rootPattern)
        ? rootPattern
        : ROOT_PATTERN);

  // The clicked node or edge: its flow is highlighted and its details shown.
  const [selection, setSelection] = useState<Selection | undefined>();
  useEffect(() => {
    if (
      selection &&
      !(selection.type === "node" ? graph?.nodes : graph?.edges)?.some(
        (x) => x.id === selection.id,
      )
    )
      setSelection(undefined);
  }, [graph, selection]);
  const selected =
    selection?.type === "edge"
      ? graph?.edges.find((e) => e.id === selection.id)?.target
      : selection?.id;

  // Full request time is per requester: traces whose root span is in a requester's service. A root
  // without spans of its own (the `user` entry point) stands for the services it calls.
  const requesters = useMemo(() => {
    if (!graph || graph.roots.length === 0) return undefined;
    const kinds = new Map(graph.nodes.map((n) => [n.id, n.kind]));
    const out = new Set<string>();
    for (const r of graph.roots) {
      const kind = kinds.get(r);
      if (kind === "user" || kind === "external") {
        for (const e of graph.edges) if (e.source === r) out.add(e.target);
      } else out.add(r);
    }
    return [...out].sort();
  }, [graph]);
  const full = useFullRequestTime(
    spec,
    o.showFullRequestTime && !!graph,
    requesters,
  );

  // Positions depend on the structure only, so a click or a refresh with the same edges keeps them.
  const structureKey = useMemo(
    () =>
      graph
        ? `${o.layout}|${graph.roots.join(",")}|${graph.nodes
            .map((n) => n.id)
            .join(",")}|${graph.edges.map((e) => e.id).join(",")}`
        : "",
    [graph, o.layout],
  );
  const positions = useMemo(() => {
    if (!graph) return new Map<string, { x: number; y: number }>();
    const ids = graph.nodes.map((n) => n.id);
    return o.layout === "hierarchical"
      ? hierarchicalLayout(ids, graph.edges, graph.roots)
      : forceLayout(ids, graph.edges, graph.roots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  const mode = muiTheme.palette.mode === "dark" ? "dark" : "light";
  const colors: LegendColors = useMemo(
    () => ({
      severity: {
        ok: alpha(muiTheme.palette.text.primary, mode === "dark" ? 0.45 : 0.35),
        none: alpha(
          muiTheme.palette.text.primary,
          mode === "dark" ? 0.45 : 0.35,
        ),
        warning: mode === "dark" ? "#f2b632" : "#d98e04",
        critical: mode === "dark" ? "#ff6b6b" : "#d32f2f",
      },
      kind: {
        service: mode === "dark" ? "#5b9bf0" : "#2f6fd6",
        database: mode === "dark" ? "#b18cf2" : "#7a52c7",
        messaging: mode === "dark" ? "#4cc3b5" : "#1f8a7e",
        user: mode === "dark" ? "#9aa3ad" : "#77808a",
        external: alpha(muiTheme.palette.text.primary, 0.12),
      },
      externalBorder: alpha(muiTheme.palette.text.primary, 0.5),
    }),
    [muiTheme, mode],
  );

  const onNodeClick = useCallback(
    (id: string) =>
      setSelection((cur) =>
        cur?.type === "node" && cur.id === id
          ? undefined
          : { type: "node", id },
      ),
    [],
  );
  const onEdgeClick = useCallback(
    (id: string) =>
      setSelection((cur) =>
        cur?.type === "edge" && cur.id === id
          ? undefined
          : { type: "edge", id },
      ),
    [],
  );
  const onBlankClick = useCallback(() => setSelection(undefined), []);

  const width = contentDimensions?.width ?? 0;
  const height = contentDimensions?.height ?? 0;
  const detailsOpen = o.showDetails && !!selection && !!graph;
  const detailsWidth = Math.round(Math.min(360, Math.max(260, width * 0.32)));
  // A wide panel makes room for the details; a narrow one lets them cover the graph.
  const reserved =
    detailsOpen && width - detailsWidth >= 360 ? detailsWidth : 0;
  const box = useMemo(
    () =>
      fitBox(
        positions,
        width - reserved,
        height,
        o.showLegend,
        o.showRequesterPicker,
      ),
    [positions, width, reserved, height, o.showLegend, o.showRequesterPicker],
  );

  const fullByNode = o.showFullRequestTime ? full.byNode : undefined;
  const option = useMemo(() => {
    if (!graph) return undefined;
    return buildOption(
      graph,
      positions,
      o,
      colors,
      selected,
      muiTheme,
      box,
      fullByNode,
    );
  }, [graph, positions, o, colors, selected, muiTheme, box, fullByNode]);

  if (!contentDimensions) return null;

  const empty = graph && graph.nodes.length === 0;
  let message: string | undefined;
  if (error) message = error.message;
  else if (empty && flowPattern && graph.callers.length > 0)
    message = "No calls from this requester in the time range.";
  else if (empty)
    message = namespacePattern
      ? `No requests for namespace "${namespacePattern}". If the graph is empty for every namespace, check that the generator adds the ${o.clientNamespaceLabel} / ${o.serverNamespaceLabel} dimensions.`
      : "No data";

  return (
    <Box
      sx={{
        position: "relative",
        width: contentDimensions.width,
        height: contentDimensions.height,
      }}
    >
      {isLoading && !graph ? <LoadingOverlay /> : null}
      {message ? (
        <Typography
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            px: 3,
            color: error ? "error.main" : "text.secondary",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          {message}
        </Typography>
      ) : null}
      {option && !message ? (
        <GraphCanvas
          option={option}
          theme={chartsTheme.echartsTheme}
          width={contentDimensions.width}
          height={contentDimensions.height}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onBlankClick={onBlankClick}
        />
      ) : null}
      {o.showLegend && graph && !message ? (
        <Legend
          graph={graph}
          options={o}
          colors={colors}
          rightInset={reserved}
        />
      ) : null}
      {o.showRequesterPicker && graph && graph.callers.length > 0 ? (
        <RequesterPicker
          value={pickerValue}
          graph={graph}
          rootPattern={rootPattern}
          colors={colors}
          onChange={setPicked}
        />
      ) : null}
      {detailsOpen && !message ? (
        <DetailPanel
          selection={selection!}
          graph={graph!}
          o={o}
          colors={colors}
          width={detailsWidth}
          full={full}
          requesterLabel={
            graph!.roots.length > 0 ? graph!.roots.join(", ") : undefined
          }
          onSelect={setSelection}
          onStartFlow={(id) => {
            setPicked(id);
            setSelection(undefined);
          }}
          onClose={onBlankClick}
        />
      ) : null}
    </Box>
  );
}

/**
 * Who the flow starts from: the `user` entry point or a service. One requester at a time, so the graph
 * reads left to right from a single source to every call its requests lead to.
 */
function RequesterPicker({
  value,
  graph,
  rootPattern,
  colors,
  onChange,
}: {
  value: string;
  graph: ServiceGraph;
  rootPattern: string;
  colors: LegendColors;
  onChange: (v: string) => void;
}): ReactElement {
  const kinds = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  return (
    <TextField
      select
      size="small"
      label="Requester"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{
        position: "absolute",
        top: 4,
        left: 8,
        zIndex: 2,
        minWidth: 180,
        maxWidth: "60%",
        bgcolor: "background.paper",
        "& .MuiSelect-select": {
          display: "flex",
          alignItems: "center",
          gap: 1,
          py: 0.5,
          fontSize: 13,
        },
      }}
    >
      <MenuItem value={ALL_FLOWS}>All flows</MenuItem>
      {value === ROOT_PATTERN ? (
        <MenuItem value={ROOT_PATTERN}>Matching {rootPattern}</MenuItem>
      ) : null}
      {/* A picked requester with no calls in the current range stays selectable. */}
      {[
        ...(value !== ALL_FLOWS &&
        value !== ROOT_PATTERN &&
        !graph.callers.includes(value)
          ? [value]
          : []),
        ...graph.callers,
      ].map((id) => {
        const kind: NodeKind =
          kinds.get(id) ?? (id === "user" ? "user" : "service");
        return (
          <MenuItem
            key={id}
            value={id}
            sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: 13 }}
          >
            <img
              src={iconDataUrl(iconFor(id, kind), { fill: colors.kind[kind] })}
              width={16}
              height={16}
              alt=""
              aria-hidden="true"
            />
            {id}
          </MenuItem>
        );
      })}
    </TextField>
  );
}

/** URL query parameter holding the picked requester; `*` is "All flows". */
const REQUESTER_PARAM = "requester";

function readRequesterParam(): string | undefined {
  const v = new URLSearchParams(window.location.search).get(REQUESTER_PARAM);
  if (!v) return undefined;
  return v === "*" ? ALL_FLOWS : v;
}

/**
 * Replaces the current history entry, keeping its state and every other parameter. The `popstate`
 * tells the app's router about the new URL; without it, the next time range or variable change
 * rebuilds the URL from the router's copy and drops the parameter.
 */
function writeRequesterParam(v: string | undefined): void {
  const url = new URL(window.location.href);
  if (v === undefined) url.searchParams.delete(REQUESTER_PARAM);
  else url.searchParams.set(REQUESTER_PARAM, v === ALL_FLOWS ? "*" : v);
  if (url.href === window.location.href) return;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(
    new PopStateEvent("popstate", { state: window.history.state }),
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nodeSize(n: GraphNode, max: number, o: ResolvedOptions): number {
  if (!o.nodeSizeByThroughput || max <= 0) return NODE_SIZE;
  return MIN_NODE + (MAX_NODE - MIN_NODE) * Math.sqrt(n.throughput / max);
}

function edgeWidth(e: GraphEdge, max: number): number {
  if (max <= 0) return 1;
  return 1 + 6 * (Math.log1p(e.rate) / Math.log1p(max));
}

function severityLabel(s: Severity, o: ResolvedOptions): string {
  if (s === "none" || s === "ok") return "";
  const t =
    o.edgeColorBy === "latency" ? o.latencyThresholds : o.errorThresholds;
  const v = s === "critical" ? t.critical : t.warning;
  return o.edgeColorBy === "latency"
    ? `≥ ${formatSeconds(v)} ${o.latencyPercentile}`
    : `≥ ${v}% errors`;
}

function edgeLabelText(e: GraphEdge, o: ResolvedOptions): string {
  switch (o.edgeLabel) {
    case "rate":
      return formatRate(e.rate);
    case "errors":
      return formatPercent(e.errorRatio);
    case "latency":
      return formatSeconds(e.latency);
    case "rate-latency":
      // No latency line when the histogram had no samples for this edge.
      return Number.isFinite(e.latency)
        ? `${formatRate(e.rate)}\n${o.latencyPercentile} ${formatSeconds(e.latency)}`
        : formatRate(e.rate);
    default:
      return "";
  }
}

type MuiTheme = Theme;

interface SeriesBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where the graph goes in the panel. ECharts stretches the node bounding box to fill the series box,
 * so a box with another aspect ratio than the layout squashes the graph (and turns circles into
 * ellipses). This keeps the layout's aspect ratio, centres it, and caps how far a small graph is blown up.
 */
function fitBox(
  positions: Map<string, { x: number; y: number }>,
  width: number,
  height: number,
  showLegend: boolean,
  showPicker: boolean,
): SeriesBox {
  const pad = {
    left: 70,
    right: 70,
    top: showPicker ? 56 : 28,
    bottom: showLegend ? 64 : 32,
  };
  const availW = Math.max(1, width - pad.left - pad.right);
  const availH = Math.max(1, height - pad.top - pad.bottom);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX))
    return { left: pad.left, top: pad.top, width: availW, height: availH };
  // ECharts widens a zero-size side to 2 units; do the same so the aspect ratio matches.
  const bw = maxX - minX || 2;
  const bh = maxY - minY || 2;
  const scale = Math.min(availW / bw, availH / bh, MAX_UPSCALE);
  const w = bw * scale;
  const h = bh * scale;
  return {
    left: pad.left + (availW - w) / 2,
    top: pad.top + (availH - h) / 2,
    width: w,
    height: h,
  };
}

function buildOption(
  graph: ServiceGraph,
  positions: Map<string, { x: number; y: number }>,
  o: ResolvedOptions,
  colors: LegendColors,
  selected: string | undefined,
  muiTheme: MuiTheme,
  box: SeriesBox,
  full: Map<string, Percentiles> | undefined,
): object {
  const text = muiTheme.palette.text;
  const paper = muiTheme.palette.background.paper;
  const maxThroughput = Math.max(0, ...graph.nodes.map((n) => n.throughput));
  const maxRate = Math.max(0, ...graph.edges.map((e) => e.rate));
  const pct = o.latencyPercentile;

  // The flow through the clicked node, upstream and downstream: everything else fades.
  const flow = selected ? flowThrough(graph.edges, selected) : undefined;
  const focus = flow?.nodes;
  const roots = new Set(graph.roots);
  const pairs = new Set(graph.edges.map((e) => `${e.source}\u0000${e.target}`));
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  const nodes = graph.nodes.map((n) => {
    const p = positions.get(n.id) ?? { x: 0, y: 0 };
    const sev = itemSeverity(n, o);
    const size = nodeSize(n, maxThroughput, o);
    const faded = focus ? !focus.has(n.id) : false;
    const outOfScope = !n.inScope;
    const opacity = faded ? FADED : outOfScope ? 0.45 : 1;
    const ring = sev === "warning" || sev === "critical";
    const ringColor = itemColor(n, o, colors);
    return {
      id: n.id,
      name: n.id,
      x: p.x,
      y: p.y,
      // The ring is part of the icon image: ECharts does not draw borders around image symbols.
      symbol: `image://${iconDataUrl(iconFor(n.id, n.kind), {
        fill: colors.kind[n.kind],
        ring: ring
          ? ringColor
          : n.kind === "external"
            ? colors.externalBorder
            : undefined,
        ringWidth: ring ? 5 : 2.5,
        dashed: !ring && n.kind === "external",
      })}`,
      symbolSize: size,
      raw: n,
      itemStyle: {
        color: colors.kind[n.kind],
        opacity,
      },
      label: {
        show: true,
        position: "bottom",
        distance: 4,
        fontSize: 11,
        color: outOfScope ? text.secondary : text.primary,
        // The requester the flow starts from.
        fontWeight: roots.has(n.id) ? 700 : 400,
        // Keeps names readable where an edge runs under them.
        textBorderColor: paper,
        textBorderWidth: 3,
        opacity: faded ? 0.25 : 1,
        // A function, not a string: ECharts would read `{...}` in a name as a template.
        formatter: () =>
          outOfScope && n.namespace ? `${n.id}\n(${n.namespace})` : n.id,
      },
      emphasis: { disabled: faded },
    };
  });

  const links = graph.edges.map((e) => {
    const reverse = pairs.has(`${e.target}\u0000${e.source}`);
    const faded = flow ? !flow.edges.has(e.id) : false;
    const out =
      !nodesById.get(e.source)?.inScope || !nodesById.get(e.target)?.inScope;
    const label = edgeLabelText(e, o);
    return {
      source: e.source,
      target: e.target,
      raw: e,
      lineStyle: {
        color: itemColor(e, o, colors),
        width: edgeWidth(e, maxRate),
        opacity: faded ? 0.06 : out ? 0.4 : 0.9,
        curveness: reverse ? 0.2 : o.layout === "force" ? 0.06 : 0,
      },
      label: { show: label !== "", opacity: faded ? 0.2 : 1 },
      emphasis: { disabled: faded },
    };
  });

  // Roots start the flow, so their full request time is their own.
  const fullRequestRow = (id: string): Array<[string, string]> => {
    const v = full?.get(id)?.[pct];
    return v !== undefined && Number.isFinite(v) && !roots.has(id)
      ? [[`Full request ${pct}`, formatSeconds(v)]]
      : [];
  };
  const nodeTooltip = (n: GraphNode): string => {
    const rows: Array<[string, string]> = [];
    if (n.inRate > 0) {
      rows.push(["Requests in", formatRate(n.inRate)]);
      rows.push(["Errors", formatPercent(n.inFailed / n.inRate)]);
      rows.push(...latencyRows(n.percentiles, pct));
    }
    rows.push(...fullRequestRow(n.id));
    if (n.outRate > 0) {
      rows.push(["Requests out", formatRate(n.outRate)]);
      if (n.inRate <= 0)
        rows.push([
          "Errors (client view)",
          formatPercent(n.outFailed / n.outRate),
        ]);
    }
    const sev = severityLabel(itemSeverity(n, o), o);
    return tooltipHtml(
      escapeHtml(n.id),
      escapeHtml(
        [KIND_LABELS[n.kind], n.namespace ? `namespace ${n.namespace}` : ""]
          .filter(Boolean)
          .join(" · "),
      ),
      rows,
      sev,
      sev ? itemColor(n, o, colors) : "",
    );
  };
  const edgeTooltip = (e: GraphEdge): string => {
    const rows: Array<[string, string]> = [
      ["Requests", formatRate(e.rate)],
      [
        "Errors",
        `${formatPercent(e.errorRatio)} (${formatRate(e.failedRate)})`,
      ],
      ...latencyRows(e.percentiles, pct),
      ...fullRequestRow(e.target),
    ];
    const sev = severityLabel(itemSeverity(e, o), o);
    return tooltipHtml(
      `${escapeHtml(e.source)} → ${escapeHtml(e.target)}`,
      escapeHtml(
        [e.connectionType.replace(/_/g, " "), `${o.latencySource}-side latency`]
          .filter(Boolean)
          .join(" · "),
      ),
      rows,
      sev,
      sev ? itemColor(e, o, colors) : "",
    );
  };

  return {
    animation: false,
    tooltip: {
      trigger: "item",
      confine: true,
      enterable: false,
      formatter: (params: {
        dataType?: string;
        data?: { raw?: GraphNode | GraphEdge };
      }): string => {
        const raw = params.data?.raw;
        if (!raw) return "";
        return params.dataType === "edge"
          ? edgeTooltip(raw as GraphEdge)
          : nodeTooltip(raw as GraphNode);
      },
    },
    series: [
      {
        type: "graph",
        layout: "none",
        roam: true,
        draggable: false,
        // Room for labels under the bottom row and for the legend; see fitBox.
        ...box,
        scaleLimit: { min: 0.2, max: 6 },
        edgeLabel: {
          show: o.edgeLabel !== "none",
          fontSize: 10,
          color: text.secondary,
          textBorderColor: paper,
          textBorderWidth: 2,
          formatter: (params: { data?: { raw?: GraphEdge } }): string =>
            params.data?.raw ? edgeLabelText(params.data.raw, o) : "",
        },
        edgeSymbol: ["none", "arrow"],
        edgeSymbolSize: [0, 8],
        emphasis: {
          focus: selected ? "none" : "adjacency",
          lineStyle: { opacity: 1 },
          label: { show: true },
        },
        blur: {
          itemStyle: { opacity: FADED },
          lineStyle: { opacity: 0.06 },
          label: { opacity: 0.25 },
        },
        data: nodes,
        links,
      },
    ],
  };
}

/** One row per tooltip percentile that has a value; the configured one is marked. */
function latencyRows(
  percentiles: Record<string, number>,
  configured: string,
): Array<[string, string]> {
  return TOOLTIP_PERCENTILES.filter(([name]) =>
    Number.isFinite(percentiles[name]),
  ).map(([name]) => [
    `Latency ${name}${name === configured ? " ●" : ""}`,
    formatSeconds(percentiles[name]!),
  ]);
}

function tooltipHtml(
  title: string,
  subtitle: string,
  rows: Array<[string, string]>,
  status: string,
  statusColor: string,
): string {
  const body = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding-right:12px;opacity:.75">${escapeHtml(k)}</td><td style="text-align:right;font-weight:600">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return [
    `<div style="font-weight:600">${title}</div>`,
    subtitle ? `<div style="opacity:.7;font-size:11px">${subtitle}</div>` : "",
    `<table style="margin-top:4px;border-collapse:collapse">${body}</table>`,
    status
      ? `<div style="margin-top:4px;font-size:11px;color:${statusColor}">● ${escapeHtml(status)}</div>`
      : "",
  ].join("");
}
