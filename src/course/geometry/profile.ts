import { compileStationSequence, stationSequenceChainage, stationIndexAt } from './station-sequence.js';

export interface ProfileKnot {
  readonly s: number;
  readonly y: number;
  readonly curveLength: number;
}
export interface ProfileSample {
  y: number;
  dYdS: number;
}
export interface ProfileReader {
  readonly knots: readonly ProfileKnot[];
  sample(s: number): number;
  sampleDifferential(s: number, out?: ProfileSample): ProfileSample;
}
export interface ProfilePolylineSample {
  y: number;
  grade: number;
  segmentIndex: number;
  sStart: number;
  sEnd: number;
}
export interface ProfilePolylineReader {
  readonly vertices: readonly { readonly s: number; readonly y: number }[];
  sample(s: number, out?: ProfilePolylineSample): ProfilePolylineSample;
  distanceToNextVertex(s: number): number;
}

/** Maximum station interval inside each vertical parabola, in metres. */
export const PROFILE_CURVE_POLYLINE_STEP_METERS = 2;

/** PVI heights and the grades of their connecting tangents define the authoritative road. */
export class Profile implements ProfileReader {
  readonly knots: readonly ProfileKnot[];
  readonly #grades: readonly number[];
  readonly #scratch = { y: 0, dYdS: 0 };
  constructor(
    readonly courseLength: number,
    knots: readonly ProfileKnot[],
  ) {
    this.knots = compileStationSequence(knots, {
      length: courseLength,
      chainage: 's',
      endNode: true,
    });
    this.#grades = Object.freeze(
      this.knots.slice(1).map((b, i) => (b.y - this.knots[i]!.y) / (b.s - this.knots[i]!.s)),
    );
  }
  sample(s: number): number {
    return this.sampleDifferential(s, this.#scratch).y;
  }
  sampleDifferential(s: number, out = { y: 0, dYdS: 0 }): ProfileSample {
    const local = stationSequenceChainage(s, this.courseLength);
    const i = Math.min(this.knots.length - 2, stationIndexAt(this.knots, 's', local));
    const next = this.knots[i + 1]!;
    const curveIndex = local < next.s - next.curveLength / 2 ? i : i + 1;
    const knot = this.knots[curveIndex]!;
    if (knot.curveLength > 0 && Math.abs(local - knot.s) <= knot.curveLength / 2) {
      const before = this.#grades[curveIndex - 1]!,
        after = this.#grades[curveIndex]!;
      const x = local - (knot.s - knot.curveLength / 2);
      out.y =
        knot.y - (before * knot.curveLength) / 2 + before * x + ((after - before) * x * x) / (2 * knot.curveLength);
      out.dYdS = before + ((after - before) * x) / knot.curveLength;
    } else {
      const a = this.knots[i]!,
        grade = this.#grades[i]!;
      out.y = a.y + grade * (local - a.s);
      out.dYdS = grade;
    }
    return out;
  }
}

/** Display geometry sampled from the Profile; tangencies and zero-length PVIs are exact vertices. */
export class ProfilePolyline implements ProfilePolylineReader {
  readonly courseLength: number;
  readonly vertices: readonly { readonly s: number; readonly y: number }[];
  constructor(profile: Readonly<Profile>) {
    this.courseLength = profile.courseLength;
    const stations = new Set<number>([0, profile.courseLength]);
    for (const knot of profile.knots) {
      if (knot.curveLength === 0) {
        stations.add(knot.s);
        continue;
      }
      const start = knot.s - knot.curveLength / 2;
      const count = Math.ceil(knot.curveLength / PROFILE_CURVE_POLYLINE_STEP_METERS);
      for (let j = 0; j <= count; j++)
        stations.add(j === count ? knot.s + knot.curveLength / 2 : start + (knot.curveLength * j) / count);
    }
    this.vertices = Object.freeze(
      [...stations].sort((a, b) => a - b).map((s) => Object.freeze({ s, y: profile.sample(s) })),
    );
  }
  sample(s: number, out = { y: 0, grade: 0, segmentIndex: 0, sStart: 0, sEnd: 0 }): ProfilePolylineSample {
    const local = stationSequenceChainage(s, this.courseLength);
    const i = Math.min(this.vertices.length - 2, stationIndexAt(this.vertices, 's', local));
    const a = this.vertices[i]!,
      b = this.vertices[i + 1]!;
    const grade = (b.y - a.y) / (b.s - a.s);
    out.y = a.y + grade * (local - a.s);
    out.grade = grade;
    out.segmentIndex = i;
    out.sStart = a.s;
    out.sEnd = b.s;
    return out;
  }
  distanceToNextVertex(s: number): number {
    const local = stationSequenceChainage(s, this.courseLength);
    if (local === this.courseLength) return 0;
    return this.vertices[stationIndexAt(this.vertices, 's', local) + 1]!.s - local;
  }
}
