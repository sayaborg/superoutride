import { compileKnotSequence, knotSequenceChainage, knotIndexAt } from './knot-sequence.js';
import { finite } from '../../core/validation.js';

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
  readonly knots: readonly { readonly s: number; readonly y: number }[];
  sample(s: number, out?: ProfilePolylineSample): ProfilePolylineSample;
  distanceToNextKnot(s: number): number;
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
    for (const knot of knots) {
      finite(knot.y, 'profile knot height');
      finite(knot.curveLength, 'profile curve length');
      if (knot.curveLength < 0) throw new RangeError('Profile curve length must be nonnegative');
    }
    this.knots = compileKnotSequence(knots, { length: courseLength, chainage: 's', label: 'profile', endNode: true });
    if (this.knots[0]!.curveLength !== 0 || this.knots.at(-1)!.curveLength !== 0)
      throw new RangeError('Endpoint profile curves must have zero length');
    for (let i = 1; i < this.knots.length; i++)
      if (this.knots[i - 1]!.s + this.knots[i - 1]!.curveLength / 2 > this.knots[i]!.s - this.knots[i]!.curveLength / 2)
        throw new RangeError('Adjacent profile curves overlap');
    this.#grades = Object.freeze(
      this.knots.slice(1).map((b, i) => (b.y - this.knots[i]!.y) / (b.s - this.knots[i]!.s)),
    );
  }
  sample(s: number): number {
    return this.sampleDifferential(s, this.#scratch).y;
  }
  sampleDifferential(s: number, out = { y: 0, dYdS: 0 }): ProfileSample {
    const local = knotSequenceChainage(s, this.courseLength, 'profile');
    const i = Math.min(this.knots.length - 2, knotIndexAt(this.knots, 's', local));
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
  readonly knots: readonly { readonly s: number; readonly y: number }[];
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
    this.knots = Object.freeze(
      [...stations].sort((a, b) => a - b).map((s) => Object.freeze({ s, y: profile.sample(s) })),
    );
  }
  sample(s: number, out = { y: 0, grade: 0, segmentIndex: 0, sStart: 0, sEnd: 0 }): ProfilePolylineSample {
    const local = knotSequenceChainage(s, this.courseLength, 'profile polyline');
    const i = Math.min(this.knots.length - 2, knotIndexAt(this.knots, 's', local));
    const a = this.knots[i]!,
      b = this.knots[i + 1]!;
    const grade = (b.y - a.y) / (b.s - a.s);
    out.y = a.y + grade * (local - a.s);
    out.grade = grade;
    out.segmentIndex = i;
    out.sStart = a.s;
    out.sEnd = b.s;
    return out;
  }
  distanceToNextKnot(s: number): number {
    const local = knotSequenceChainage(s, this.courseLength, 'profile polyline');
    if (local === this.courseLength) return 0;
    return this.knots[knotIndexAt(this.knots, 's', local) + 1]!.s - local;
  }
}
