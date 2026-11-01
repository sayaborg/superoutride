/**
 * What a conversion makes ([Raising the originals again](../../../docs/original-road-data.md#raising-the-originals-again)):
 * its files by their paths in the originals' place, and the parts of its report.
 */
import { ORIGINALS_PLACE } from '../../authoring/content-places.js';
import { formatSavedJson } from '../../../src/content/saved-json.js';
import { normalizeCoursePositions } from '../../authoring/course-joints.js';
import type { Json } from '../../authoring/json-pointer.js';
import { readCourseDocument, type CourseDocument } from '../../../src/course/course-document.js';
import { VEHICLE_GRAVITY } from '../../../src/vehicle/physics/vehicle-state.js';
import { planFidelity } from './heading-plan.js';
import type { Overpass, Parting, Passage } from './overpasses.js';
import { sectionProfile, type Profile } from './road-profile.js';
import { boundProfile } from '../../../src/course/geometry/profile-bound.js';
import { Profile as SectionHeights, type ProfileKnot } from '../../../src/course/geometry/profile.js';
import { CREST_CHOICES, CREST_RULE_KMH, DIP_CHOICES, crestBounds } from '../../../src/race/crest-bounds.js';
import type { RomSet } from './rom-set.js';
import { CLEARANCE, VECTOR_RESOLUTION } from './shared-constants.js';

/** Where a conversion's file lies in the repository: `path` under the originals' place (`courses/…`, `images/…`). */
export const originalFile = (path: string) => `content/${ORIGINALS_PLACE}/${path}`;

/** A conversion's files by their paths in the originals' place (`courses/<id>.course.json`, `images/<name>.json`). */
export class OriginalOutputs {
  readonly #files = new Map<string, Uint8Array>();

