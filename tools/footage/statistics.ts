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

/** The median and the median absolute deviation scaled to a normal standard deviation. */
export function robustCentre(values: readonly number[]): { median: number; sigma: number; n: number } {
  const centre = median(values);
  return { median: centre, sigma: 1.4826 * median(values.map((v) => Math.abs(v - centre))), n: values.length };
}

/**
 * The most frequent value of `values`: the peak of their density, a sum of normal kernels whose width is the values'
 * own spread by Silverman's rule, sought on a grid of a tenth of that width.
 */
export function mostFrequent(values: readonly number[]): number {
  const { median, sigma, n } = robustCentre(values);
  if (n < 2 || !(sigma > 0)) return median;
  const width = 0.9 * sigma * n ** -0.2;
  const sorted = Float64Array.from(values).sort();
  let best = median,
    bestDensity = -Infinity;
  for (let x = median - 4 * sigma; x <= median + 4 * sigma; x += width / 10) {
    let density = 0;
    // Only values within four widths count.
    let lo = 0,
      hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]! < x - 4 * width) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < n && sorted[i]! <= x + 4 * width; i++)
      density += Math.exp(-0.5 * ((sorted[i]! - x) / width) ** 2);
    if (density > bestDensity) [best, bestDensity] = [x, density];
  }
  return best;
}
