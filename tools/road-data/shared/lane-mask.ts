/**
 * Lanes by a mask ([Lanes by a mask](../../../docs/original-road-data.md#lanes-by-a-mask)): a road whose original sets
 * its lane slots by a mask's bits, laid as OUTRUN's lanes, each its slot's width where its bit is set, each side's
 * edge moving straight over the stretch its original takes, each lane's width joined by the monotone cubic.
 */
import { contractUnmet } from './conversion-errors.js';
import { monotoneCubic } from './monotone-cubic.js';

/** An original's lane slots and how its road's edges move when its mask changes. */
export interface MaskLanes {
  /** The slots' lanes, left to right. */
  readonly names: readonly string[];
  /** Each slot's bit in the mask. */
  readonly bits: readonly number[];
  /** The index of the first slot right of P: P lies between slot `centre − 1` and slot `centre`. */
  readonly centre: number;
  /** A slot's width, metres. */
  readonly width: number;
  /** Whether a change's stretch ends where its record starts (`ending`) or starts there (`starting`). */
  readonly placement: 'ending' | 'starting';
  /** Whether a change's length is a lane's, a side's edge taking it for each lane it moves, or its whole stretch's. */
  readonly perLane: boolean;
}

/** A change to mask `mask` at its record's start `at` (a station, metres), of length `length`; of none a jump. */
export interface MaskChange {
  readonly mask: number;
  readonly at: number;
  readonly length: number;
}

/** A lane's width from station `from` (metres) to the next piece's, which a jump starts. */
export interface WidthPiece {
  readonly from: number;
  readonly width: (station: number) => number;
}

type Knot = [number, number];

/** How many slots of `lanes` are set in `mask` on each side, left and right, the slots set lying outward from P. */
function sidesOf(lanes: MaskLanes, mask: number): [number, number] {
  const set = lanes.bits.map((bit) => (mask & (1 << bit)) !== 0);
  const side = (from: number, step: number) => {
    let count = 0;
    for (let k = from; k >= 0 && k < set.length; k += step) {
      if (!set[k]) break;
      count++;
    }
    for (let k = from + step * count; k >= 0 && k < set.length; k += step)
      if (set[k]) throw contractUnmet(`The lane mask 0x${mask.toString(16)} sets a lane beyond one it does not`);
    return count;
  };
  return [side(lanes.centre - 1, -1), side(lanes.centre, 1)];
}

/**
 * Each lane's width along the road, mask `first` from station `start`, then each change in `changes` in order, each
 * side's edge moving straight from the old mask's lanes to the new's over the change's stretch, each lane's width
 * straight as the edge crosses it and the lane's points joined by the monotone cubic. A jump lies at one of `cuts`
 * (Sections' cuts), where its lanes' next pieces start, or the conversion stops.
 */
export function laneWidths(
  lanes: MaskLanes,
  start: number,
  first: number,
  changes: readonly MaskChange[],
  cuts: readonly number[],
) {
  let sides = sidesOf(lanes, first);
  const slot = (k: number): [side: 0 | 1, from: number] =>
    k < lanes.centre ? [0, lanes.centre - 1 - k] : [1, k - lanes.centre];
  const widthOf = (k: number, counts: readonly number[]) => {
    const [side, i] = slot(k);
    return i < counts[side]! ? lanes.width : 0;
  };
  const runs = lanes.names.map((_, k): Knot[][] => [[[start, widthOf(k, sides)]]]);
  for (const change of changes) {
    const next = sidesOf(lanes, change.mask);
    lanes.names.forEach((_, k) => {
      const [side, i] = slot(k);
      const [n0, n1] = [sides[side]!, next[side]!];
      if (widthOf(k, sides) === widthOf(k, next)) return;
      const total = lanes.perLane ? change.length * Math.abs(n1 - n0) : change.length;
      const from = lanes.placement === 'ending' ? change.at - total : change.at;
      // The fractions of the stretch over which the side's edge crosses this lane.
      const [f0, f1] = n1 > n0 ? [i - n0, i + 1 - n0] : [n0 - i - 1, n0 - i];
      const [s0, s1] = [from + (total * f0) / Math.abs(n1 - n0), from + (total * f1) / Math.abs(n1 - n0)];
      const run = runs[k]!;
      const knots = run.at(-1)!;
      const [last, value] = knots.at(-1)!;
      if (s0 < last) throw contractUnmet(`Lane ${lanes.names[k]}'s mask changes overlap at ${s0} m`);
      if (s1 === s0) {
        if (!cuts.includes(s0)) throw contractUnmet(`Lane ${lanes.names[k]}'s mask jumps at ${s0} m, inside a Section`);
        run.push([[s0, widthOf(k, next)]]);
        return;
      }
      if (s0 > last) knots.push([s0, value]);
      knots.push([s1, widthOf(k, next)]);
    });
    sides = next;
  }
  return lanes.names.map((lane, k) => ({
    lane,
    pieces: runs[k]!.map((knots): WidthPiece => ({ from: knots[0]![0], width: monotoneCubic(knots) })),
  }));
}
