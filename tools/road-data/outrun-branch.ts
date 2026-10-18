/**
 * OUTRUN as one BRANCH course ([Original road data](../../docs/original-road-data.md#outrun)): its 15 stages, each
 * ending in the fork stretch, whose roads switch and close to the next stage's width, or in its goal stretch.
 */
import { requireInput } from '../course/authoring-io.js';
import {
  ROAD_EDGE,
  roadSection,
  roadWidths,
  START_WIDTH,
  stagePlan,
  stageRoad,
  stationOf,
  type PlanSegment,
  type Road,
  type RoadAfter,
  type RoadGate,
  type RoadSection,
} from './outrun-course.js';
import { OUTRUN_STAGES, pathOffset, type HeightTable, type Path, type Stage, type Stretch } from './outrun-road.js';

/**
 * The fork, as the main CPU's program runs it (0x8780 to 0x89B6): at the stage's end the road width is kept and the
 * fork stretch begins; from its position 63 the roads part by 8 units a position; beyond 0x168 (360) the route is the
 * side of the roads' middle the car is on; beyond 0x300 (768) the roads switch, the car carried to the other road's
 * place, and close by 8 a position to 0xD4 (212), the next stage's width at its start, which begins at the stretch's
 * 0x180 (384).
 */
const PARTS = 63;
const SPREAD = 8;
const CHOSEN_WIDTH = 0x168;
const SWITCH_WIDTH = 0x300;
const NEXT_WIDTH = 0xd4;
const FORK_LENGTH = 0x180;
/**
 * The straight on which the fork's lock and closure stand where the route is chosen, positions, the road width held
 * over it (the format's fork zone, which the original has not).
 */
const LOCK_ZONE = 2;
/** The goal stretch's road past the finish, positions: its path, to its last straight's end. */
const GOAL_LENGTH = 600;

