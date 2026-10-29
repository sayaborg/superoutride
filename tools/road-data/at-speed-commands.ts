/**
 * The check of [Time made into position](../../docs/original-road-data.md#time-made-into-position) against the originals'
 * own ticks ([Development](../../docs/development.md#road-data-commands)): each original's objects run tick by tick at
 * one low speed, as the conversion ran them before the rule, compared with where the conversion places them in the
 * limit of a speed falling to 0. It writes nothing.
 */
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { cameraDistance } from '../../src/view/camera.js';
import { boardShapes } from './outrun-boards.js';
import { startObjects } from './outrun-sprites.js';
import { OUTRUN_NAMES, skyName, slug } from './outrun-names.js';
import { OUTRUN_ROUTES, outrunRoad, routeSpans } from './outrun-roads.js';
import { readStartWidth } from './outrun-cross-section.js';
import { SKY_HORIZON } from './sky-baking.js';
import { assemblePrograms, assembleSprites } from './outrun-rom.js';
import { lineAhead } from './object-approach.js';
import { roadObjects, type ObjectPlacement } from './outrun-scenery.js';
import { roadObjectsAtSpeed } from './outrun-ticks.js';
import { outrunSceneryUses } from './outrun-commands.js';
import {
  OUTRUN_STAGES,
  lineDistances,
  readClock,
  readForkStretch,
  readGoalStretches,
  readStage,
  readStageChangeFrames,
  readTopKmh,
  goalNumber,
  type Stage,
} from './outrun-road.js';
import { readHeightTable } from './road-tables.js';
import { assembleTurboOutrunPrograms } from './turbo-outrun-rom.js';
import {
  LEG_STAGES,
  readClock as readTurboOutrunClock,
  readConstants,
  readTurboOutrunStages,
  type TurboOutrunItem,
} from './turbo-outrun-road.js';
import { turboOutrunObjects, type StageRun, type StandingObject } from './turbo-outrun-scenery.js';
import { turboOutrunObjectsAtSpeed } from './turbo-outrun-ticks.js';
import { assembleSuperHangOnPrograms } from './super-hang-on-rom.js';
import { readCourses, readSection, sectionPositions } from './super-hang-on-road.js';
import { courseScenery, sceneryRules, type ScenerySpot } from './super-hang-on-scenery.js';
import { courseSceneryAtSpeed } from './super-hang-on-ticks.js';
import { phaseUnit } from './board-clock.js';
import { belowMostAdvance } from './board-ticks.js';
import { requireInput } from '../course/authoring-io.js';
import { oneZip, romDirectory, romSet, round3, type RoadDataCommands, command } from './road-data-commands.js';

/** The speed the ticks run at unless told otherwise, km/h: low, so a tick advances the road a small part of a position. */
const LOW_KMH = 15;
/** How many of the objects that differ a report lists, for each road. */
const LISTED = 10;

/**
 * An object where it stands, along the road and across it (which follows the road's width there), and what tells it
 * from the others: its board, palette and height.
 */
