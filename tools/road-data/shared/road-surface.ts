/**
 * A road's surface across and along it ([Original road data](../../../docs/original-road-data.md#a-circuit-laid-out)):
 * its bands across, each a base color with its material and its stripes along an interval, and its surface's Strips of
 * color alone repeated along it.
 */
import type { Lateral } from '../../../src/course/course-document.js';
import { micrometre, sectionStations, stripElement, stripeParts } from './section-writing.js';

/** A material across. */
export type Material = 'ASPHALT' | 'GRASS' | 'SAND';

/**
 * A band of the road across: metres right of P, its colors (RGB555) along an interval, one a part of it in turn, and
 * its material.
 */
export interface Band {
  readonly left: number;
  readonly right: number;
  readonly colors: readonly number[];
  readonly material: Material;
}

/**
 * The road across: its bands, and its picture's edges, metres either side of P, which are its limits too where the
 * course gives none (`layCourse`'s `limits`).
 */
export interface CrossSection {
  readonly bands: readonly Band[];
  readonly edge: number;
}

/** A band's base color: the one most of its parts give, of as many the earliest. */
export function baseColor(band: Band): number {
  const count = (c: number) => band.colors.filter((d) => d === c).length;
  return band.colors.reduce((best, c) => (count(c) > count(best) ? c : best), band.colors[0]!);
}

/**
 * A band's Strips over a Section from lap station `from`, between laterals `left` and `right` (its own, or where the
 * road's edges move, by the edge it goes with): its base color, with its material (`material`, the band's unless given),
 * over the whole Section; then each
 * color its palettes in turn give other than the base, a stripe repeated at the band's own cycle (the fewest palettes
 * that repeat, an eighth of the interval each), counted from the lap's start line.
 */
export function bandStrips(
  band: Band,
  left: Lateral,
  right: Lateral,
  from: number,
  stations: ReturnType<typeof sectionStations>,
  interval: number,
  material: Material | null = band.material,
) {
  const base = baseColor(band);
  const whole = stripElement(
    stations.at(0),
    { joint: stations.joint, offset: stations.size },
    left,
    right,
    base,
    material,
  );
  const parts = band.colors.length;
  const cycle = [1, 2, 4, parts].find((n) => band.colors.every((c, k) => c === band.colors[k % n]))!;
  const period = (interval * cycle) / parts;
  return [
    whole,
    ...band.colors
      .slice(0, cycle)
      .flatMap((color, k) =>
        color === base
          ? []
          : stripeParts(k, cycle, period, -from, 0, stations.size, (a, b) =>
              stripElement(stations.at(a), stations.at(b), left, right, color, null),
            ),
      ),
  ];
}

/** A Strip of a road's surface, color alone: from and to stations of the lap, its laterals and its color. */
export interface SurfacePart {
  readonly from: number;
  readonly to: number;
  readonly left: Lateral;
  readonly right: Lateral;
  readonly color: number;
}

/** Strips of a road's surface laid `count` times, each time `every` metres on from the last (one time where 1). */
export interface SurfaceStrip {
  readonly parts: readonly SurfacePart[];
  readonly every: number;
  readonly count: number;
}

/**
 * A surface's Strips over a Section from lap station `from` to `to`, each station's Position by `at`: the times a
 * pattern lies whole within the Section one repeat of its parts, a time across a border each part cut there.
 */
export function sectionSurface(
  surface: readonly SurfaceStrip[],
  from: number,
  to: number,
  at: (s: number) => ReturnType<ReturnType<typeof sectionStations>['at']>,
) {
  return surface.flatMap(({ parts, every: given, count }) => {
    const every = micrometre(given);
    const [first, last] = [Math.min(...parts.map((p) => p.from)), Math.max(...parts.map((p) => p.to))];
    const placed = (p: SurfacePart, shift: number, a = from, b = to) => {
      const [start, end] = [Math.max(a, p.from + shift), Math.min(b, p.to + shift)];
      return end - start > 1e-6 ? [stripElement(at(start), at(end), p.left, p.right, p.color, null)] : [];
    };
    const whole = (k: number) => first + k * every >= from - 1e-9 && last + k * every <= to + 1e-9;
    const out = [];
    for (let k = 0; k < count;) {
      if (first + k * every >= to || last + k * every <= from) {
        k++;
        continue;
      }
      if (!whole(k)) {
        out.push(...parts.flatMap((p) => placed(p, k * every)));
        k++;
        continue;
      }
      let n = 1;
      while (k + n < count && whole(k + n)) n++;
      const elements = parts.flatMap((p) => placed(p, k * every, -Infinity, Infinity));
      out.push(...(n > 1 ? [{ kind: 'repeat' as const, every, count: n, elements }] : elements));
      k += n;
    }
    return out;
  });
}
