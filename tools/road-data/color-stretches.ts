/**
 * A course's colors in stretches ([Sky baking](../../docs/original-road-data.md#sky-baking)): each set of colors from
 * one change of the sky to the next, so that the road's and the ground's colors change over the same stretch of road as
 * the sky does.
 */

/** A stretch of road stations in one set of colors; within a change, `before` is the set it mixes from. */
export interface ColorStretch<T> {
  readonly from: number;
  readonly to: number;
  readonly colors: T;
  readonly before: T | null;
}

/** A change of the sky along the road: from station `at`, `length` long (0 at once). */
export interface ColorChange {
  readonly at: number;
  readonly length: number;
}

/**
 * `colors[0]` from `start`, each next set from the sky's change before it (`changes`, in order, one fewer than the
 * sets), the last to `end`; a change's own stretch, `length` long from its start, mixes from the set before it.
 */
export function colorStretches<T>(
  colors: readonly T[],
  changes: readonly ColorChange[],
  start: number,
  end: number,
): ColorStretch<T>[] {
  if (changes.length !== colors.length - 1) throw new Error('A set of colors is shown for each sky');
  const bounds = [start, ...changes.map((c) => c.at), end];
  if (bounds.some((s, i) => i > 0 && s < bounds[i - 1]!)) throw new Error('The sky changes in order along the road');
  return colors.flatMap((set, i) => {
    const [from, to] = [bounds[i]!, bounds[i + 1]!];
    const change = changes[i - 1];
    if (!change || change.length === 0) return [{ from, to, colors: set, before: null }];
    const mixed = from + change.length;
    if (mixed > to) throw new Error('A change of the sky ends before the next begins');
    return [
      { from, to: mixed, colors: set, before: colors[i - 1]! },
      ...(mixed < to ? [{ from: mixed, to, colors: set, before: null }] : []),
    ];
  });
}

/** A Strip's color in a stretch: the set's color, or within a change the pair from the set before it where they differ. */
export function stretchColor<T>(
  stretch: ColorStretch<T>,
  pick: (colors: T) => number,
): number | { readonly from: number; readonly to: number } {
  const to = pick(stretch.colors);
  if (stretch.before === null) return to;
  const from = pick(stretch.before);
  return from === to ? to : { from, to };
}
