/**
 * Whether `values` are two kinds rather than one, and where they divide: the division (Otsu's, the one that best
 * separates the two means) is kept only when two normal kinds, each with its own mean and spread, explain the values
 * better than one by BIC. `floor` is the smallest variance a kind can have: the values' own quantization.
 */
export function splitTwo(values: readonly number[], floor: number): { threshold: number } | null {
  const n = values.length;
  if (n < 4) return null;
  const sorted = Float64Array.from(values).sort();
  const prefix = new Float64Array(n + 1),
    prefix2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i]! + sorted[i]!;
    prefix2[i + 1] = prefix2[i]! + sorted[i]! ** 2;
  }
  const variance = (a: number, b: number) => {
    const m = b - a,
      mean = (prefix[b]! - prefix[a]!) / m;
    return Math.max(floor, (prefix2[b]! - prefix2[a]!) / m - mean * mean);
  };
  let best = { i: -1, between: -1 };
  for (let i = 2; i <= n - 2; i++) {
    if (sorted[i - 1] === sorted[i]) continue;
    const m0 = prefix[i]! / i,
      m1 = (prefix[n]! - prefix[i]!) / (n - i);
    const between = i * (n - i) * (m0 - m1) ** 2;
    if (between > best.between) best = { i, between };
  }
  if (best.i < 0) return null;
  const i = best.i;
  const one = n * Math.log(variance(0, n)) + 2 * Math.log(n);
  const two =
    i * Math.log(variance(0, i)) +
    (n - i) * Math.log(variance(i, n)) -
    2 * (i * Math.log(i / n) + (n - i) * Math.log((n - i) / n)) +
    5 * Math.log(n);
  return two < one ? { threshold: (sorted[i - 1]! + sorted[i]!) / 2 } : null;
}

/** The median of `values` (the mean of the two middle values for an even count). */
export function median(values: readonly number[]): number {
  const sorted = Float64Array.from(values).sort();
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}
