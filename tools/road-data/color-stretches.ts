/**
 * A course's colors in stretches ([Sky baking](../../docs/original-road-data.md#sky-baking)): each set of colors from
 * one change of the sky to the next, so that the road's and the ground's colors change at once where the sky does.
 */

/** A stretch of road stations in one set of colors. */
export interface ColorStretch<T> {
  readonly from: number;
  readonly to: number;
  readonly colors: T;
}

/**
 * `colors[0]` from `start`, each next set from the sky's change before it (`changes`, stations in order, one fewer than
 * the sets), the last to `end`.
 */
export function colorStretches<T>(
  colors: readonly T[],
  changes: readonly number[],
  start: number,
  end: number,
): ColorStretch<T>[] {
  if (changes.length !== colors.length - 1) throw new Error('A set of colors is shown for each sky');
  const bounds = [start, ...changes, end];
  if (bounds.some((s, i) => i > 0 && s < bounds[i - 1]!)) throw new Error('The sky changes in order along the road');
  return colors.map((set, i) => ({ from: bounds[i]!, to: bounds[i + 1]!, colors: set }));
}
