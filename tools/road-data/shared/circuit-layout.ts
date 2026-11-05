/**
 * A circuit laid out as a course document from its lap ([Original road data](../../../docs/original-road-data.md#a-circuit-laid-out)),
 * as an original raised from a curve table lays it: cut into Sections, its profile, two lanes either side of P, its road
 * across in bands striped along it, its start line's rows, its boards, sky and gates.
 */
import type { CourseDocument, Lateral, SectionDocument } from '../../../src/course/course-document.js';
import { chainLinks, courseDocument } from '../shared/course-writing.js';
import { CoursePath, type PathPiece } from './course-path.js';
import { laidProfile, type RoadHeights } from './crest-bound.js';
import { computedValue } from '../../authoring/course-joints.js';
import { contractUnmet } from './conversion-errors.js';
import { ruleGrid, startGate, type GridPlace, type OriginalGrid, type StartGrids } from './grid-rule.js';
import { sectionProfile, type Bend, type Kink, type Profile } from './road-profile.js';
import {
  domainCuts,
  laneLateral,
  lateralLine,
  micrometre,
  sectionGates,
  sectionStations,
  repeated,
  simplified,
  spriteElement,
  stripElement,
  stripeParts,
  widthLine,
  writtenPlan,
} from './section-writing.js';
import { SKY_HORIZON, sectionYawOrigin } from './sky-baking.js';
import { straightThrough } from './piecewise-linear.js';

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

/** The road across: its bands, and its limits, metres either side of P. */
export interface CrossSection {
  readonly bands: readonly Band[];
  readonly limit: number;
}

/** A band's base color: the one most of its parts give, of as many the earliest. */
export function baseColor(band: Band): number {
  const count = (c: number) => band.colors.filter((d) => d === c).length;
  return band.colors.reduce((best, c) => (count(c) > count(best) ? c : best), band.colors[0]!);
}

/**
 * A band's Strips over a Section from lap station `from`, between laterals `left` and `right` (its own, or where the
 * road's edges move, by the edge it goes with): its base color, with its material, over the whole Section; then each
 * color its palettes in turn give other than the base, a stripe repeated at the band's own cycle (the fewest palettes
 * that repeat, an eighth of the interval each), counted from the lap's start line.
 */
