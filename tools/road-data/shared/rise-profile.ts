/**
 * A rise table's profile ([Original road data](../../../docs/original-road-data.md#profile-from-a-rise-table)): its
 * grades, each at its position, as vertical curves over its runs, each the grades one line holds within the table's
 * resolution, at their lines' rates, joined over the steps between them.
 */
import { headingRuns, type HeadingTable } from './heading-plan.js';
import { bendOf, profileOf, type Change } from './road-profile.js';

/**
 * The profile of `table`, its values grades at its positions, by `resolution`, a grade, as changes of grade at
 * stations `station(position)`: each run's vertical curve over its positions and each join's over the step to the next
 * run, from the grade the profile has reached to its end's on the lines, the road level before the table. With its
 * runs' count and the most its grade departs from the table's at a position.
 */
export function riseProfile(table: HeadingTable, resolution: number, station: (position: number) => number) {
  const runs = headingRuns(table, resolution);
  const { positions } = table;
  const changes: Change[] = [];
  let grade = 0;
  const reach = (from: number, to: number, target: number) => {
    if (to <= from) return;
    if (target !== grade) changes.push({ from: station(from), to: station(to), change: target - grade });
    grade = target;
  };
  runs.forEach((run, k) => {
    const [a, b] = [positions[run.from]!, positions[run.to]!];
    reach(a, b, run.start + run.rate * (b - a));
    const next = runs[k + 1];
    if (next) reach(b, positions[next.from]!, next.start);
  });
  const profile = profileOf(changes.map(bendOf));
  const departure = positions.reduce(
    (most, p, i) => Math.max(most, Math.abs(profile.grade(station(p)) - table.headings[i]!)),
    0,
  );
  return { changes, runs: runs.length, departure };
}