  /** The paths of the files, in the order they were added. */
  get paths(): readonly string[] {
    return [...this.#files.keys()];
  }

  /** The bytes of the file at `place`, which must be one of the outputs. */
  bytes(place: string): Uint8Array {
    const bytes = this.#files.get(place);
    if (!bytes) throw new Error(`${place} is not an output`);
    return bytes;
  }

  /** A file the conversion writes; a path written twice is an internal fault. */
  file(place: string, bytes: Uint8Array | string) {
    if (this.#files.has(place)) throw new Error(`${place} is written twice`);
    this.#files.set(place, typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes);
  }

  /**
   * A course document as the ROMs alone determine it, its Positions normalized, saved as the course format admits it;
   * its path in the originals' place.
   */
  course(id: string, document: CourseDocument): string {
    const place = `courses/${id}.course.json`,
      file = originalFile(place);
    const read = readCourseDocument(normalizeCoursePositions(document as unknown as Json).document, file);
    if (!read.ok) throw Object.assign(new Error(`${file} does not read`), { diagnostics: read.diagnostics });
    this.file(place, formatSavedJson(read.value));
    return place;
  }
}

/**
 * An original's conversion: from its ROM set alone, the files it raises (its courses, pictures and skies) and its
 * report. Reading the zips and writing or comparing the files are its command's.
 */
export type Conversion = (set: RomSet) => {
  readonly outputs: OriginalOutputs;
  readonly report: Readonly<Record<string, unknown>>;
};

/** A value rounded to tenths, and to thousandths. */
export const round1 = (value: number) => Math.round(value * 10) / 10;
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * A parted overpass's report: its passages, each one's rise and height at its middle (by `height`), and their least
 * height apart after and before (`raw`), metres.
 */
export const overpassReport = (
  overpass: { readonly passages: readonly Passage[] } & Parting,
  height: (s: number) => number,
) => ({
  passages: overpass.passages.map((p) => [round1(p.from), round1(p.to)]),
  rises: overpass.rises.map(round1),
  apart: round3(overpass.apart),
  raw: round3(overpass.raw),
  heights: overpass.passages.map((p) => round1(height((p.from + p.to) / 2))),
});
/**
 * A road's grades as the commands report them, sampled every metre to `end`: its heights' range and its end's, its
 * steepest grade by its screen's `pieces` alone and with all else (`profile`: overpasses, jumps, dips), the pieces'
 * `overlaps`, and its flights at `kmh`, the stretches where the load on a crest falls below 0 (the car leaves the road):
 * their count and the longest, metres.
 */
export function gradeReport(
  profile: Profile,
  pieces: Profile,
  end: number,
  kmh: number,
  overlaps?: { readonly count: number; readonly metres: number },
) {
  const stations = Array.from({ length: Math.floor(end) + 1 }, (_, s) => s);
  const steepest = (p: Profile) => round3(Math.max(...stations.map((s) => Math.abs(p.grade(s)))));
  const v = kmh / 3.6;
  const flights: number[] = [];
  let last = -Infinity;
  for (const b of profile.bends)
    if (1 + (v * v * b.curvature) / VEHICLE_GRAVITY < 0) {
      if (b.from - last <= 1e-6) flights[flights.length - 1]! += b.to - b.from;
      else flights.push(b.to - b.from);
      last = b.to;
    }
  return {
    heights: [round1(Math.min(...stations.map(profile.height))), round1(Math.max(...stations.map(profile.height)))],
    endHeight: round1(profile.height(end)),
    steepest: { pieces: steepest(pieces), course: steepest(profile) },
    ...(overlaps ? { overlaps: { count: overlaps.count, metres: round1(overlaps.metres) } } : {}),
    flights: { kmh, count: flights.length, longest: round1(Math.max(0, ...flights)) },
  };
}
/**
 * The crests of `knots` that fly at `kmh`: runs of curves, and kinks, whose grade falls fast enough that the load falls
 * below 0, each run one crest.
 */
function flyingCrests(knots: readonly ProfileKnot[], kmh: number) {
  const v = kmh / 3.6;
  let [count, flying] = [0, false];
  for (let i = 1; i < knots.length - 1; i++) {
    const [a, k, b] = [knots[i - 1]!, knots[i]!, knots[i + 1]!];
    const change = (b.y - k.y) / (b.s - k.s) - (k.y - a.y) / (k.s - a.s);
    const flies = change < 0 && (k.curveLength === 0 || 1 + (v * v * change) / k.curveLength / VEHICLE_GRAVITY < 0);
    if (flies && !flying) count++;
    flying = flies;
  }
  return count;
}

/**
 * What the crests and dips rule ([Original road data](../../../docs/original-road-data.md#crests-and-dips)) does to a
 * road, Section by Section as it lays them at load: its Sections are `profile` between its stations `origins` (0 to its
 * end), each as written (`sectionProfile`). For each setting of the DEV choices, how far the road moves (the most, and the share of
 * its length, every metre, moved 0.5 m or more), how many crests still fly at 200 km/h, and its overpasses' least height
 * apart and how many come nearer than `CLEARANCE`; with the crests that fly as written.
 */
export function crestsReport(
  profile: Profile,
  origins: readonly number[],
  overpasses: readonly Pick<Overpass, 'pairs'>[] = [],
) {
  const ends = origins;
  const end = origins.at(-1)!;
  const sections = ends.slice(1).map((to, i) => {
    const from = ends[i]!;
    const knots = sectionProfile(profile, from, to, i > 0, i < ends.length - 2).map((k) => ({ ...k, s: k.s - from }));
    return { from, to, knots };
  });
  const flying = sections.reduce((n, s) => n + flyingCrests(s.knots, CREST_RULE_KMH), 0);
  const settings = CREST_CHOICES.flatMap((a) => DIP_CHOICES.map((b) => [a, b] as const)).filter(
    ([a, b]) => a !== null || b !== null,
  );
  return {
    crests: {
      kmh: CREST_RULE_KMH,
      flying,
      settings: settings.map(([a, b]) => {
        const bounds = crestBounds(a, b)!;
        const laid = sections.map((s) => {
          const knots = boundProfile(s.knots, s.to - s.from, bounds);
          return { ...s, laid: knots, heights: new SectionHeights(s.to - s.from, knots) };
        });
        const height = (at: number) => {
          const s = laid.find((l) => at <= l.to) ?? laid.at(-1)!;
          return s.heights.sample(Math.min(s.to, Math.max(s.from, at)) - s.from);
        };
        let [most, moved] = [0, 0];
        const metres = Math.floor(end);
        for (let at = 0; at <= metres; at++) {
          const d = Math.abs(height(at) - profile.height(at));
          most = Math.max(most, d);
          if (d >= 0.5) moved++;
        }
        const apart = overpasses.map((o) => Math.min(...o.pairs.map(([p, q]) => Math.abs(height(p) - height(q)))));
        return {
          crest: a,
          dip: b,
          most: round1(most),
          moved: round3(moved / (metres + 1)),
          flying: laid.reduce((n, l) => n + flyingCrests(l.laid, CREST_RULE_KMH), 0),
          apart: {
            least: apart.length ? round3(Math.min(...apart)) : null,
            within: apart.filter((d) => d < CLEARANCE).length,
          },
        };
      }),
    },
  };
}

/**
 * A plan's fidelity to its table (`planFidelity`), as the commands report it: its heading's most departure, in the
 * table's resolution, and the count of positions beyond it; its position's most drift, metres; and each widened turn's
 * table positions with its heading's and position's most there.
 */
export const fidelityReport = (fidelity: ReturnType<typeof planFidelity>, span?: string) => ({
  heading: round3(fidelity.heading / VECTOR_RESOLUTION),
  beyond: fidelity.beyond.length,
  positionDrift: round3(fidelity.drift),
  widened: fidelity.turns.map((t) => ({
    ...(span === undefined ? {} : { span }),
    at: [round1(t.from), round1(t.to)],
    heading: round3(t.heading / VECTOR_RESOLUTION),
    drift: round3(t.drift),
  })),
});

/** How many of the objects that differ a report lists, for each road. */
const LISTED = 10;

/**
 * An object where it stands, along the road and across it (which follows the road's width there), and what tells it
 * from the others: its board, palette and height.
 */
export interface Standing {
  readonly position: number;
  readonly x: number;
  readonly key: string;
}

/**
 * The objects of `limit` and `ticks` paired, each kind (`key`) in position order, where they stand within `tolerance`
 * road positions of each other: how many pair, the most a pair stands apart along the road and across it, and the first
 * `LISTED` of those that pair with none on each side.
 */
export function compareStandings(limit: readonly Standing[], ticks: readonly Standing[], tolerance: number) {
  const byKey = (list: readonly Standing[]) => {
    const groups = new Map<string, Standing[]>();
    for (const o of list) (groups.get(o.key) ?? groups.set(o.key, []).get(o.key)!).push(o);
    for (const group of groups.values()) group.sort((x, y) => x.position - y.position || x.x - y.x);
    return groups;
  };
  const a = byKey(limit),
    b = byKey(ticks);
  let paired = 0,
    along = 0,
    across = 0;
  const onlyLimit: Standing[] = [],
    onlyTicks: Standing[] = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const p = a.get(key) ?? [],
      q = b.get(key) ?? [];
    let i = 0,
      j = 0;
    while (i < p.length || j < q.length) {
      const [x, y] = [p[i], q[j]];
      if (x && y && Math.abs(x.position - y.position) <= tolerance) {
        along = Math.max(along, Math.abs(x.position - y.position));
        across = Math.max(across, Math.abs(x.x - y.x));
        paired++;
        i++;
        j++;
      } else if (x && (!y || x.position < y.position)) {
        onlyLimit.push(x);
        i++;
      } else {
        onlyTicks.push(y!);
        j++;
      }
    }
  }
  const listed = (list: Standing[]) =>
    list
      .sort((x, y) => x.position - y.position)
      .slice(0, LISTED)
      .map((o) => ({ position: round3(o.position), x: round3(o.x), object: o.key }));
  return {
    limit: limit.length,
    ticks: ticks.length,
    paired,
    mostApart: { along: round3(along), across: round3(across) },
    onlyLimit: { count: onlyLimit.length, first: listed(onlyLimit) },
    onlyTicks: { count: onlyTicks.length, first: listed(onlyTicks) },
  };
}
