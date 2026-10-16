/** Small least-squares fits the footage tool shares. */

/** The least-squares line `y = a + b·x` through weighted points, with its weighted residual sum of squares. */
export function fitLine(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  ws?: ArrayLike<number>,
): { a: number; b: number; rss: number; n: number } {
  let s = 0,
    sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  const n = xs.length;
  for (let i = 0; i < n; i++) {
    const w = ws ? ws[i]! : 1;
    s += w;
    sx += w * xs[i]!;
    sy += w * ys[i]!;
    sxx += w * xs[i]! * xs[i]!;
    sxy += w * xs[i]! * ys[i]!;
  }
  const determinant = s * sxx - sx * sx;
  const b = determinant > 0 ? (s * sxy - sx * sy) / determinant : 0;
  const a = s > 0 ? (sy - b * sx) / s : 0;
  let rss = 0;
  for (let i = 0; i < n; i++) rss += (ws ? ws[i]! : 1) * (ys[i]! - a - b * xs[i]!) ** 2;
  return { a, b, rss, n };
}

/** Solve the small dense system `A x = b` (A square, row-major) by Gaussian elimination with partial pivoting. */
export function solveDense(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[pivot]![c]!)) pivot = r;
    if (!(Math.abs(M[pivot]![c]!) > 1e-12)) return null;
    [M[c], M[pivot]] = [M[pivot]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const factor = M[r]![c]! / M[c]![c]!;
      if (factor) for (let k = c; k <= n; k++) M[r]![k] = M[r]![k]! - factor * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** The least-squares polynomial of degree `degree` through points: its coefficients (constant first) and RSS. */
export function fitPolynomial(xs: ArrayLike<number>, ys: ArrayLike<number>, degree: number) {
  const k = degree + 1;
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let i = 0; i < xs.length; i++) {
    const powers = Array.from({ length: k }, (_, p) => xs[i]! ** p);
    for (let r = 0; r < k; r++) {
      b[r]! += powers[r]! * ys[i]!;
      for (let c = 0; c < k; c++) A[r]![c]! += powers[r]! * powers[c]!;
    }
  }
  const coefficients = solveDense(A, b);
  if (!coefficients) return null;
  let rss = 0;
  for (let i = 0; i < xs.length; i++) {
    let value = 0;
    for (let p = 0; p < k; p++) value += coefficients[p]! * xs[i]! ** p;
    rss += (ys[i]! - value) ** 2;
  }
  return { coefficients, rss };
}