function bandStrips(
  band: Band,
  left: Lateral,
  right: Lateral,
  from: number,
  stations: ReturnType<typeof sectionStations>,
  interval: number,
) {
  const base = baseColor(band);
  const whole = stripElement(
    stations.at(0),
    { joint: stations.joint, offset: stations.size },
    left,
    right,
    base,
    band.material,
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
function sectionSurface(
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

/** A lap as laid: its plan's pieces from the line, and its length, metres. */
export interface Lap {
  readonly pieces: readonly PathPiece[];
  readonly length: number;
}

/**
 * The stations where a lap is cut into Sections: its line, at 0, and the middle of its longest straight the line does
 * not lie on (of equal ones the earliest), and again where its road comes near itself.
 */
function cuts(path: CoursePath, finish: number, leastLaneRadius: number) {
  const straights = path.elements.filter((e) => e.turn === 0 && e.start > 0 && e.start + e.length < path.length);
  const longest = [...straights].sort((x, y) => micrometre(y.length) - micrometre(x.length) || x.start - y.start)[0];
  const middle = longest ? longest.start + longest.length / 2 : path.length / 2;
  const parts = [0, middle, path.length];
  return parts
    .slice(0, -1)
    .flatMap((a, i) => [a, ...domainCuts(path, a, parts[i + 1]!, leastLaneRadius, [finish], { finish })]);
}

/** A course's document: `name`'s lap, laps `laps`, its Sections' profile by `profile`, `id` its sections' prefix. */
export function layCourse(options: {
  readonly id: string;
  /** Each lane's width, metres, and the least radius the lanes keep. */
  readonly lane: number;
  readonly leastLaneRadius: number;
  readonly name: string;
  readonly lap: Lap;
  readonly crossSection: CrossSection;
  readonly laps: number;
  /** The original's cars at GO, metres ahead of the line and right of P ([the grid](../../../docs/original-road-data.md#the-grid)). */
  readonly grid: OriginalGrid;
  readonly sky: string;
  readonly profile?: Profile;
  /** The road's heights before the crests rule ([Profile](../../../docs/original-road-data.md#profile)); level absent. */
  readonly road?: { readonly bends: readonly Bend[]; readonly kinks: readonly Kink[] };
  /** The lap's mean interval, metres: its stripes' unit. */
  readonly interval: number;
  /** The start line's rows, from and to stations of the lap, each its road across. */
  readonly startLine: readonly { readonly from: number; readonly to: number; readonly bands: readonly Band[] }[];
  /**
   * Where the road's edges move along its lap (FINAL LAP 2's): its left edge line's middle, metres from P, at stations
   * of the lap from its line, straight between them, and its right one's, which stays; its two lanes the halves between
   * them. A band left of P goes with the left edge, the rest stay. Absent, the edges lie a lane either side of P.
   */
  readonly edges?: { readonly left: readonly (readonly [number, number])[]; readonly right: number };
  /**
   * The ground's color beyond the road's picture, either side out from its limits as far as the course reaches (FINAL
   * LAP 2's), color alone; none where absent.
   */
  readonly beyond?: number;
  /** The road's surface drawn over its bands, as its picture draws it (FINAL LAP 2's), in its order. */
  readonly surface?: readonly SurfaceStrip[];
  /** The sky's yaw origin at the course's start, degrees. */
  readonly skyYawOrigin: number;
  /**
   * The boards: each at a station of the lap and a lateral from P, its height above the road, its image, palette and
   * body's width (or none).
   */
  readonly objects: readonly {
    readonly s: number;
    readonly lateral: number;
    /** Its base point's height above the road, metres; on the road where absent. */
    readonly height?: number;
    readonly image: string;
    readonly palette: string;
    /** Its body's width, metres, or none. */
    readonly body: number | null;
  }[];
}): {
  document: CourseDocument;
  sections: number;
  heights: RoadHeights;
  write: (profile: Profile) => CourseDocument;
  /** The car grid's slots, at stations of the lap. */
  grid: GridPlace[];
} {
  const { id, name, lap, crossSection, laps, lane: LANE, edges } = options;
  const leftLine = edges && straightThrough(edges.left);
  const leftAt = (s: number) => (leftLine ? leftLine.at(s) : -LANE);
  const right = edges ? edges.right : LANE;
  // Each band's Strips' edges: its own laterals; where the edges move, a band's part left of P by the left edge's lane
  // line (the outermost band's outer side where it lies), drawn first, and its part right of P where it lies.
  const bandParts = edges
    ? [
        ...crossSection.bands
          .filter((band) => band.left < 0)
          .map((band, k) => ({
            band,
            // The outermost band's outer side stays at the road picture's edge.
            left: k === 0 ? micrometre(band.left) : laneLateral('a', 'left', band.left - leftAt(0)),
            right: laneLateral('a', 'left', Math.min(band.right, 0) - leftAt(0)),
          })),
        ...crossSection.bands
          .filter((band) => band.right > 0)
          .map((band) => ({ band, left: micrometre(Math.max(band.left, 0)), right: micrometre(band.right) })),
      ]
    : crossSection.bands.map((band) => ({ band, left: micrometre(band.left), right: micrometre(band.right) }));
  const path = new CoursePath(lap.pieces);
  const length = path.length;
  const starts = cuts(path, length, options.leastLaneRadius);
  const ends = [...starts.slice(1), length];
  // The grids from the line, in the last Section.
  const grids: StartGrids = {
    origin: { s: length, lateral: 0 },
    originals: { car: options.grid },
    line: length,
    lanes: ['a', 'b'],
    meet: 0,
    laneWidth: LANE,
    limits: [crossSection.limit, crossSection.limit],
  };
  const grid = ruleGrid('car', grids);
  if ([...grid, ...ruleGrid('bike', grids)].some((slot) => slot.s < starts.at(-1)!))
    throw contractUnmet(`${name}'s grid reaches before its last Section's start`);
  const heights: RoadHeights = {
    road: options.road ?? { bends: [], kinks: [] },
    mounds: { bends: [], kinks: [] },
    cuts: starts.slice(1),
    length,
    lap: true,
  };
  const write = (profile: Profile): CourseDocument => {
    const sections: SectionDocument[] = starts.map((from, i) => {
      const to = ends[i]!;
      const plan = writtenPlan(path, { from, to }, true);
      const stations = sectionStations(plan);
      const at = (s: number) => stations.at(s - from);
      const last = i === starts.length - 1;
      // Its heights as computed and its knots within on the step of computed values, so that the grades on the
      // tangents hold at its ends ([Profile](../../../docs/original-road-data.md#profile)).
      const profileKnots = sectionProfile(profile, from, to, true, true);
      const knots = profileKnots.map((k, j) => ({
        at:
          j === 0 || j === profileKnots.length - 1
            ? at(k.s)
            : { joint: stations.joint, offset: computedValue(k.s - from) },
        y: k.y,
        curveLength: k.curveLength,
      }));
      const startAt = at(from);
      const endAt = { joint: stations.joint, offset: stations.size };
      const positionAt = (s: number) => (s === to ? endAt : at(s));
      // The edges along the Section: the left at its knots within it and its ends, the right where it stays.
      const knotStations = edges ? [from, ...edges.left.map(([s]) => s).filter((s) => s > from && s < to), to] : [];
      const along = (value: (s: number) => number) =>
        knotStations.map((s) => [s, micrometre(value(s))] as [number, number]);
      const laneWidth = (s: number) => (right - leftAt(s)) / 2;
      return {
        id: `${id}-${i + 1}`,
        plan,
        profile: knots,
        lanes: ['a', 'b'].map((lane) => ({
          kind: 'lane',
          id: lane,
          width: edges ? widthLine(along(laneWidth), positionAt) : LANE,
        })),
        centerLane: 'a',
        centerLateral: edges
          ? lateralLine(
              along((s) => leftAt(s) + laneWidth(s) / 2),
              positionAt,
            )
          : micrometre(-LANE / 2),
        boundaries: [-1, 1].map((side) => ({
          id: side < 0 ? 'outer-left' : 'outer-right',
          knots:
            edges && side < 0
              ? simplified(along((s) => leftAt(s) - leftAt(0) - crossSection.limit)).map(([s, lateral]) => ({
                  at: positionAt(s),
                  lateral,
                }))
              : [startAt, endAt].map((position) => ({ at: position, lateral: micrometre(side * crossSection.limit) })),
        })),
        strips: [
          ...(options.beyond === undefined
            ? []
            : [-1, 1].map((side) =>
                stripElement(
                  startAt,
                  endAt,
                  side < 0 ? null : micrometre(crossSection.limit),
                  side < 0 ? micrometre(-crossSection.limit) : null,
                  options.beyond!,
                  null,
                ),
              )),
          ...bandParts.flatMap(({ band, left, right }) =>
            bandStrips(band, left, right, from, stations, options.interval),
          ),
          ...sectionSurface(options.surface ?? [], from, to, positionAt),
          ...options.startLine
            .filter((row) => row.from >= from && row.from < to)
            .flatMap((row) =>
              row.bands.map((band) =>
                stripElement(
                  at(row.from),
                  at(row.to),
                  micrometre(band.left),
                  micrometre(band.right),
                  baseColor(band),
                  null,
                ),
              ),
            ),
        ],
        walls: [],
        openLimits: [],
        sprites: repeated(
          options.objects
            .filter((o) => o.s >= from && (o.s < to || (last && o.s <= to)))
            .sort((a, b) => a.s - b.s || a.lateral - b.lateral)
            .map((o) =>
              spriteElement({
                image: o.image,
                palette: o.palette,
                at: at(o.s),
                lateral: o.lateral,
                groundOffset: o.height ?? 0,
                body: o.body,
              }),
            ),
        ),
        environments: [
          {
            at: startAt,
            name,
            background: {
              image: options.sky,
              horizonY: SKY_HORIZON,
              yawOrigin: micrometre(
                sectionYawOrigin(
                  options.skyYawOrigin,
                  ((path.pose(from).heading - path.pose(0).heading) * 180) / Math.PI,
                ),
              ),
            },
            transition: 0,
          },
        ],
        gates: [
          ...sectionGates(stations, from, [], { id: `${id}-GOAL`, s: length }),
          ...(last ? [startGate(at, grids)] : []),
        ],
      } as SectionDocument;
    });
    return courseDocument(name, sections, chainLinks(sections, 'a', true), laps);
  };
  return {
    document: write(options.profile ?? laidProfile(heights, null)),
    sections: starts.length,
    heights,
    write,
    grid,
  };
}
