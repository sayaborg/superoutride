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
