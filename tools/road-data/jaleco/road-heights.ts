/**
 * The heights of JALECO's driving board's roads ([Original road
 * data](../../../docs/original-road-data.md#profile-from-the-originals-screen), [BIG RUN road
 * data](../../../docs/big-run-road-data.md#its-heights)): a road's 3D road, its straights and vertical arcs, as a profile
 * along its positions, before the factor a conversion takes.
 */
import { contractUnmet } from '../shared/conversion-errors.js';
import { profileOf, type Bend, type Kink, type Profile } from '../shared/road-profile.js';
import { angleRadians, type RoadProfileRecord, type RoadTablesAt } from './road-tables.js';

/**
 * A road's profile to `end` (positions up, positions along), from its records: each record's grade its height's rise a
 * position, the sine of its grade's angle where it starts, as the table's heights rise; a vertical arc's grade changing
 * evenly to the next record's, a straight's at once where it ends, the last record's arc to its angle at `end` by its
 * radius. Returns the profile, laid from the first record at height 0, and the most it departs from the table's
 * heights where each record starts.
 */
export function tableProfile(tables: RoadTablesAt, records: readonly RoadProfileRecord[], end: number) {
  const unit = angleRadians(tables);
  if (!records.length || records[0]!.start !== 0) throw contractUnmet("A road's profile does not start at 0");
  const sine = (grade: number) => Math.sin(grade * unit);
  const bends: Bend[] = [];
  const kinks: Kink[] = [{ at: 0, change: sine(records[0]!.grade) }];
  records.forEach((r, i) => {
    const next = records[i + 1];
    const to = next?.start ?? end;
    if (!(to > r.start)) throw contractUnmet(`A profile record at ${r.start} has no length`);
    const last = next?.grade ?? r.grade + ((r.rising ? 1 : -1) * (r.radius ? (to - r.start) / r.radius : 0)) / unit;
    const change = sine(last) - sine(r.grade);
    if (change === 0) return;
    if (r.radius) bends.push({ from: r.start, to, curvature: change / (to - r.start) });
    else if (next) kinks.push({ at: to, change });
  });
  const profile: Profile = profileOf(bends, [], kinks);
  const departure = Math.max(
    ...records.map((r) => Math.abs(profile.height(r.start) - (r.height - records[0]!.height))),
  );
  return { profile, departure };
}

/** A road's steepest grade among its records that start before `before`: the tangent of its grade's angle. */
export const steepestRecordGrade = (tables: RoadTablesAt, records: readonly RoadProfileRecord[], before: number) =>
  Math.max(...records.filter((r) => r.start < before).map((r) => Math.abs(Math.tan(r.grade * angleRadians(tables)))));

/** A 3D road laid as its arcs are: its height and its angle along its positions. */
export interface ArcRoad {
  /** Its height at position `s`, positions up, laid from its first record at height 0. */
  height(s: number): number;
  /** Its angle at position `s`, radians up, as its records give it, a jump where one starts at another angle. */
  angle(s: number): number;
  /** The most its height departs from the table's where each record starts. */
  readonly departure: number;
}

/**
 * A road's 3D road to `end` laid as its arcs are (CISCO HEAT's): a straight at its record's angle, a vertical arc's
 * angle changing evenly along it by its length over its radius, up where its record rises; each record from its own
 * angle, so that where one starts at another angle than the record before ends at, the road kinks there.
 */
export function arcRoad(tables: RoadTablesAt, records: readonly RoadProfileRecord[], end: number): ArcRoad {
  if (!records.length || records[0]!.start !== 0) throw contractUnmet("A road's 3D road does not start at 0");
  const unit = angleRadians(tables);
  const pieces: { readonly from: number; readonly height: number; readonly angle: number; readonly bend: number }[] =
    [];
  let height = 0;
  records.forEach((r, i) => {
    const to = records[i + 1]?.start ?? end;
    if (!(to > r.start)) throw contractUnmet(`A profile record at ${r.start} has no length`);
    const piece = { from: r.start, height, angle: r.grade * unit, bend: r.radius ? (r.rising ? 1 : -1) / r.radius : 0 };
    pieces.push(piece);
    height = rise(piece, to - r.start) + height;
  });
  const pieceAt = (s: number) => {
    let lo = 0;
    for (let hi = pieces.length; hi - lo > 1;) {
      const mid = (lo + hi) >> 1;
      if (pieces[mid]!.from <= s) lo = mid;
      else hi = mid;
    }
    return pieces[lo]!;
  };
  const road = {
    height: (s: number) => {
      const p = pieceAt(s);
      return p.height + rise(p, s - p.from);
    },
    angle: (s: number) => {
      const p = pieceAt(s);
      return p.angle + p.bend * (s - p.from);
    },
  };
  const departure = Math.max(...records.map((r) => Math.abs(road.height(r.start) - (r.height - records[0]!.height))));
  return { ...road, departure };
}

/** A piece's rise over `d` positions from its start: its angle's sine along a straight, along an arc its cosines'. */
function rise(piece: { readonly angle: number; readonly bend: number }, d: number): number {
  if (!piece.bend) return Math.sin(piece.angle) * d;
  return (Math.cos(piece.angle) - Math.cos(piece.angle + piece.bend * d)) / piece.bend;
}
