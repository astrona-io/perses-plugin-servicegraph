import { ReactElement } from "react";
import { Box, Typography } from "@mui/material";
import { NodeKind, ServiceGraph, Severity } from "./graph";
import { formatSeconds } from "./format";
import { ResolvedOptions } from "./service-graph-chart-types";

export interface LegendColors {
  severity: Record<Severity, string>;
  kind: Record<NodeKind, string>;
  externalBorder: string;
}

const KIND_ORDER: NodeKind[] = [
  "service",
  "database",
  "messaging",
  "user",
  "external",
];
const KIND_NAMES: Record<NodeKind, string> = {
  service: "Service",
  database: "Database",
  messaging: "Messaging",
  user: "User",
  external: "Uninstrumented",
};

function Shape({
  kind,
  colors,
}: {
  kind: NodeKind;
  colors: LegendColors;
}): ReactElement {
  const fill = colors.kind[kind];
  const stroke = kind === "external" ? colors.externalBorder : "none";
  const dash = kind === "external" ? "2 1.5" : undefined;
  let shape: ReactElement;
  switch (kind) {
    case "database":
      shape = <rect x="1" y="2.5" width="10" height="7" rx="2" fill={fill} />;
      break;
    case "messaging":
      shape = <path d="M6 1 L11 6 L6 11 L1 6 Z" fill={fill} />;
      break;
    case "user":
      shape = <path d="M6 1.5 L11 10.5 L1 10.5 Z" fill={fill} />;
      break;
    default:
      shape = (
        <circle
          cx="6"
          cy="6"
          r="4.6"
          fill={fill}
          stroke={stroke}
          strokeDasharray={dash}
        />
      );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      {shape}
    </svg>
  );
}

function Line({ color }: { color: string }): ReactElement {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
      <line
        x1="1"
        y1="6"
        x2="13"
        y2="6"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M12 2.5 L17 6 L12 9.5 Z" fill={color} />
    </svg>
  );
}

function Item({
  icon,
  label,
}: {
  icon: ReactElement;
  label: string;
}): ReactElement {
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
    >
      {icon}
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
    </Box>
  );
}

/** Colour key for edges and node rings, plus the node shapes that occur in the graph. */
export function Legend({
  graph,
  options: o,
  colors,
}: {
  graph: ServiceGraph;
  options: ResolvedOptions;
  colors: LegendColors;
}): ReactElement {
  const latency = o.edgeColorBy === "latency";
  const t = latency ? o.latencyThresholds : o.errorThresholds;
  const fmt = (v: number): string => (latency ? formatSeconds(v) : `${v}%`);
  const what = latency ? `${o.latencyPercentile} latency` : "errors";
  const kinds = KIND_ORDER.filter((k) => graph.nodes.some((n) => n.kind === k));

  return (
    <Box
      sx={{
        position: "absolute",
        left: 8,
        right: 8,
        bottom: 4,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        columnGap: 1.5,
        rowGap: 0.25,
        pointerEvents: "none",
      }}
    >
      <Item
        icon={<Line color={colors.severity.ok} />}
        label={`${what} < ${fmt(t.warning)}`}
      />
      <Item
        icon={<Line color={colors.severity.warning} />}
        label={`≥ ${fmt(t.warning)}`}
      />
      <Item
        icon={<Line color={colors.severity.critical} />}
        label={`≥ ${fmt(t.critical)}`}
      />
      <Box component="span" sx={{ width: 8 }} />
      {kinds.map((k) => (
        <Item
          key={k}
          icon={<Shape kind={k} colors={colors} />}
          label={KIND_NAMES[k]}
        />
      ))}
      <Box component="span" sx={{ width: 8 }} />
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        Width = req/s · click a node to focus
      </Typography>
    </Box>
  );
}
