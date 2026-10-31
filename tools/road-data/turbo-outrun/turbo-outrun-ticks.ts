/**
 * Where TURBO OUTRUN's objects stand along its legs when its main CPU runs each leg tick by tick from GO at one speed,
 * the procedure the conversion followed before [Time made into
 * position](../../../docs/original-road-data.md#time-made-into-position): its ticks' waits too counted at `kmh`. It
 * places nothing in a course; `positions-at-speed` compares it with `turboOutrunObjects`, the speed-0 limit.
 */
import { contractUnmet } from '../shared/conversion-errors.js';
import { tickAdvance, type ProgramClock, phaseUnit } from '../out-run-hardware/clock.js';
import {
  LEG_STAGES,
  type TurboOutrunItem,
  readClock,
  readConstants,
  readTurboOutrunStages,
} from './turbo-outrun-road.js';
import { END_STEPS, STOP } from './turbo-outrun-constants.js';
import type { SceneryPoint } from '../out-run-hardware/road-tables.js';
import { type StageRun, type StandingObject, turboOutrunObjects, runLegs } from './turbo-outrun-scenery.js';
import { assembleTurboOutrunPrograms } from './turbo-outrun-rom.js';
import { belowMostAdvance } from '../out-run-hardware/ticks.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { round3, compareStandings, type Standing } from '../shared/conversion.js';
import type { RomSet } from '../shared/rom-set.js';

/**
 * Each leg's objects at `kmh` with `slots` objects for scenery (108 the original's), from `stages[n]`'s scenery points,
 * tick by tick, as `turboOutrunObjects` runs them (`runLegs`) but for its stepping:
 *
 * 1. The tick's advance (`col`): the phase's gain, three times km/h / 64.
 * 2. At T + 13 after a gate's post passed the car, the next stage begins at road position 0, its points from the first.
 * 3. The road position advances `kmh × 0x12F` (16.16).
 * 4. The control: a point is taken when the road position reaches it (one a tick), its count times its items to bring
 *    out. While its cursor (from its position, a position a tick) is not past the road position and items remain, the
 *    pattern turns step + 1 times (its 32 bits where the type's turn is negative, else its upper 16), each 1 turned out
 *    bringing out its next item, in order, into the first free object, or none where none is free.
 * 5. Every object approaches by the table at 0x48010 (the far strip at half the rate); where its depth first reaches the
 *    car's line it stands at the tick's road position, and at 0x1FF (a strip 0x1F8) it vanishes. The gate's post
 *    passing marks T.
 *
 * A leg's first stage begins with its start objects in the objects, at their lines; an object at line 0 never moves. At
 * a leg's last stage the car stops at T + 2: the control stops, and the objects still coming stand where they would pass
 * the car driven on.
 */
export function turboOutrunObjectsAtSpeed(
  main: Uint8Array,
  stages: readonly { readonly scenery: readonly SceneryPoint[] }[],
  options: { readonly kmh: number; readonly slots: number; readonly clock: ProgramClock },
): { objects: StandingObject[]; runs: StageRun[] } {
  const step = options.kmh * options.clock.step;
  return runLegs(main, stages, options, (leg) => {
    let road = 0,
      remainder = 0,
      gateTick: number | null = null,
      stopTick: number | null = null;
    for (let tick = 1; ; tick++) {
      let advance;
      ({ advance, remainder } = tickAdvance(options.clock, options.kmh, remainder));
      if (gateTick !== null && leg.stage() !== leg.last && tick === gateTick + END_STEPS + 2) {
        leg.nextStage();
        [road, gateTick] = [0, null];
      }
      road += step;
      if (stopTick === null || tick <= stopTick) leg.control(road / 65536);
      const passed = leg.approach(road / 65536, advance);
      if (passed) {
        gateTick = tick;
        if (passed.stops) stopTick = tick + STOP;
      }
      // The leg ends once its car has stopped and every object still coming has stood.
      if (stopTick !== null && tick > stopTick && leg.settled()) break;
      // A stage's road position is a word: a leg whose stage runs past it never reaches its last gate.
      if (road >= 65536 * 65536) throw contractUnmet(`Leg ${leg.first / LEG_STAGES} never reaches its last gate`);
    }
  });
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
export function turboOutrunAtSpeed(set: RomSet, kmh: number) {
  const programs = assembleTurboOutrunPrograms(set);
  const { stages } = readTurboOutrunStages(programs);
  const constants = readConstants(programs.main);
  const clock = readClock(programs);
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
