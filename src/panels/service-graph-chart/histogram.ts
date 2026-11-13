/**
 * Quantiles from Prometheus histogram buckets, computed in the browser. The panel fetches the bucket
 * rates once per edge and node and reads every percentile it shows (the configured one for colours and
 * labels, p25 to p99 for tooltips) from them, instead of one `histogram_quantile` query per percentile.
 */

/** Cumulative bucket counts (or rates) keyed by upper bound; `+Inf` is `Infinity`. */
export type Buckets = Map<number, number>;

/** Adds one `le` sample to a bucket set, summing series that share an upper bound. */
export function addBucket(buckets: Buckets, le: string, value: number): void {
  const bound = le === "+Inf" ? Infinity : Number(le);
  if (Number.isNaN(bound) || !Number.isFinite(value)) return;
  buckets.set(bound, (buckets.get(bound) ?? 0) + value);
}

/**
 * The same interpolation as PromQL's `histogram_quantile`: linear within the bucket the rank falls in,
 * the lower bound of the `+Inf` bucket when it falls there, NaN without a `+Inf` bucket or without
 * observations.
 */
export function histogramQuantile(
  q: number,
  buckets: Buckets | undefined,
): number {
  if (!buckets || buckets.size < 2) return NaN;
  const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  if (sorted[sorted.length - 1]![0] !== Infinity) return NaN;
  // Rates of separate series can come out slightly non-monotonic; Prometheus evens that out too.
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i]![1] < sorted[i - 1]![1]) sorted[i]![1] = sorted[i - 1]![1];
  const total = sorted[sorted.length - 1]![1];
  if (!(total > 0)) return NaN;
  const rank = q * total;
  let b = sorted.findIndex(([, count]) => count >= rank);
  if (b < 0) b = sorted.length - 1;
  if (b === sorted.length - 1)
    return sorted.length > 1 ? sorted[b - 1]![0] : NaN;
  const [upper, count] = sorted[b]!;
  if (b === 0 && upper <= 0) return upper;
  const lower = b === 0 ? 0 : sorted[b - 1]![0];
  const below = b === 0 ? 0 : sorted[b - 1]![1];
  return count === below
    ? upper
    : lower + (upper - lower) * ((rank - below) / (count - below));
}
