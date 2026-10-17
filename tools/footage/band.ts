/** A symmetric positive definite banded matrix: normal equations whose unknowns couple only within `width` of each other. */
export class BandMatrix {
  /** Row `i`, diagonal offset `k` (0 ≤ k ≤ width) holds entry `(i, i − k)`. */
  readonly entries: Float64Array;
  readonly rhs: Float64Array;

  constructor(
    readonly size: number,
    readonly width: number,
  ) {
    this.entries = new Float64Array(size * (width + 1));
    this.rhs = new Float64Array(size);
  }

  /** Add `value` to entries `(i, j)` and `(j, i)` (once on the diagonal). */
  add(i: number, j: number, value: number): void {
    const [row, column] = i >= j ? [i, j] : [j, i];
    const k = row - column;
    if (k > this.width) throw new RangeError(`Entry (${i}, ${j}) outside the band`);
    this.entries[row * (this.width + 1) + k] = this.entries[row * (this.width + 1) + k]! + value;
  }

  /**
   * Subtract `v·vᵀ/pivot` for a sparse `v`: `count` values at ascending `indices` (a rank-one Schur complement), and
   * `v·target/pivot` from the right-hand side.
   */
  subtractOuter(indices: Int32Array, values: Float64Array, count: number, pivot: number, target: number): void {
    const stride = this.width + 1;
    for (let a = 0; a < count; a++) {
      const j = indices[a]!,
        scaled = values[a]! / pivot;
      this.rhs[j] = this.rhs[j]! - scaled * target;
      for (let b = 0; b <= a; b++) {
        const k = indices[b]!;
        if (j - k > this.width) continue;
        this.entries[j * stride + (j - k)] = this.entries[j * stride + (j - k)]! - scaled * values[b]!;
      }
    }
  }

  diagonal(i: number): number {
    return this.entries[i * (this.width + 1)]!;
  }

  /**
   * Solve in place by banded Cholesky (`L·Lᵀ`), the matrix first equilibrated to a unit diagonal (each unknown scaled by
   * its diagonal's inverse square root, so that unknowns the equations weigh lightly keep their precision): the
   * right-hand side becomes the solution. Null if the matrix is not positive definite.
   */
  solve(): Float64Array | null {
    const { size: n, width: w, entries: a } = this;
    const stride = w + 1;
    const scale = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const d = a[i * stride]!;
      if (!(d > 0)) {
        return null;
      }
      scale[i] = 1 / Math.sqrt(d);
    }
    for (let i = 0; i < n; i++) {
      for (let k = 0; k <= Math.min(w, i); k++) a[i * stride + k] = a[i * stride + k]! * scale[i]! * scale[i - k]!;
      this.rhs[i] = this.rhs[i]! * scale[i]!;
    }
    for (let i = 0; i < n; i++) {
      const from = Math.max(0, i - w);
      for (let j = from; j <= i; j++) {
        let sum = a[i * stride + (i - j)]!;
        const lo = Math.max(from, j - w);
        for (let k = lo; k < j; k++) sum -= a[i * stride + (i - k)]! * a[j * stride + (j - k)]!;
        if (j === i) {
          if (!(sum > 0)) {
            return null;
          }
          a[i * stride] = Math.sqrt(sum);
        } else a[i * stride + (i - j)] = sum / a[j * stride]!;
      }
    }
    const x = this.rhs;
    for (let i = 0; i < n; i++) {
      let sum = x[i]!;
      for (let k = Math.max(0, i - w); k < i; k++) sum -= a[i * stride + (i - k)]! * x[k]!;
      x[i] = sum / a[i * stride]!;
    }
    for (let i = n - 1; i >= 0; i--) {
      let sum = x[i]!;
      for (let k = i + 1; k <= Math.min(n - 1, i + w); k++) sum -= a[k * stride + (k - i)]! * x[k]!;
      x[i] = sum / a[i * stride]!;
    }
    for (let i = 0; i < n; i++) x[i] = x[i]! * scale[i]!;
    return x;
  }
}