/** The stages by number: their names on the original's map and their Sections' names. */
export const OUTRUN_NAMES: ReadonlyMap<number, string> = new Map([
  [0x3c, 'COCONUT BEACH'],
  [0x1e, "DEVIL'S CANYON"],
  [0x3b, 'GATEWAY'],
  [0x20, 'CLOUDY MOUNTAIN'],
  [0x2f, 'ALPS'],
  [0x2a, 'DESERT'],
  [0x2d, 'SEASIDE TOWN'],
  [0x35, 'WHEAT FIELD'],
  [0x33, 'OLD CAPITAL'],
  [0x21, 'WILDERNESS'],
  [0x32, 'LAKESIDE'],
  [0x23, 'AUTOBAHN'],
  [0x38, 'DESOLATION HILL'],
  [0x22, 'DEATH VALLEY'],
  [0x26, 'VINEYARD'],
]);
const slug = (name: string) => name.toLowerCase().replace(/'/g, '').replace(/ /g, '-');

/** What OUTRUN's course is raised from beside its stages. */
export interface OutrunInputs {
  readonly stages: ReadonlyMap<number, Stage>;
  readonly fork: Stretch & { readonly path: Path };
  readonly goals: { readonly stretches: readonly Stretch[]; readonly path: Path };
  /** Every stage's length, positions. */
  readonly length: number;
  readonly tables: ReadonlyMap<number, HeightTable>;
  readonly carWidth: number;
  readonly cameraDistance: number;
  readonly kmh: number;
  readonly sky: { readonly image: string; readonly horizonY: number };
}

/**
 * `plan` with a straight over `[at, at + zone)`: the segments it overlaps are cut there, an arc's pieces outside it
 * turning the whole arc's turn between them.
 */
function withStraight(plan: readonly PlanSegment[], at: number, zone: number): PlanSegment[] {
  const pieces = plan.flatMap((s) => {
    const outside = [
      [s.from, Math.min(s.to, at)],
      [Math.max(s.from, at + zone), s.to],
    ].filter(([a, b]) => b! > a!);
    const kept = outside.reduce((sum, [a, b]) => sum + b! - a!, 0);
    requireInput(kept > 0 || s.turn === 0, '/fork/curves', `The fork's lock zone covers the curve at ${s.from}`);
    return outside.map(([from, to]) => ({ from: from!, to: to!, turn: (s.turn * (to! - from!)) / kept }));
  });
  return [...pieces, { from: at, to: at + zone, turn: 0 }].sort((a, b) => a.from - b.from);
}

/**
 * The fork stretch after a stage ending at road width `width`, to the next stage's start: where the route is chosen
 * (`lock`), on a straight of `LOCK_ZONE` the curve's pieces either side turn for, where the roads switch, and where the
 * last straight begins, the fork's Section's end (positions from the stage's end).
 */
function forkAfter(
  fork: OutrunInputs['fork'],
  width: number,
): RoadAfter & { readonly lock: number; readonly switch: number; readonly last: number } {
  const lock = PARTS + (CHOSEN_WIDTH - width) / SPREAD;
  const at = lock + LOCK_ZONE + (SWITCH_WIDTH - CHOSEN_WIDTH) / SPREAD;
  const closed = at + (SWITCH_WIDTH - NEXT_WIDTH) / SPREAD;
  const plan = withStraight(
    stagePlan(fork.curves, fork.path, pathOffset(fork.curves, fork.path, FORK_LENGTH), FORK_LENGTH),
    lock,
    LOCK_ZONE,
  );
  const last = plan.at(-1)!.from;
  requireInput(closed <= last, '/fork', `The roads close beyond the fork's last straight at ${closed}`);
  return {
    end: FORK_LENGTH,
    lock,
    switch: at,
    last,
    plan,
    widths: (w) => [
      [0, w],
      [PARTS, w],
      [lock, CHOSEN_WIDTH],
      [lock + LOCK_ZONE, CHOSEN_WIDTH],
      [at, SWITCH_WIDTH],
      [closed, NEXT_WIDTH],
      [FORK_LENGTH, NEXT_WIDTH],
    ],
  };
}

/** Goal stretch `goal` after a stage: its road to `GOAL_LENGTH`, its widths from the stage's. */
function goalAfter(goals: OutrunInputs['goals'], goal: number): RoadAfter {
  const stretch = goals.stretches[goal]!;
  return {
    end: GOAL_LENGTH,
    plan: stagePlan(stretch.curves, goals.path, pathOffset(stretch.curves, goals.path, GOAL_LENGTH), GOAL_LENGTH),
    widths: (w) => roadWidths(stretch.widthsHeights, GOAL_LENGTH, w),
  };
}

/**
 * Where a road is cut into Sections beside `fixed` cuts, so that no Section's coordinate domain overlaps itself: for
 * each overlap whose passages no cut parts, the last joint before its later passage, after its earlier, where the road is
 * one (its width under 236), before `before` (a fork's choice).
 */
function overpassCuts(road: Road, fixed: readonly number[], before: number, name: string): number[] {
  const cuts = [...fixed];
  const joints = road.plan.map((s) => s.from).filter((p) => p > 0 && p < before && road.widthAt(p) < ROAD_EDGE);
  const passages = road.overlaps
    .map((pairs) => [Math.max(...pairs.map(([a]) => a)), Math.min(...pairs.map(([, b]) => b))] as const)
    .sort((x, y) => x[1] - y[1]);
  for (const [a, b] of passages) {
    if (cuts.some((c) => a < stationOf(c) && stationOf(c) <= b)) continue;
    const cut = joints.filter((p) => a < stationOf(p) && stationOf(p) <= b).at(-1);
    requireInput(cut !== undefined, `/${name}`, `No joint where the road is one parts ${name}'s overlap at ${a} m`);
    cuts.push(cut);
  }
  return cuts.sort((x, y) => x - y);
}

/**
 * OUTRUN as a course document, its Positions still measured from each Section's first joint. Each stage is a road from
 * GO to its end and what follows. A fork stage's is the fork stretch: its last Section holds the route's choice and the
 * switch, with the roads appearing beside both, to the stretch's last straight; there a Section for each road carries
 * it on, the left one on lane b as the right road of the next stage's pair (its centre lane e), the right one on lane e
 * as the left (its centre lane b), to the next stage's start on lane b, its checkpoint at its end. A goal stage's is its
 * goal stretch, the finish at the stage's end. Left leads to the next row's stage to the right in the stage table, right
 * to the one below. Where a road's coordinate domain passes over itself, its passages lie in different Sections.
 */
export function outrunCourse(inputs: OutrunInputs) {
  const { length } = inputs;
  const sections: ReturnType<typeof roadSection>[] = [];
  const links: { id: string; from: { section: string; lane: string }; to: string }[] = [];
  const reports: { stage: number; name: string; cuts: number[]; road: Road }[] = [];
  const firstOf = (number: number) => slug(OUTRUN_NAMES.get(number)!);

  OUTRUN_STAGES.forEach((row, r) =>
    row.forEach((number, column) => {
      const stage = inputs.stages.get(number)!;
      const name = OUTRUN_NAMES.get(number)!;
      const id = slug(name);
      const startWidth = r === 0 ? START_WIDTH : NEXT_WIDTH;
      const width = roadWidths(stage.widthsHeights, length, startWidth).at(-1)![1];
      const goal = r === OUTRUN_STAGES.length - 1;
      const fork = goal ? null : forkAfter(inputs.fork, width);
      const after = fork ?? goalAfter(inputs.goals, column);
      // The fork's Section's end; the road's crossings and overlaps are looked for to there, parted by Sections.
      const last = fork ? length + fork.last : null;
      const options = {
        length,
        after,
        startWidth,
        offset: pathOffset(stage.curves, stage.path, length),
        carWidth: inputs.carWidth,
        tables: inputs.tables,
        kmh: inputs.kmh,
        objects: () => [],
        ...(fork ? { fork: length + fork.switch, crossingsTo: last! } : {}),
      };
      const fixed = last === null ? [] : [last];
      const cuts = overpassCuts(
        stageRoad(stage, { ...options, cuts: fixed }),
        fixed,
        fork ? length + fork.lock : Infinity,
        id,
      );
      const road = stageRoad(stage, { ...options, cuts });
      reports.push({ stage: number, name, cuts, road });

      const starts = [0, ...cuts.filter((c) => c !== last)];
      const ids = starts.map((_, k) => (k === 0 ? id : `${id}-${k + 1}`));
      const section = (spec: Omit<RoadSection, 'name' | 'sky'>) =>
        sections.push(roadSection(road, { ...spec, name, sky: inputs.sky }, inputs.cameraDistance));
      starts.forEach((from, k) => {
        const to = starts[k + 1] ?? last ?? road.end;
        const gates: RoadGate[] = [];
        if (r === 0 && k === 0) gates.push({ kind: 'start' });
        if (goal && from < length && length <= to) gates.push({ kind: 'finish', id: `${id}-GOAL`, position: length });
        if (fork && k === starts.length - 1) {
          const zone = length + fork.lock;
          gates.push(
            { kind: 'lock', position: zone + LOCK_ZONE / 4 },
            { kind: 'closure', position: zone + LOCK_ZONE / 2 },
          );
        }
        section({
          id: ids[k]!,
          from,
          to,
          gates,
          joinsBefore: r > 0 || k > 0,
          joinsAfter: !goal || k < starts.length - 1,
        });
        if (k > 0)
          links.push({ id: `${ids[k - 1]}-${ids[k]}`, from: { section: ids[k - 1]!, lane: 'b' }, to: ids[k]! });
      });
      if (!fork || last === null) return;
      // Beyond the fork's Section: the left road with the road appearing on its left, the right with the one on its
      // right, each as a pair of roads.
      const next = OUTRUN_STAGES[r + 1]!;
      for (const [side, lane, roads, centerLane, to] of [
        ['left', 'b', [0, 1], 'e', next[column + 1]!],
        ['right', 'e', [2, 3], 'b', next[column]!],
      ] as const) {
        const tail = `${id}-${side}`;
        section({
          id: tail,
          from: last,
          to: road.end,
          gates: [{ kind: 'checkpoint', id: `${tail}-CP`, position: road.end }],
          joinsBefore: true,
          joinsAfter: true,
          roads,
          centerLane,
        });
        links.push({ id: `${ids.at(-1)}-${tail}`, from: { section: ids.at(-1)!, lane }, to: tail });
        links.push({ id: `${tail}-${firstOf(to)}`, from: { section: tail, lane: 'b' }, to: firstOf(to) });
      }
    }),
  );

  const document = {
    format: 'superoutride.course',
    version: 52,
    name: 'OUTRUN',
    entry: firstOf(OUTRUN_STAGES[0]![0]!),
    maxLaps: 1,
    bearing: 0,
    sections,
    links,
  };
  return { document, reports };
}
