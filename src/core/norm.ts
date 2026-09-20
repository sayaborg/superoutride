/** Scaled Euclidean norms with compensated accumulation and no variadic argument storage.
 * The supported runtime's Math.hypot remains the independent bit-exact oracle.
 */
export function hypot2(x: number, y: number): number {
  const a = Math.abs(x),
    b = Math.abs(y);
  if (a === Infinity || b === Infinity) return Infinity;
  const largest = Math.max(a, b);
  if (largest === 0) return 0;
  const u = a / largest,
    v = b / largest;
  return Math.sqrt(u * u + v * v) * largest;
}

export function hypot3(x: number, y: number, z: number): number {
  const a = Math.abs(x),
    b = Math.abs(y),
    c = Math.abs(z);
  if (a === Infinity || b === Infinity || c === Infinity) return Infinity;
  const largest = Math.max(a, b, c);
  if (largest === 0) return 0;
  const u = a / largest,
    v = b / largest,
    w = c / largest;
  const first = u * u,
    second = v * v;
  const sum = first + second;
  return Math.sqrt(sum + (w * w - (sum - first - second))) * largest;
}
