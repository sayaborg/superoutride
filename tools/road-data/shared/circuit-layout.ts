/**
 * A circuit laid out as a course document from its lap ([Original road data](../../../docs/original-road-data.md#a-circuit-laid-out)),
 * as an original raised from a curve table lays it: cut into Sections, its profile, two lanes either side of P, its road
 * across in bands striped along it, its start line's rows, its boards, sky and gates.
 */
import type { CourseDocument, SectionDocument } from '../../../src/course/course-document.js';
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
  spriteElement,
  type CourseGate,
  stripElement,
  widthLine,
  writtenPlan,
} from './section-writing.js';
import { SKY_HORIZON, sectionYawOrigin } from './sky-baking.js';
import { bandMaterial, groundAt, groundToLimits, programLimitLines, type ProgramLimits } from './program-limits.js';
import {
  baseColor,
  bandStrips,
  sectionSurface,
  type Band,
  type CrossSection,
  type SurfaceStrip,
} from './road-surface.js';
import { straightThrough } from './piecewise-linear.js';

/** A lap as laid: its plan's pieces from the line, and its length, metres. */
export interface Lap {
  readonly pieces: readonly PathPiece[];
  readonly length: number;
}

/**
 * The stations where a lap is cut into Sections: its line, at 0, and its checkpoints (`checkpoints`, stations of the
 * lap), each the end of its Section, the start's Section holding none; a lap with none at the middle of its longest
 * straight the line does not lie on (of equal ones the earliest); and again where its road comes near itself, more
 * than `GATE_ROOM` from every gate.
 */
function cuts(path: CoursePath, finish: number, leastLaneRadius: number, checkpoints: readonly number[]) {
  const straights = path.elements.filter((e) => e.turn === 0 && e.start > 0 && e.start + e.length < path.length);
  const longest = [...straights].sort((x, y) => micrometre(y.length) - micrometre(x.length) || x.start - y.start)[0];
  const middle = longest ? longest.start + longest.length / 2 : path.length / 2;
  const parts = [0, ...(checkpoints.length ? checkpoints : [middle]), path.length];
  const gates = [...checkpoints, finish];
  return parts
    .slice(0, -1)
    .flatMap((a, i) => [a, ...domainCuts(path, a, parts[i + 1]!, leastLaneRadius, gates, { finish })]);
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
  /**
   * Its checkpoints, each its id and its station of the lap from its line (CONTINENTAL CIRCUS's), in their order; none
   * where absent.
   */
  readonly checkpoints?: readonly CourseGate[];
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
   * The ground's color beyond the road's picture, either side out from its edges as far as the course reaches, color
   * alone (FINAL LAP 2's); none where absent.
   */
  readonly beyond?: number;
  /** The course's limits, its original's program's, at stations of the lap from its line, and its ground's material. */
  readonly limits: ProgramLimits;
  /** The road's surface drawn over its bands, as its picture draws it (FINAL LAP 2's), in its order. */
  readonly surface?: readonly SurfaceStrip[];
  /**
   * Lines along the lap the surface's Strips may follow (CONTINENTAL CIRCUS's pit lanes): each a Boundary `id`, its
   * laterals, metres right of P, at stations of the lap, straight between, written in each Section it reaches with its
   * knots within and its laterals where the Section cuts it.
   */
  readonly lines?: readonly { readonly id: string; readonly knots: readonly (readonly [number, number])[] }[];
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
    /** Its body's width, metres, or its parts (each its middle, metres right of its lateral, and width), or none. */
    readonly body: number | readonly { readonly across: number; readonly width: number }[] | null;
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
  const limitLines = programLimitLines(options.limits);
  const limitAt = limitLines.at;
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
  const checkpoints = options.checkpoints ?? [];
  if (checkpoints.some((c, k) => !(c.s > 0 && c.s < length) || (k > 0 && !(c.s > checkpoints[k - 1]!.s))))
    throw contractUnmet(`${name}'s checkpoints do not lie in order within its lap`);
  const starts = cuts(
    path,
    length,
    options.leastLaneRadius,
    checkpoints.map((c) => c.s),
  );
  const ends = [...starts.slice(1), length];
  // The grids from the line, in the last Section.
  const grids: StartGrids = {
    origin: { s: length, lateral: 0 },
    originals: { car: options.grid },
    line: length,
    lanes: ['a', 'b'],
    meet: 0,
    laneWidth: LANE,
    limits: [-limitAt(-1, length), limitAt(1, length)],
  };
  const grid = ruleGrid('car', grids);
  if ([...grid, ...ruleGrid('bike', grids)].some((slot) => slot.s < starts.at(-1)!))
    throw contractUnmet(`${name}'s grid reaches before its last Section's start`);
  // A slot's lateral, metres right of P: its own, or its lane's centre (a the left lane, b the right) and its offset.
  const slotLateral = ({ s, lateral }: GridPlace) => {
    if (typeof lateral === 'number') return lateral;
    const half = (right - leftAt(s)) / 4;
    return lateral.offset + ('lane' in lateral && lateral.lane === 'a' ? leftAt(s) + half : right - half);
  };
  if (grid.some((slot) => slotLateral(slot) <= limitAt(-1, slot.s) || slotLateral(slot) >= limitAt(1, slot.s)))
    throw contractUnmet(`${name}'s grid lies beyond its limits`);
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
        boundaries: [
          ...limitLines.boundaries(from, to, positionAt),
          ...(options.lines ?? []).flatMap(({ id: line, knots }) => {
            const [a, b] = [Math.max(from, knots[0]![0]), Math.min(to, knots.at(-1)![0])];
            if (!(b > a)) return [];
            const through = straightThrough(knots);
            const written = [[a, through.at(a)] as const, ...knots.filter(([s]) => s > a + 1e-6 && s < b - 1e-6)];
            return [
              {
                id: line,
                knots: [...written, [b, through.at(b)] as const].map(([s, lateral]) => ({
                  at: positionAt(s),
                  lateral: micrometre(lateral),
                })),
              },
            ];
          }),
        ],
        strips: [
          ...(options.beyond === undefined
            ? []
            : [-1, 1].map((side) =>
                stripElement(
                  startAt,
                  endAt,
                  side < 0 ? null : micrometre(crossSection.edge),
                  side < 0 ? micrometre(-crossSection.edge) : null,
                  options.beyond!,
                  null,
                ),
              )),
          ...bandParts.flatMap(({ band, left, right }, k) =>
            bandStrips(
              band,
              left,
              right,
              from,
              stations,
              options.interval,
              bandMaterial(band, k, bandParts.length, groundAt(options.limits, k === 0 ? -1 : 1, from)),
            ),
          ),
          ...groundToLimits(bandParts, options.limits, from, to, positionAt),
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
          ...sectionGates(stations, from, checkpoints, { id: `${id}-GOAL`, s: length }),
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
