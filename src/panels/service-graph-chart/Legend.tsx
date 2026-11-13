import { ReactElement, useId } from "react";
import { Box, Typography } from "@mui/material";
import { NodeKind, ServiceGraph, Severity } from "./graph";
import { formatSeconds } from "./format";
import { iconDataUrl } from "./icons";
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
  const external = kind === "external";
  return (
    <img
      src={iconDataUrl(kind, {
        fill: colors.kind[kind],
        ring: external ? colors.externalBorder : undefined,
        ringWidth: 2.5,
        dashed: external,
      })}
      width={14}
      height={14}
      alt=""
      aria-hidden="true"
    />
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

/** Line shading from the warning to the critical colour, for colouring by latency. */
function GradientLine({
  from,
  to,
}: {
  from: string;
  to: string;
}): ReactElement {
  // Unique per legend: several panels on one dashboard each define their gradient.
  const id = useId();
  return (
    <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <line
        x1="1"
        y1="6"
        x2="29"
        y2="6"
        stroke={`url(#${CSS.escape(id)})`}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M28 2.5 L33 6 L28 9.5 Z" fill={to} />
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
  rightInset = 0,
}: {
  graph: ServiceGraph;
  options: ResolvedOptions;
  colors: LegendColors;
  /** Width covered on the right, by the details panel. */
  rightInset?: number;
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
        right: 8 + rightInset,
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
      {latency ? (
        <Item
          icon={
            <GradientLine
              from={colors.severity.warning}
              to={colors.severity.critical}
            />
          }
          label={`${fmt(t.warning)} → ${fmt(t.critical)}+`}
        />
      ) : (
        <>
          <Item
            icon={<Line color={colors.severity.warning} />}
            label={`≥ ${fmt(t.warning)}`}
          />
          <Item
            icon={<Line color={colors.severity.critical} />}
            label={`≥ ${fmt(t.critical)}`}
          />
        </>
      )}
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
        Width = req/s · click a node to trace its flow
      </Typography>
    </Box>
  );
}
