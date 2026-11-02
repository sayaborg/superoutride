/**
 * What a conversion makes ([Raising the originals again](../../../docs/original-road-data.md#raising-the-originals-again)):
 * its files by their paths in the originals' place, and the parts of its report.
 */
import { ORIGINALS_PLACE } from '../../authoring/content-places.js';
import { formatSavedJson } from '../../../src/content/saved-json.js';
import { normalizeCoursePositions } from '../../authoring/course-joints.js';
import type { Json } from '../../authoring/json-pointer.js';
import { readCourseDocument, type CourseDocument } from '../../../src/course/course-document.js';
import { planFidelity } from './heading-plan.js';
import type { Profile } from './road-profile.js';
import { crestedRoad, crestStretches, laidProfile, type RoadHeights } from './crest-bound.js';
import { CREST_TRIAL_KMH } from '../../../src/content/crest-trials.js';
import type { RomSet } from './rom-set.js';
import { VECTOR_RESOLUTION } from './shared-constants.js';

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
    const place = `courses/${id}.course.json`;
    this.file(place, saved(document, originalFile(place)));
    return place;
  }

  /**
   * A course's crest trials ([Original road data](../../../docs/original-road-data.md#crests)): its Sections' profiles
   * in each document of `trials`, by its speed and the Section's id, as the course saves them; its path in the
   * originals' place.
   */
  crestTrials(id: string, trials: ReadonlyMap<number, CourseDocument>): string {
    const place = `crest-trials/${id}.json`;
    const profiles = (document: CourseDocument) => {
      const read = JSON.parse(saved(document, originalFile(place))) as CourseDocument;
      return Object.fromEntries(read.sections.map((section) => [section.id, section.profile]));
    };
    this.file(place, JSON.stringify(Object.fromEntries([...trials].map(([kmh, d]) => [kmh, profiles(d)]))) + '\n');
    return place;
  }
}

/** A course document as the ROMs alone determine it, its Positions normalized, saved as the course format admits it. */
function saved(document: CourseDocument, file: string) {
  const read = readCourseDocument(normalizeCoursePositions(document as unknown as Json).document, file);
  if (!read.ok) throw Object.assign(new Error(`${file} does not read`), { diagnostics: read.diagnostics });
  return formatSavedJson(read.value);
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
 * A road's grades as the commands report them, sampled every metre to its end: its profile's heights' range and its
 * end's, its steepest grade by its screen's `pieces` alone and with all else (jumps, dips), the pieces' `overlaps`; and
 * what the crests rule ([Original road data](../../../docs/original-road-data.md#crests)) does to it at each trial
 * speed: the stretches it lays, the most it moves the road and the share of its length moved 0.5 m or more.
 */
export function gradeReport(
  heights: RoadHeights,
  pieces: Profile,
  overlaps?: { readonly count: number; readonly metres: number },
) {
  const profile = laidProfile(heights, null);
  const stations = Array.from({ length: Math.floor(heights.length) + 1 }, (_, s) => s);
  const steepest = (p: Profile) => round3(Math.max(...stations.map((s) => Math.abs(p.grade(s)))));
  const road = crestedRoad(heights, null);
  return {
    heights: [round1(Math.min(...stations.map(profile.height))), round1(Math.max(...stations.map(profile.height)))],
    endHeight: round1(profile.height(heights.length)),
    steepest: { pieces: steepest(pieces), course: steepest(profile) },
    ...(overlaps ? { overlaps: { count: overlaps.count, metres: round1(overlaps.metres) } } : {}),
    crests: Object.fromEntries(
      CREST_TRIAL_KMH.map((kmh) => {
        const crested = crestedRoad(heights, kmh);
        const moved = stations.map((s) => Math.abs(crested.height(s) - road.height(s)));
        return [
          kmh,
          {
            stretches: crestStretches(crested, kmh).length,
            most: round1(Math.max(...moved)),
            moved: round3(moved.filter((d) => d >= 0.5).length / stations.length),
          },
        ];
      }),
    ),
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
