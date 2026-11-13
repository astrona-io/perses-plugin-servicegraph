import { ReactElement, ReactNode } from "react";
import {
  Box,
  Button,
  ButtonBase,
  IconButton,
  SvgIcon,
  Typography,
} from "@mui/material";
import { GraphEdge, GraphNode, Percentiles, ServiceGraph } from "./graph";
import { formatPercent, formatRate, formatSeconds } from "./format";
import { iconDataUrl, iconFor } from "./icons";
import { LegendColors } from "./Legend";
import { FullRequestTime } from "./useFullRequestTime";
import {
  ResolvedOptions,
  TOOLTIP_PERCENTILES,
} from "./service-graph-chart-types";
import { KIND_LABELS, itemColor } from "./style";

export type Selection = { type: "node" | "edge"; id: string };

interface DetailPanelProps {
  selection: Selection;
  graph: ServiceGraph;
  o: ResolvedOptions;
  colors: LegendColors;
  width: number;
  full: FullRequestTime;
  /** Who the drawn flow starts from, for the full request time caption; undefined for every flow. */
  requesterLabel: string | undefined;
  onSelect: (s: Selection) => void;
  onStartFlow: (id: string) => void;
  onClose: () => void;
}

const CLOSE =
  "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6Z";

/**
 * Everything known about the clicked node or edge: request rate, errors, the latency percentiles, the
 * full request time from the requester, and the calls in and out, each one a link to its own details.
 */
