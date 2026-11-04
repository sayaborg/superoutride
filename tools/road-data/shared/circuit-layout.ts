/**
 * A circuit laid out as a course document from its lap ([Original road data](../../../docs/original-road-data.md#a-circuit-laid-out)),
 * as an original raised from a curve table lays it: cut into Sections, its profile, two lanes either side of P, its road
 * across in bands striped along it, its start line's rows, its boards, sky and gates.
 */
import type { CourseDocument, Lateral, SectionDocument } from '../../../src/course/course-document.js';
import { chainLinks, courseDocument } from '../shared/course-writing.js';
import { CoursePath, type PathPiece } from './course-path.js';
import { laidProfile, type RoadHeights } from './crest-bound.js';
import { startGate } from './grid-rule.js';
import { sectionProfile, type Profile } from './road-profile.js';
import {
  domainCuts,
  laneCentre,
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
  readonly playerBehindLine: number;
  readonly sky: string;
  readonly profile?: Profile;
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
  /** The sky's yaw origin at the course's start, degrees. */
  readonly skyYawOrigin: number;
  /** The boards: each at a station of the lap and a lateral from P, its image, palette and body's width. */
  readonly objects: readonly {
    readonly s: number;
    readonly lateral: number;
    readonly image: string;
    readonly palette: string;
    readonly body: number;
  }[];
}): { document: CourseDocument; sections: number; heights: RoadHeights; write: (profile: Profile) => CourseDocument } {
  const { id, name, lap, crossSection, laps, lane: LANE, edges } = options;
  const leftLine = edges && straightThrough(edges.left);
  const leftAt = (s: number) => (leftLine ? leftLine.at(s) : -LANE);
  const right = edges ? edges.right : LANE;
  // Each band's Strips' edges: its own laterals; where the edges move, a band's part left of P by the left edge's lane
  // line, drawn first, and its part right of P where it lies.
  const bandParts = edges
    ? [
        ...crossSection.bands
          .filter((band) => band.left < 0)
          .map((band) => ({
            band,
            left: laneLateral('a', 'left', band.left - leftAt(0)),
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
  const heights: RoadHeights = {
    road: { bends: [], kinks: [] },
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
      const knots = sectionProfile(profile, from, to, true, true).map((k) => ({
        at: at(k.s),
        y: micrometre(k.y),
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
          ...bandParts.flatMap(({ band, left, right }) =>
            bandStrips(band, left, right, from, stations, options.interval),
          ),
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
                groundOffset: 0,
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
          ...(last
            ? [
                startGate(at, {
                  player: { s: length - options.playerBehindLine, lateral: laneCentre('b') },
                  originals: { car: [], bike: [] },
                  lanes: ['a', 'b'],
                  laneWidth: LANE,
                  limits: [crossSection.limit + LANE / 2, crossSection.limit - LANE / 2],
                  line: length,
                }),
              ]
            : []),
        ],
      } as SectionDocument;
    });
    return courseDocument(name, sections, chainLinks(sections, 'a', true), laps);
  };
  return { document: write(options.profile ?? laidProfile(heights, null)), sections: starts.length, heights, write };
}
