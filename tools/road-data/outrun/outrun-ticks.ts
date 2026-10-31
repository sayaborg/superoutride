/**
 * Where OUTRUN's scenery stands along a road when the main CPU runs it tick by tick at one speed, the procedure the
 * conversion followed before [Time made into position](../../../docs/original-road-data.md#time-made-into-position): the
 * objects its scenery points bring out and the objects at the game's start, each where the car passes it at `kmh`. It
 * places nothing in a course; `positions-at-speed` compares it with `roadObjects`, the speed-0 limit.
 */
import { boardShapes } from './outrun-boards.js';
import { readStartWidth } from './outrun-cross-section.js';
import {
  readStages,
  readForkStretch,
  readGoalStretches,
  goalNumber,
  lineDistances,
  readClock,
  readStage,
  readStageChangeFrames,
  readTopKmh,
  type Stage,
  OUTRUN_HEIGHT_TABLES,
} from './outrun-road.js';
import { type SceneryPoint, readHeightTable } from '../out-run-hardware/road-tables.js';
import { lineAhead } from '../out-run-hardware/object-approach.js';
import { tickAdvance, phaseUnit } from '../out-run-hardware/clock.js';
import { type ObjectPlacement, roadObjects, runRoadObjects, type RoadObjectsOptions } from './outrun-scenery.js';
import { startObjects } from './outrun-sprites.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { cameraDistance } from '../../../src/view/camera.js';
import { outrunSceneryUses, skyName, slug } from './outrun-course.js';
import { OUTRUN_NAMES, OUTRUN_ROUTES } from './outrun-constants.js';
import { outrunRoad, routeSpans } from './outrun-layout.js';
import { SKY_HORIZON } from '../shared/sky-baking.js';
import { assemblePrograms, assembleSprites } from './outrun-rom.js';
import { belowMostAdvance } from '../out-run-hardware/ticks.js';
import { round3, compareStandings, type Standing } from '../shared/conversion.js';
import type { RomSet } from '../shared/rom-set.js';

/**
 * The objects a road shows, to `end` (road positions), as the main CPU brings them out and approaches them at `kmh`
 * from GO (road position `go`), tick by tick, as `roadObjects` runs them (`runRoadObjects`) but for its stepping:
 *
 * 0. Where the road position before the tick is past a stretch's end (`resets`), the next stretch begins: the scenery
 *    point being run ends, and only the new stretch's points are taken.
 * 1. The road position advances `kmh × 0x12F` (16.16).
 * 2. The tick's advance (`col`) is the phase's gain, three times km/h / 64 with its remainder shared, at most 15.
 * 3. A point is taken when the road position reaches it (one a tick), replacing the one before. While its count lasts
 *    and its cursor (from its position, one a tick) is not past the road position, its pattern turns left twice, each
 *    turn that carries out a 1 bringing out its next entry, from the last back, into a free slot of 79 (none free, none
 *    brought out): the first turn's at line 0x104, the second's at 0x100.
 * 4. Each object's depth gains the table's step at 0x28000 for its line and the advance (half for the clouds); where it
 *    reaches line 512 it passes the car, and stands at that tick's road position.
 *
 * The objects at the game's start (`starts`) fill slots from GO at their lines and stand where they pass the car or, nearer, where
 * they stand as the original projects them at their line (`ahead`, positions ahead of the car at GO), across from the grid's
 * road (`startRoad`) as from COCONUT BEACH's left road at the game's start's width (450). A point is taken by
 * its whole-road position, and its stretch is the one its position lies in. `width(p)` is the road width (units) at
 * road position p, which an object's lateral follows; `originalWidth(p)` the original's, straight between its points,
 * by which the roads are apart for an object, where it was wider than 280 as it appeared.
 */
export function roadObjectsAtSpeed(
  main: Uint8Array,
  points: readonly SceneryPoint[],
  options: RoadObjectsOptions & { readonly kmh: number },
) {
  const step = options.kmh * options.clock.step;
  let remainder = 0;
  return runRoadObjects(
    main,
    points,
    ({ switchPast, control, approach }) => {
      for (let tick = 1; ; tick++) {
        const before = options.go + ((tick - 1) * step) / 65536;
        if (before >= options.end) break;
        // 0. A stretch ends: the point being run ends with it.
        switchPast((r) => before > r);
        // 1. The road position, 2. the tick's advance.
        const road = options.go + (tick * step) / 65536;
        let advance;
        ({ advance, remainder } = tickAdvance(options.clock, options.kmh, remainder));
        // 3. The control: a point taken, then its pattern turned; 4. every object's approach.
        control(road);
        approach(road, advance);
      }
    },
    options,
  );
}

// An OUTRUN object's kind: its board, palette and height.
const outrunStanding = (o: ObjectPlacement): Standing => ({
  position: o.position,
  x: o.x,
  key: `${o.image} ${o.palette} y ${o.y}`,
});

/** OUTRUN's roads' objects in the limit and by the ticks at `kmh`, compared road by road. */
export function outrunAtSpeed(set: RomSet, kmh: number) {
  const programs = assemblePrograms(set);
  const rows = readStages(programs.main);
  const stages = new Map(rows.flat().map((number) => [number, readStage(programs, number)]));
  const fork = readForkStretch(programs);
  const goals = readGoalStretches(programs);
  const names = new Set(
    [...stages.values(), fork, ...goals.stretches].flatMap((s) =>
      s.widthsHeights.filter((p) => p.kind === 0).map((p) => p.value),
    ),
  );
  const tables = new Map([...names].map((n) => [n, readHeightTable(programs.sub, n, OUTRUN_HEIGHT_TABLES)]));
  const nameOf = (stage: Stage) => OUTRUN_NAMES.get(stage.number)!;
  const clock = readClock(programs);
  const distances = lineDistances(programs, clock);
  requireInput(
    kmh < belowMostAdvance(clock),
    '/arguments/--kmh',
    `--kmh is below ${belowMostAdvance(clock).toFixed(1)} km/h, where a tick's advance stays within the program's most`,
  );
  const inputs = {
    rows,
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
      distances,
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
