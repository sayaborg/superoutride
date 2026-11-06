/**
 * CHASE H.Q.'s goals checked against the original's own code ([Original road data](../../docs/original-road-data.md#rules-of-the-originals)):
 * `goal-ticks` runs the main program's routines tick by tick on `cpu-68000` and compares its speed routine's top speed,
 * the tick it reaches it and each stage's goal, the criminal's routines and the time run beside it, with the values the
 * conversion uses. It writes nothing.
 */
import { assembleChaseHqMain, CHASE_HQ_ROMS } from './chase-hq/chase-hq-rom.js';
import { CHASE_HQ_GOALS, goal, TOP_SPEED, TOP_SPEED_TICK, topSpeed } from './chase-hq/chase-hq-goals.js';
import { command, readSource, zipOptions, type RoadDataCommands } from './road-data-commands.js';

export const GOAL_TICKS_COMMANDS: RoadDataCommands = Object.freeze({
  'goal-ticks': command(
    zipOptions(CHASE_HQ_ROMS),
    async function* (options) {
      const main = assembleChaseHqMain((await readSource(CHASE_HQ_ROMS, options)).set);
      const { top, rise } = topSpeed(main);
      const stages = CHASE_HQ_GOALS.map((_, stage) => goal(main, stage));
      const goals = stages.map((s) => s.goal);
      const ok = top === TOP_SPEED && rise === TOP_SPEED_TICK && goals.every((g, k) => g === CHASE_HQ_GOALS[k]);
      yield { ok, top, rise, goals, sighted: stages.map((s) => s.sighted), reached: stages.map((s) => s.reached) };
    },
    [CHASE_HQ_ROMS],
  ),
});
