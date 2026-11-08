/**
 * A road that closes no lap laid out as a course document ([A road laid out](../../../docs/original-road-data.md#a-road-laid-out)):
 * cut into Sections where its original changes something at once and where it comes near itself, its plan and profile,
 * its course limits and the ground reaching them, its start and gates; the lanes, the road's own Strips and the skies
 * each original gives a Section.
 */
import type {
  BoundaryDocument,
  CourseDocument,
  CourseLateralLine,
  CoursePosition,
  EnvironmentDocument,
  LaneDocument,
  Lateral,
  SectionDocument,
  StripElementDocument,
} from '../../../src/course/course-document.js';
import { computedValue } from '../../authoring/course-joints.js';
import { contractUnmet } from './conversion-errors.js';
import { courseDocument, link } from './course-writing.js';
import { CoursePath, type PathPiece } from './course-path.js';
import { laidProfile, type RoadHeights } from './crest-bound.js';
import { ruleGrid, startGate, type StartGrids } from './grid-rule.js';
import { groundToLimits, programLimitLines, type ProgramLimits } from './program-limits.js';
import type { Band } from './road-surface.js';
import { sectionProfile, type Bend, type Kink, type Profile } from './road-profile.js';
import { domainCuts, sectionGates, sectionStations, writtenPlan, type CourseGate } from './section-writing.js';

/** A Section's stretch of the road: its id and its stations. */
export interface RoadSpan {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

/** What an original gives each Section, its stations' Positions by `positionAt`. */
export interface SectionParts {
  /** Its lanes, left to right, lane `centerLane`'s centre `centerLateral` right of P, and the lane its Link leaves by. */
  readonly lanes: readonly LaneDocument[];
  readonly centerLane: string;
  readonly centerLateral: CourseLateralLine;
  readonly linkLane: string;
  /**
   * Its road's own Strips, and its outermost bands either side with their laterals, which the ground reaches out from,
   * their metres the Section's.
   */
  readonly strips: readonly StripElementDocument[];
  readonly outermost: readonly [
    { readonly band: Band; readonly left: Lateral; readonly right: Lateral },
    { readonly band: Band; readonly left: Lateral; readonly right: Lateral },
  ];
  /** Its course limits, which the format holds straight within it: no jump but at its ends. */
  readonly limits: ProgramLimits;
  readonly environments: readonly EnvironmentDocument[];
  /** Its own Boundaries beside its limits' (a road not taken's edges), and its Strips laid over the ground. */
  readonly boundaries?: readonly BoundaryDocument[];
  readonly over?: readonly StripElementDocument[];
}

/** A road's course: its options, each Section's parts by `section`. */
export interface RoadLayout {
  /** Its Sections' ids' prefix and its name. */
  readonly id: string;
  readonly name: string;
  /** Its plan from its start, station 0. */
  readonly pieces: readonly PathPiece[];
  /** Where its Sections are cut, beside where it comes within `reach` of itself: where its original changes at once. */
  readonly cuts: readonly number[];
  readonly reach: number;
  /** Its heights' changes of grade. */
  readonly road: { readonly bends: readonly Bend[]; readonly kinks: readonly Kink[] };
  /** Its start's grids, which lie in its first Section, and its gates. */
  readonly grids: StartGrids;
  readonly checkpoints: readonly CourseGate[];
  readonly finish: CourseGate;
  readonly section: (span: RoadSpan, positionAt: (s: number) => CoursePosition) => SectionParts;
}

/** Whether a Section's limits hold straight within it: each side's stations strictly in order. */
const straight = (knots: readonly (readonly [number, number])[]) =>
  knots.every((k, i) => i === 0 || k[0] > knots[i - 1]![0]);

/** The road laid out: its Sections, cut at `cuts` and where it comes near itself, and its document by a profile. */
export function layRoad(options: RoadLayout): {
  document: CourseDocument;
  spans: readonly RoadSpan[];
  heights: RoadHeights;
  write: (profile: Profile) => CourseDocument;
} {
  const { id, name, finish } = options;
  const path = new CoursePath(options.pieces);
  const length = path.length;
  if (finish.s >= length) throw contractUnmet(`${name}'s finish lies past its road`);
  const gateStations = [...options.checkpoints.map((g) => g.s), finish.s];
  const required = [0, ...[...new Set(options.cuts)].filter((s) => s > 0 && s < length).sort((a, b) => a - b), length];
  const starts = required
    .slice(0, -1)
    .flatMap((a, i) => [
      a,
      ...domainCuts(path, a, required[i + 1]!, options.reach, gateStations, { finish: finish.s }),
    ]);
  const spans: RoadSpan[] = starts.map((from, i) => ({ id: `${id}-${i + 1}`, from, to: starts[i + 1] ?? length }));
  if ([...ruleGrid('car', options.grids), ...ruleGrid('bike', options.grids)].some((slot) => slot.s >= spans[0]!.to))
    throw contractUnmet(`${name}'s grid reaches past its first Section`);
  const heights: RoadHeights = {
    road: options.road,
    mounds: { bends: [], kinks: [] },
    cuts: starts.slice(1),
    length,
    lap: false,
  };
  const write = (profile: Profile): CourseDocument => {
    const linkLanes: string[] = [];
    const sections = spans.map((span, i): SectionDocument => {
      const { from, to } = span;
      const plan = writtenPlan(path, span);
      const stations = sectionStations(plan);
      const endAt = { joint: stations.joint, offset: stations.size };
      const positionAt = (s: number) => (s === to ? endAt : stations.at(s - from));
      const parts = options.section(span, positionAt);
      if (!straight(parts.limits.left) || !straight(parts.limits.right))
        throw contractUnmet(`${name}'s course limits jump within its Section ${span.id}`);
      linkLanes.push(parts.linkLane);
      const first = i === 0,
        last = i === spans.length - 1;
      const knots = sectionProfile(profile, from, to, !first, !last, stations.size);
      return {
        id: span.id,
        plan,
        profile: knots.map((k, j) => ({
          at:
            j === 0 || j === knots.length - 1
              ? positionAt(k.s)
              : { joint: stations.joint, offset: computedValue(k.s - from) },
          y: k.y,
          curveLength: k.curveLength,
        })),
        lanes: parts.lanes,
        centerLane: parts.centerLane,
        centerLateral: parts.centerLateral,
        boundaries: [...programLimitLines(parts.limits).boundaries(from, to, positionAt), ...(parts.boundaries ?? [])],
        strips: [
          ...parts.strips,
          ...groundToLimits(parts.outermost, parts.limits, from, to, positionAt, true),
          ...(parts.over ?? []),
        ],
        walls: [],
        openLimits: [],
        sprites: [],
        environments: parts.environments,
        gates: [
          ...(first ? [startGate(positionAt, options.grids)] : []),
          ...sectionGates(stations, from, options.checkpoints, finish),
        ],
      };
    });
    const links = spans.slice(0, -1).map((span, i) => link(span.id, linkLanes[i]!, spans[i + 1]!.id));
    return courseDocument(name, sections, links);
  };
  const document = write(laidProfile(heights, null));
  return { document, spans, heights, write };
}
