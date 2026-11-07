/**
 * A course's limits where its original's program holds them ([Original road data](../../../docs/original-road-data.md#the-ground-beside-the-road)):
 * its left and right ones along the road as the `outer-left` and `outer-right` Boundaries, and its ground's material
 * reaching them.
 */
import type { CoursePosition, Lateral } from '../../../src/course/course-document.js';
import { straightThrough } from './piecewise-linear.js';
import type { Band, Material } from './road-surface.js';
import { micrometre, simplified, stripElement } from './section-writing.js';

/**
 * The course's limits, its original's program's: its left and right ones, metres from P, at stations, straight
 * between them; and its ground's material (`ground`), which reaches them: the outermost band on a side that is the
 * ground keeps its colors to the picture's edge and its material ends at the limit; one that is not keeps both, and
 * the ground lies from the picture's edge to the limit.
 */
export interface ProgramLimits {
  readonly left: readonly (readonly [number, number])[];
  readonly right: readonly (readonly [number, number])[];
  readonly ground: Material;
}

/** The limits' lines: a side's limit at a station (`side` negative the left), and the Boundaries over a Section. */
export function programLimitLines(limits: ProgramLimits) {
  const lines = { left: straightThrough(limits.left), right: straightThrough(limits.right) };
  const at = (side: number, s: number) => (side < 0 ? lines.left : lines.right).at(s);
  /** The `outer-left` and `outer-right` Boundaries from station `from` to `to`, knots where the limits bend. */
  const boundaries = (from: number, to: number, positionAt: (s: number) => CoursePosition) =>
    [-1, 1].map((side) => ({
      id: side < 0 ? 'outer-left' : 'outer-right',
      knots: simplified(
        [from, ...(side < 0 ? lines.left : lines.right).breaks.filter((s) => s > from && s < to), to].map(
          (s) => [s, micrometre(at(side, s))] as [number, number],
        ),
      ).map(([s, lateral]) => ({ at: positionAt(s), lateral })),
    }));
  return { at, boundaries };
}

/** A band's material among the `count` bands across: the outermost band on a side that is the ground, color alone. */
export const bandMaterial = (band: Band, k: number, count: number, ground: Material) =>
  band.material === ground && (k === 0 || k === count - 1) ? null : band.material;

/**
 * The ground to the limits over a Section from `startAt` to `endAt`, the bands' parts across in their order: from the
 * outermost band's inner side where it is the ground, else from the picture's edge.
 */
export function groundToLimits(
  bandParts: readonly { readonly band: Band; readonly left: Lateral; readonly right: Lateral }[],
  ground: Material,
  startAt: CoursePosition,
  endAt: CoursePosition,
) {
  return ([0, bandParts.length - 1] as const).map((k) => {
    const { band, left, right } = bandParts[k]!;
    const outer = k === 0 ? { boundary: 'outer-left', offset: 0 } : { boundary: 'outer-right', offset: 0 };
    const inner = band.material === ground ? (k === 0 ? right : left) : k === 0 ? left : right;
    return stripElement(startAt, endAt, k === 0 ? outer : inner, k === 0 ? inner : outer, null, ground);
  });
}
