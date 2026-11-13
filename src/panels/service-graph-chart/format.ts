/** Compact number formatting for tooltips and edge labels. */

function trim(n: number, digits: number): string {
  const s = n.toFixed(digits);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function formatRate(v: number): string {
  if (!Number.isFinite(v)) return "–";
  if (v === 0) return "0 req/s";
  if (v >= 1e6) return `${trim(v / 1e6, 1)}M req/s`;
  if (v >= 1e3) return `${trim(v / 1e3, 1)}k req/s`;
  if (v >= 100) return `${v.toFixed(0)} req/s`;
  if (v >= 10) return `${trim(v, 1)} req/s`;
  if (v >= 0.01) return `${trim(v, 2)} req/s`;
  return "<0.01 req/s";
}

/** `ratio` is 0..1. */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "–";
  const p = ratio * 100;
  if (p === 0) return "0%";
  if (p < 0.01) return "<0.01%";
  if (p < 10) return `${trim(p, 2)}%`;
  return `${trim(p, 1)}%`;
}

export function formatSeconds(s: number): string {
  if (!Number.isFinite(s)) return "–";
  if (s < 0.001) return `${trim(s * 1e6, 0)} µs`;
  if (s < 1) return `${trim(s * 1000, s < 0.01 ? 2 : s < 0.1 ? 1 : 0)} ms`;
  if (s < 60) return `${trim(s, 2)} s`;
  return `${trim(s / 60, 1)} min`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
