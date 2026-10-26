import type { StripSlabTarget } from '../../src/course/strip-ground.js';
import type { CourseLayout, PlacedSection } from './viewer-layout.js';
import { rgb555Bytes, stationFrame, type StationFrame } from './viewer-surfaces.js';

/**
 * The course map's stripes on its ribbons: where each side's outermost ground color switches, two colors alternating.
 * A band is the stretch between two switches of one pair of colors; its phase θ runs linearly in s from the switch
 * before it to the one after, by π, so that `cos θ` is positive on the brighter color's bands and negative on the other's.
 */

/** Each band's numbers: its side (0 left, 1 right), its start and end stations, its phase at its start, its period in
 * metres (twice its length along the side's outer edge) and its pair of colors' index. */
export const BAND_STRIDE = 6;

export interface MapBands {
  /** Each placed Section's bands, in its stations' order on each side. */
  readonly bands: readonly Float64Array[];
  /** Each pair's brighter and darker colors (RGB555). */
  readonly pairs: readonly (readonly [number, number])[];
}

const luminance = (color: number) => {
  const [r, g, b] = rgb555Bytes(color);
  return 0.299 * r! + 0.587 * g! + 0.114 * b!;
};

/** The colors of a Section's outermost ground on one side along s: runs of one color, from its resolved Strips. */
function outerColors(placed: PlacedSection, side: 0 | 1): { start: number; end: number; color: number }[] {
  const reader = placed.section.color.reader;
  const slab: StripSlabTarget = { start: 0, end: 0, colors: [], edges: [] };
  const limits = { left: 0, right: 0 };
  const runs: { start: number; end: number; color: number }[] = [];
  for (let i = 0; i < reader.slabCount; i++) {
    reader.readSlab(i, slab);
    const middle = (slab.start + slab.end) / 2;
    placed.limits.at(middle, limits);
    // The span holding the point a centimetre within the limit, its edges taken at the slab's middle.
    const l = side === 0 ? limits.left + 0.01 : limits.right - 0.01;
    const n = slab.colors.length;
    let span = 0;
    while (span < n - 1 && (slab.edges[2 * span]! + slab.edges[2 * span + 1]!) / 2 <= l) span++;
    const color = slab.colors[span]!;
    const last = runs.at(-1);
    if (last && last.color === color && last.end === slab.start) last.end = slab.end;
    else runs.push({ start: slab.start, end: slab.end, color });
  }
  return runs;
}

/** Every placed Section's bands, each side's outermost colors read where they switch. */
export function mapBands(layout: CourseLayout): MapBands {
  const pairs: [number, number][] = [];
  const pairIndex = new Map<string, number>();
  const frame: StationFrame = { x: 0, z: 0, nx: 0, nz: 0, y: 0 };
  const limits = { left: 0, right: 0 };
  /** The outer edge's point on a side at s. */
  const edge = (placed: PlacedSection, side: 0 | 1, s: number) => {
    stationFrame(layout, placed, s, frame);
    placed.limits.at(s, limits);
    const l = side === 0 ? limits.left : limits.right;
    return [frame.x + l * frame.nx, frame.z + l * frame.nz];
  };
  const bands = layout.sections.map((placed) => {
    const out: number[] = [];
    for (const side of [0, 1] as const) {
      const runs = outerColors(placed, side);
      // A band lies between two switches of one pair, both its neighbours of the other color.
      for (let i = 1; i + 1 < runs.length; i++) {
        const before = runs[i - 1]!.color,
          color = runs[i]!.color,
          after = runs[i + 1]!.color;
        if (before !== after || color === before || color < 0 || before < 0) continue;
        const brighter =
          luminance(color) > luminance(before) || (luminance(color) === luminance(before) && color > before);
        const pair: [number, number] = brighter ? [color, before] : [before, color];
        const key = pair.join(',');
        if (!pairIndex.has(key)) {
          pairIndex.set(key, pairs.length);
          pairs.push(pair);
        }
        const { start, end } = runs[i]!;
        const [ax, az] = edge(placed, side, start),
          [bx, bz] = edge(placed, side, end);
        out.push(
          side,
          start,
          end,
          brighter ? -Math.PI / 2 : Math.PI / 2,
          2 * Math.hypot(bx! - ax!, bz! - az!),
          pairIndex.get(key)!,
        );
      }
    }
    return Float64Array.from(out);
  });
  return { bands, pairs };
}
