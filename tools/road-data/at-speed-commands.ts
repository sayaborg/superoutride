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
import { SKY_HORIZON } from './sky-baking.js';
import { assemblePrograms, assembleSprites } from './outrun-rom.js';
import { startDepth } from './object-approach.js';
import { roadObjects, type ObjectPlacement } from './outrun-scenery.js';
import { roadObjectsAtSpeed } from './outrun-ticks.js';
import { outrunSceneryUses, TOP_KMH } from './outrun-commands.js';
import {
  OUTRUN_STAGES,
  readClock,
  readForkStretch,
  readGoalStretches,
  readStage,
  goalNumber,
  type Stage,
} from './outrun-road.js';
import { readHeightTable } from './road-tables.js';
import { phaseUnit } from './board-clock.js';
import { belowMostAdvance } from './board-ticks.js';
import { requireInput } from '../course/authoring-io.js';
import { oneZip, romDirectory, romSet, round3, type RoadDataCommands } from './road-data-commands.js';

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
    clock,
  };
  const { edges, widths } = boardShapes(programs.main, assembleSprites(set), outrunSceneryUses(programs).uses);
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
      kmh: TOP_KMH,
      cameraDistance: cameraDistance(CAMERA_DEFINITION),
      stageName: nameOf,
      sky: (stage) => ({ image: skyName(stage.number), horizonY: SKY_HORIZON }),
      edges,
      widths,
      objects: (points, road) => {
        const options = { ...road, startDepth: (line: number) => startDepth(line, clock), starts, clock };
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

export const AT_SPEED_COMMANDS: RoadDataCommands = Object.freeze({
  'positions-at-speed': async (options) => {
    const kmh = Number(options.get('--kmh') ?? LOW_KMH);
    requireInput(Number.isInteger(kmh) && kmh > 0, '/arguments/--kmh', '--kmh is a whole speed above 0, km/h');
    console.log(JSON.stringify({ ok: true, ...(await outrunAtSpeed(options.get('--outrun-zip'), kmh)) }));
  },
});
