import { NodeKind, itemSeverity } from "./graph";
import { LegendColors } from "./Legend";
import { ResolvedOptions } from "./service-graph-chart-types";

export const KIND_LABELS: Record<NodeKind, string> = {
  service: "Service",
  database: "Database",
  messaging: "Messaging",
  user: "User / unknown caller",
  external: "Uninstrumented",
};

function hexToRgb(hex: string): [number, number, number] | undefined {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return undefined;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  const c = ca.map((v, i) => Math.round(v + (cb[i]! - v) * t));
  return `rgb(${c.join(",")})`;
}

/**
 * Edge and ring colour. By latency it is a gradient: neutral under the warning threshold, then from the
 * warning colour at the warning threshold to the critical colour at the critical one (on a log scale,
 * so 100 ms to 1 s has its midpoint at about 316 ms). By errors it steps at the two thresholds.
 */
export function itemColor(
  item: { errorRatio: number; latency: number },
  o: ResolvedOptions,
  colors: LegendColors,
): string {
  if (o.edgeColorBy !== "latency")
    return colors.severity[itemSeverity(item, o)];
  const { warning, critical } = o.latencyThresholds;
  const l = item.latency;
  if (!Number.isFinite(l) || l < warning) return colors.severity.ok;
  if (l >= critical || critical <= warning || warning <= 0)
    return colors.severity.critical;
  const t = Math.log(l / warning) / Math.log(critical / warning);
  return mix(colors.severity.warning, colors.severity.critical, t);
}
