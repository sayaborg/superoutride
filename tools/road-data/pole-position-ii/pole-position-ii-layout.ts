/**
 * One of POLE POSITION II's courses laid out as a course document
 * ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-courses)): its lap from
 * its curve table, cut into Sections, its level profile, lanes, cross-section, limits and gates.
 */
import type { CourseDocument, SectionDocument } from '../../../src/course/course-document.js';
import { chainLinks, courseDocument } from '../shared/course-writing.js';
import { CoursePath, type PathPiece } from '../shared/course-path.js';
import { laidProfile, type RoadHeights } from '../shared/crest-bound.js';
import { startGate } from '../shared/grid-rule.js';
import { sectionProfile, type Profile } from '../shared/road-profile.js';
import {
  domainCuts,
  laneCentre,
  micrometre,
  sectionGates,
  sectionStations,
  stripElement,
  stripeParts,
  writtenPlan,
} from '../shared/section-writing.js';
import { leastLaneRadius } from './pole-position-ii-cross-section.js';
import { baseColor, type Band, type CrossSection } from './pole-position-ii-cross-section.js';
import { LANE } from './pole-position-ii-constants.js';
import { SKY_HORIZON, sectionYawOrigin } from '../shared/sky-baking.js';

/**
 * A band's Strips over a Section from lap station `from`: its base color, with its material, over the whole Section;
 * then each color its palettes in turn give other than the base, a stripe repeated at the band's own cycle (the fewest
 * palettes that repeat, an eighth of the interval each), counted from the lap's start line.
 */
function bandStrips(band: Band, from: number, stations: ReturnType<typeof sectionStations>, interval: number) {
  const base = baseColor(band);
  const [left, right] = [micrometre(band.left), micrometre(band.right)];
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
function cuts(path: CoursePath, finish: number) {
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
}): { document: CourseDocument; sections: number; heights: RoadHeights; write: (profile: Profile) => CourseDocument } {
  const { id, name, lap, crossSection, laps } = options;
  const path = new CoursePath(lap.pieces);
  const length = path.length;
  const starts = cuts(path, length);
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
      return {
        id: `${id}-${i + 1}`,
        plan,
        profile: knots,
        lanes: [
          { kind: 'lane', id: 'a', width: LANE },
          { kind: 'lane', id: 'b', width: LANE },
        ],
        centerLane: 'a',
        centerLateral: micrometre(-LANE / 2),
        boundaries: [-1, 1].map((side) => ({
          id: side < 0 ? 'outer-left' : 'outer-right',
          knots: [startAt, endAt].map((position) => ({ at: position, lateral: micrometre(side * crossSection.limit) })),
        })),
        strips: [
          ...crossSection.bands.flatMap((band) => bandStrips(band, from, stations, options.interval)),
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
        sprites: [],
        environments: [
          {
            at: startAt,
            name,
            background: {
              image: options.sky,
              horizonY: SKY_HORIZON,
              yawOrigin: micrometre(
                sectionYawOrigin(0, ((path.pose(from).heading - path.pose(0).heading) * 180) / Math.PI),
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