export function DetailPanel(props: DetailPanelProps): ReactElement | null {
  const { selection, graph, o, colors, width, onClose } = props;
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const edge =
    selection.type === "edge"
      ? graph.edges.find((e) => e.id === selection.id)
      : undefined;
  const node = selection.type === "node" ? nodes.get(selection.id) : undefined;
  if (!edge && !node) return null;

  return (
    <Box
      role="complementary"
      aria-label="Details"
      sx={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width,
        zIndex: 3,
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        borderLeft: 1,
        borderColor: "divider",
        boxShadow: 4,
        fontSize: 13,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
          p: 1.5,
          pb: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {node ? <NodeIcon node={node} colors={colors} size={28} /> : null}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{ fontWeight: 600, fontSize: 14, wordBreak: "break-all" }}
          >
            {node ? node.id : `${edge!.source} → ${edge!.target}`}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
            {node
              ? [
                  KIND_LABELS[node.kind],
                  node.namespace ? `namespace ${node.namespace}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
              : [
                  edge!.connectionType.replace(/_/g, " ") || "call",
                  `${o.latencySource}-side latency`,
                ].join(" · ")}
          </Typography>
        </Box>
        <IconButton size="small" aria-label="Close details" onClick={onClose}>
          <SvgIcon sx={{ fontSize: 18 }}>
            <path d={CLOSE} />
          </SvgIcon>
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 1.5, pt: 1 }}>
        {node ? (
          <NodeDetails {...props} node={node} nodes={nodes} />
        ) : (
          <EdgeDetails {...props} edge={edge!} nodes={nodes} />
        )}
      </Box>
    </Box>
  );
}

function NodeDetails(
  props: DetailPanelProps & { node: GraphNode; nodes: Map<string, GraphNode> },
): ReactElement {
  const { node: n, graph, o, colors, nodes, onSelect, onStartFlow } = props;
  const incoming = graph.edges
    .filter((e) => e.target === n.id)
    .sort((a, b) => b.rate - a.rate);
  const outgoing = graph.edges
    .filter((e) => e.source === n.id)
    .sort((a, b) => b.rate - a.rate);
  const isRoot = graph.roots.includes(n.id);
  return (
    <>
      {!isRoot ? <FullRequestSection {...props} target={n.id} /> : null}
      <Section title="Traffic">
        {n.inRate > 0 ? (
          <>
            <Row label="Requests in" value={formatRate(n.inRate)} />
            <Row
              label="Errors"
              value={`${formatPercent(n.inFailed / n.inRate)} (${formatRate(n.inFailed)})`}
              color={n.inFailed > 0 ? colors.severity.critical : undefined}
            />
          </>
        ) : null}
        {n.outRate > 0 ? (
          <>
            <Row label="Requests out" value={formatRate(n.outRate)} />
            <Row
              label="Errors (client view)"
              value={formatPercent(n.outFailed / n.outRate)}
              color={n.outFailed > 0 ? colors.severity.critical : undefined}
            />
          </>
        ) : null}
      </Section>
      {n.inRate > 0 ? (
        <PercentileSection
          title={`Latency (${o.latencySource} side)`}
          percentiles={n.percentiles}
          o={o}
          colors={colors}
        />
      ) : null}
      <CallList
        title="Called by"
        edges={incoming}
        other={(e) => e.source}
        {...{ o, colors, nodes, onSelect }}
      />
      <CallList
        title="Calls"
        edges={outgoing}
        other={(e) => e.target}
        {...{ o, colors, nodes, onSelect }}
      />
      {o.showRequesterPicker && graph.callers.includes(n.id) && !isRoot ? (
        <Button
          size="small"
          variant="outlined"
          fullWidth
          sx={{ mt: 1.5 }}
          onClick={() => onStartFlow(n.id)}
        >
          Show the flow from {n.id}
        </Button>
      ) : null}
    </>
  );
}

function EdgeDetails(
  props: DetailPanelProps & { edge: GraphEdge; nodes: Map<string, GraphNode> },
): ReactElement {
  const { edge: e, o, colors, nodes, onSelect } = props;
  return (
    <>
      <FullRequestSection {...props} target={e.target} />
      <Section title="Traffic">
        <Row label="Requests" value={formatRate(e.rate)} />
        <Row
          label="Errors"
          value={`${formatPercent(e.errorRatio)} (${formatRate(e.failedRate)})`}
          color={e.failedRate > 0 ? colors.severity.critical : undefined}
        />
      </Section>
      <PercentileSection
        title={`Latency (${o.latencySource} side)`}
        percentiles={e.percentiles}
        o={o}
        colors={colors}
      />
      <Section title="Between">
        {[e.source, e.target].map((id) => {
          const n = nodes.get(id);
          return (
            <LinkRow
              key={id}
              onClick={() => onSelect({ type: "node", id })}
              icon={n ? <NodeIcon node={n} colors={colors} size={16} /> : null}
              label={id}
              value={id === e.source ? "caller" : "callee"}
            />
          );
        })}
      </Section>
    </>
  );
}

/**
 * How long whole requests from the requester take when they reach `target`: the trace duration, root
 * span start to last span end, not the time of this one hop.
 */
function FullRequestSection(
  props: DetailPanelProps & { target: string },
): ReactElement | null {
  const { o, colors, full, target, requesterLabel } = props;
  if (!o.showFullRequestTime) return null;
  const p = full.byNode?.get(target);
  const range = formatRange(full.rangeSeconds);
  const caption = `Whole traces ${requesterLabel ? `started by ${requesterLabel} ` : ""}that reach ${target}, first span to last · ${full.clamped ? `last ${range} (Tempo limit)` : range}`;
  let body: ReactNode;
  if (full.error)
    body = (
      <Typography sx={{ fontSize: 12, color: "error.main" }}>
        {full.error.message}
      </Typography>
    );
  else if (!full.byNode && full.isLoading)
    body = (
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
        Loading…
      </Typography>
    );
  else if (!p || !Number.isFinite(p[o.latencyPercentile]))
    body = (
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
        No traces {requesterLabel ? `from ${requesterLabel} ` : ""}reached{" "}
        {target} in the last {range}.
      </Typography>
    );
  else {
    const main = p[o.latencyPercentile]!;
    body = (
      <>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography
            sx={{
              fontSize: 22,
              fontWeight: 600,
              color: latencyColor(main, o, colors),
            }}
          >
            {formatSeconds(main)}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {o.latencyPercentile}
          </Typography>
        </Box>
        <PercentileChips percentiles={p} o={o} colors={colors} />
      </>
    );
  }
  return (
    <Section title="Full request time">
      {body}
      <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>
        {caption}
      </Typography>
    </Section>
  );
}

function PercentileSection({
  title,
  percentiles,
  o,
  colors,
}: {
  title: string;
  percentiles: Percentiles;
  o: ResolvedOptions;
  colors: LegendColors;
}): ReactElement | null {
  const rows = TOOLTIP_PERCENTILES.filter(([name]) =>
    Number.isFinite(percentiles[name]),
  );
  if (rows.length === 0) return null;
  return (
    <Section title={title}>
      {rows.map(([name]) => (
        <Row
          key={name}
          label={name}
          strong={name === o.latencyPercentile}
          value={formatSeconds(percentiles[name]!)}
          color={latencyColor(percentiles[name]!, o, colors)}
        />
      ))}
    </Section>
  );
}

function PercentileChips({
  percentiles,
  o,
  colors,
}: {
  percentiles: Percentiles;
  o: ResolvedOptions;
  colors: LegendColors;
}): ReactElement {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
      {TOOLTIP_PERCENTILES.filter(([name]) =>
        Number.isFinite(percentiles[name]),
      ).map(([name]) => (
        <Box
          key={name}
          sx={{
            px: 0.75,
            py: 0.25,
            borderRadius: 1,
            border: 1,
            borderColor: "divider",
            fontSize: 11,
          }}
        >
          <Box component="span" sx={{ color: "text.secondary" }}>
            {name}{" "}
          </Box>
          <Box
            component="span"
            sx={{
              fontWeight: 600,
              color: latencyColor(percentiles[name]!, o, colors),
            }}
          >
            {formatSeconds(percentiles[name]!)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function CallList({
  title,
  edges,
  other,
  o,
  colors,
  nodes,
  onSelect,
}: {
  title: string;
  edges: GraphEdge[];
  other: (e: GraphEdge) => string;
  o: ResolvedOptions;
  colors: LegendColors;
  nodes: Map<string, GraphNode>;
  onSelect: (s: Selection) => void;
}): ReactElement | null {
  if (edges.length === 0) return null;
  return (
    <Section title={`${title} (${edges.length})`}>
      {edges.map((e) => {
        const id = other(e);
        const n = nodes.get(id);
        return (
          <LinkRow
            key={e.id}
            onClick={() => onSelect({ type: "edge", id: e.id })}
            icon={n ? <NodeIcon node={n} colors={colors} size={16} /> : null}
            label={id}
            value={
              Number.isFinite(e.latency)
                ? `${formatRate(e.rate)} · ${formatSeconds(e.latency)}`
                : formatRate(e.rate)
            }
            color={itemColor(e, o, colors)}
          />
        );
      })}
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Box sx={{ mt: 1.25 }}>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "text.secondary",
          mb: 0.5,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Row({
  label,
  value,
  color,
  strong,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}): ReactElement {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        gap: 1,
        py: 0.25,
        fontSize: 12,
      }}
    >
      <Box sx={{ color: "text.secondary", fontWeight: strong ? 600 : 400 }}>
        {label}
        {strong ? " ●" : ""}
      </Box>
      <Box sx={{ fontWeight: 600, color }}>{value}</Box>
    </Box>
  );
}

function LinkRow({
  icon,
  label,
  value,
  color,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color?: string;
  onClick: () => void;
}): ReactElement {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: 1,
        px: 0.5,
        py: 0.5,
        borderRadius: 1,
        textAlign: "left",
        fontSize: 12,
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      {icon}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={label}
      >
        {label}
      </Box>
      {color ? (
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: color,
            flexShrink: 0,
          }}
        />
      ) : null}
      <Box sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>{value}</Box>
    </ButtonBase>
  );
}

function NodeIcon({
  node,
  colors,
  size,
}: {
  node: GraphNode;
  colors: LegendColors;
  size: number;
}): ReactElement {
  return (
    <img
      src={iconDataUrl(iconFor(node.id, node.kind), {
        fill: colors.kind[node.kind],
      })}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    />
  );
}

/** Text colour for a latency: the edge gradient, but plain text below the warning threshold. */
function latencyColor(
  seconds: number,
  o: ResolvedOptions,
  colors: LegendColors,
): string | undefined {
  if (!(seconds >= o.latencyThresholds.warning)) return undefined;
  return itemColor(
    { errorRatio: 0, latency: seconds },
    { ...o, edgeColorBy: "latency" },
    colors,
  );
}

function formatRange(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
  return `${Math.round(seconds / 60)} min`;
}