interface Standing {
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

// An OUTRUN object's kind: its board, palette and height.
const outrunStanding = (o: ObjectPlacement): Standing => ({
  position: o.position,
  x: o.x,
  key: `${o.image} ${o.palette} y ${o.y}`,
});

/** OUTRUN's roads' objects in the limit and by the ticks at `kmh`, compared road by road. */
async function outrunAtSpeed(zip: string | undefined, kmh: number) {
  const set = await romSet('outrun', [await oneZip(zip, romDirectory('outrun'), '--outrun-zip')]);
  const programs = assemblePrograms(set);
  const stages = new Map(OUTRUN_STAGES.flat().map((number) => [number, readStage(programs, number)]));
  const fork = readForkStretch(programs);
  const goals = readGoalStretches(programs);
  const names = new Set(
    [...stages.values(), fork, ...goals.stretches].flatMap((s) =>
      s.widthsHeights.filter((p) => p.kind === 0).map((p) => p.value),
    ),
  );
  const tables = new Map([...names].map((n) => [n, readHeightTable(programs.sub, n)]));
  const nameOf = (stage: Stage) => OUTRUN_NAMES.get(stage.number)!;
  const clock = readClock(programs);
  const distances = lineDistances(programs, clock);
  requireInput(
    kmh < belowMostAdvance(clock),
    '/arguments/--kmh',
    `--kmh is below ${belowMostAdvance(clock).toFixed(1)} km/h, where a tick's advance stays within the program's most`,
  );
  const inputs = {
    rows: OUTRUN_STAGES,
    stages,
    fork,
    goals,
    goalOf: (row: number, column: number) => goalNumber(programs.main, row, column),
    idOf: (stage: Stage) => slug(nameOf(stage)),
    startWidth: readStartWidth(programs.main),
    clock,
  };
  const { colored, extents } = boardShapes(programs.main, assembleSprites(set), outrunSceneryUses(programs).uses);
  const starts = startObjects(programs.main);
  // A tick at `kmh` advances the road this many positions, and the limit's units of advance come this far apart.
  const tolerance = (kmh * clock.step) / 65536 + phaseUnit(clock);
  const roads = [];
  for (const route of OUTRUN_ROUTES) {
    // Written by the road's objects callback (so not narrowed to none where it is read).
    let compared = null as ReturnType<typeof compareStandings> | null;
    outrunRoad(routeSpans(route, inputs), {
      id: route.id,
      name: route.id,
      tables,
      kmh: readTopKmh(programs),
      changeFrames: readStageChangeFrames(programs, clock),
      cameraDistance: cameraDistance(CAMERA_DEFINITION),
      stageName: nameOf,
      sky: (stage) => ({ image: skyName(stage.number), horizonY: SKY_HORIZON }),
      extents,
      colored,
      objects: (points, road) => {
        const options = { ...road, ahead: (line: number) => lineAhead(distances, line), starts, clock };
        const limit = roadObjects(programs.main, points, options);
        const ticks = roadObjectsAtSpeed(programs.main, points, { ...options, kmh });
        compared = compareStandings(
          limit.placements.map(outrunStanding),
          ticks.placements.map(outrunStanding),
          tolerance,
        );
        return { placements: limit.placements, checkpoints: limit.checkpoints, report: null };
      },
    });
    requireInput(compared, `/roads/${route.id}`, `OUTRUN's road ${route.id} placed no objects`);
    roads.push({ road: route.id, ...compared });
  }
  return { original: 'outrun', kmh, tolerance: round3(tolerance), roads };
}

// A TURBO OUTRUN object's kind: its stage and item.
const itemKey = (i: TurboOutrunItem) => `kind ${i.kind} flags ${i.flags} x ${i.x} y ${i.y} b ${i.b6} ${i.b7}`;
const turboOutrunStanding = (o: StandingObject): Standing => ({
  position: o.position,
  x: o.item.x,
  key: `stage ${o.stage} ${itemKey(o.item)}`,
});

/**
 * TURBO OUTRUN's objects in the limit (its waits at the top speed) and by the ticks at `kmh` (its waits too), compared
 * leg by leg in each stage's road positions: apart those brought out in the stage they stand in, and those carried
 * into it from the stage before, which the waits at a stage's end move; and each stage's gate and end.
 */
async function turboOutrunAtSpeed(zip: string | undefined, kmh: number) {
  const set = await romSet('toutrun', [await oneZip(zip, romDirectory('turbo-outrun'), '--turbo-outrun-zip')]);
  const programs = assembleTurboOutrunPrograms(set);
  const { stages } = readTurboOutrunStages(programs);
  const constants = readConstants(programs.main);
  const clock = readTurboOutrunClock(programs);
  requireInput(
    kmh < belowMostAdvance(clock),
    '/arguments/--kmh',
    `--kmh is below ${belowMostAdvance(clock).toFixed(1)} km/h, where a tick's advance stays within the program's most`,
  );
  const slots = constants.objectSlots.count;
  const limit = turboOutrunObjects(programs.main, stages, { kmh: constants.topSpeed, slots, clock });
  const ticks = turboOutrunObjectsAtSpeed(programs.main, stages, { kmh, slots, clock });
  const tolerance = (kmh * clock.step) / 65536 + phaseUnit(clock);
  const legOf = (stage: number) => Math.floor(stage / LEG_STAGES);
  const legs = Array.from({ length: stages.length / LEG_STAGES }, (_, leg) => {
    const of = (objects: readonly StandingObject[], carried: boolean) =>
      objects.filter((o) => legOf(o.stage) === leg && (o.from.stage !== o.stage) === carried).map(turboOutrunStanding);
    const run = (runs: readonly StageRun[], stage: number) => runs.find((r) => r.stage === stage)!;
    return {
      leg,
      within: compareStandings(of(limit.objects, false), of(ticks.objects, false), tolerance),
      carried: compareStandings(of(limit.objects, true), of(ticks.objects, true), tolerance),
      stages: Array.from({ length: LEG_STAGES }, (_, k) => {
        const stage = leg * LEG_STAGES + k;
        const [a, b] = [run(limit.runs, stage), run(ticks.runs, stage)];
        return { stage, gate: [round3(a.gate), round3(b.gate)], end: [round3(a.end), round3(b.end)] };
      }),
    };
  });
  return { original: 'turbo-outrun', kmh, tolerance: round3(tolerance), legs };
}

// A SUPER HANG-ON object's kind: its section and item.
const superHangOnStanding = (o: ScenerySpot): Standing => ({
  position: o.position,
  x: o.item.x,
  key: `section ${o.section} sprite ${o.item.sprite} palette ${o.item.palette} x ${o.item.x} ${o.item.mirrored}`,
});

/**
 * SUPER HANG-ON's scenery in the limit and by the ticks at the even speed word nearest `kmh` (v shows as v × 0x117 /
 * 0xF0 km/h), compared course by course in each section's positions. An object's depth gains ⌊v / 2⌋ a tick (the
 * words at 0xC5EA), half the speed only where v is even, so the limit is the one through the even speed words (K,
 * 2026-10-27).
 */
async function superHangOnAtSpeed(zip: string | undefined, kmh: number) {
  const programs = assembleSuperHangOnPrograms(
    await romSet('shangon', [await oneZip(zip, romDirectory('super-hang-on'), '--super-hang-on-zip')]),
  );
  const { main } = programs;
  const positions = sectionPositions(main);
  const rules = sceneryRules(main);
  const speed = 2 * Math.round((kmh * 0xf0) / 0x117 / 2);
  requireInput(
    speed > 0 && speed <= rules.speed,
    '/arguments/--kmh',
    `--kmh is SUPER HANG-ON's even speed word ${speed}, above 0 and at most its top speed's, ${rules.speed}`,
  );
  // A tick at `speed` advances the road this many positions: where the ticks place an object, to within one.
  const tolerance = (rules.advance * speed) / 65536;
  const courses = readCourses(main).map((course) => {
    const points = course.sections.map((n) => readSection(programs, n, positions.length).scenery);
    const limit = courseScenery(main, points, positions.length);
    const ticks = courseSceneryAtSpeed(main, points, positions.length, speed);
    return {
      course: course.name,
      ...compareStandings(limit.spots.map(superHangOnStanding), ticks.spots.map(superHangOnStanding), tolerance),
    };
  });
  return { original: 'super-hang-on', kmh, speed, tolerance: round3(tolerance), courses };
}

export const AT_SPEED_COMMANDS: RoadDataCommands = Object.freeze({
  'positions-at-speed': command(
    {
      '--kmh': 'value',
      '--outrun-zip': 'value',
      '--turbo-outrun-zip': 'value',
      '--super-hang-on-zip': 'value',
    },
    async function* (options) {
      const kmh = Number(options.get('--kmh') ?? LOW_KMH);
      requireInput(Number.isInteger(kmh) && kmh > 0, '/arguments/--kmh', '--kmh is a whole speed above 0, km/h');
      const originals = [
        await outrunAtSpeed(options.get('--outrun-zip'), kmh),
        await turboOutrunAtSpeed(options.get('--turbo-outrun-zip'), kmh),
        await superHangOnAtSpeed(options.get('--super-hang-on-zip'), kmh),
      ];
      yield { ok: true, originals };
    },
  ),
});
