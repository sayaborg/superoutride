/**
 * Where TURBO OUTRUN's objects stand along its legs ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md)):
 * each leg run tick by tick from GO as its main CPU runs it, in the limit of a speed falling to 0, with the approach the originals share
 * (`object-approach`): the start objects, the scenery its points bring out into the 108 objects, each standing at the
 * road position of the tick its depth first reaches the car's line, and the gates that end the stages.
 */
import { contractUnmet } from '../shared/conversion-errors.js';
import { approached } from '../out-run-hardware/object-approach.js';
import { phaseUnit, type ProgramClock } from '../out-run-hardware/clock.js';
import { readTurboOutrunSceneryType, LEG_STAGES, type TurboOutrunItem } from './turbo-outrun-road.js';
import type { SceneryPoint } from '../out-run-hardware/road-tables.js';
import { readStartObjects } from './turbo-outrun-start.js';
import {
  CHANGE_STATE,
  BACKGROUND_FLIP,
  END_STEPS,
  STOP,
  CAR_LINE,
  VANISHES,
  STRIP_VANISHES,
  STRIP_ROUTINES,
  FAR_STRIP,
  GATE_POST,
} from './turbo-outrun-constants.js';
import { readKind } from './turbo-outrun-sprites.js';

/** The approach table at 0x48010, OUTRUN's 0x28000's contents. */
export const APPROACH = 0x48010;

/** An object standing: the stage and road position (in the stage, fractions kept) where it reaches the car's line. */
export interface StandingObject {
  readonly stage: number;
  readonly position: number;
  readonly item: TurboOutrunItem;
  /** Where it came out (the start's objects at the leg's first stage, position 0). */
  readonly from: { readonly stage: number; readonly position: number };
  /** A start object's line, else null. */
  readonly line: number | null;
}

/** A stage as its leg runs: where the gate's post passes the car (T), the background's change (T + 11) and its end. */
export interface StageRun {
  readonly stage: number;
  readonly gate: number;
  /** Where the stage's change begins, its end's state 4 (T + 5). */
  readonly stageChange: number;
  readonly backgroundChange: number;
  /** The last road position of the stage (T + 12), or at a leg's last stage where the car stops (T + 2). */
  readonly end: number;
  readonly stops: boolean;
  /** Items its points brought out, and of them those no free object took. */
  readonly brought: number;
  readonly dropped: number;
  /** Items the points it took had still to bring out when a later point replaced them, or its stage ended. */
  readonly ended: number;
}

/**
 * Each leg's objects with `slots` objects for scenery (108 the original's), from `stages[n]`'s scenery points, by its
 * ticks in the limit of a speed falling to 0 ([Original road data](../../../docs/original-road-data.md#time-made-into-position)):
 * the road position passes each place, and a unit of advance comes once a `phaseUnit` from the leg's GO; what the
 * program counts in ticks it counts at `kmh`, the top speed, a tick `kmh × step` / 65536 positions.
 *
 * 1. Where 12 ticks have passed a gate's post passing the car (T), past T + 12 the next stage begins at road position
 *    0, its points from the first.
 * 2. The control: a point is taken when the road position reaches it (one a tick), its count times its items to bring
 *    out. While its cursor (from its position, a position a tick) is not past the road position and items remain, the
 *    pattern turns step + 1 times (its 32 bits where the type's turn is negative, else its upper 16), each 1 turned out
 *    bringing out its next item, in order, into the first free object, or none where none is free.
 * 3. Where a unit of advance comes, after that tick's control, every object approaches by the table at 0x48010 by an
 *    advance of 1 (the far strip at half the rate); where its depth first reaches the car's line it stands there, and
 *    at 0x1FF (a strip 0x1F8) it vanishes. The gate's post passing marks T.
 *
 * A leg's first stage begins with its start objects in the objects, at their lines; an object at line 0 never moves. At
 * a leg's last stage the car stops 2 ticks past T: the control stops, and the objects still coming stand where they
 * would pass the car driven on.
 */
export function turboOutrunObjects(
  main: Uint8Array,
  stages: readonly { readonly scenery: readonly SceneryPoint[] }[],
  options: { readonly kmh: number; readonly slots: number; readonly clock: ProgramClock },
): { objects: StandingObject[]; runs: StageRun[] } {
  const tick = (options.kmh * options.clock.step) / 65536;
  const unit = phaseUnit(options.clock);
  return runLegs(main, stages, options, (leg) => {
    // The leg's travel from GO where the stage's road position is 0, the gate's road position and where the car stops.
    let begins = 0,
      units = 1,
      gate: number | null = null,
      stop: number | null = null;
    const control = (road: number) => (stop !== null && road > stop ? false : leg.control(road));
    // Where a unit of advance comes: every object approaches; the gate's post passing marks T.
    const approach = (road: number) => {
      const passed = leg.approach(road, 1);
      if (!passed) return;
      gate = road;
      if (passed.stops) stop = road + STOP * tick;
    };
    // GO's ticks, then each next place.
    while (control(0));
    for (let road = 0; ;) {
      // The next place after `road`: a unit of advance, the next point, the next turn, or the stage's end.
      const advances = units * unit - begins;
      const { point, turn } = leg.events();
      const ends = gate !== null && leg.stage() !== leg.last ? gate + (END_STEPS + 1) * tick : Infinity;
      road = Math.min(advances, ...[point, turn, ends].filter((p) => p > road));
      control(road);
      if (road === advances) {
        units++;
        approach(road);
      }
      while (control(road));
      // Past T + 12 the next stage begins.
      if (road === ends) {
        begins += road;
        leg.nextStage();
        [road, gate] = [0, null];
        while (control(road));
      }
      // The leg ends once its car has stopped and every object still coming has stood.
      if (stop !== null && road > stop && leg.settled()) break;
      if (units > 10_000_000) throw contractUnmet(`Leg ${leg.first / LEG_STAGES} never reaches its last gate`);
    }
  });
}

/**
 * A leg as `turboOutrunObjects` and its tick version run it (`runLegs`), which a stepping drives: the stage being run,
 * a tick's control at road position `road` in its stage (whether it took a point or turned a pattern), every object's
 * approach by an advance (the gate's post first passing the car: whether the car stops there, else null), the next
 * stage begun at its road position 0, the next point's and pattern turn's road positions, and whether every object still
 * coming has stood.
 */
export interface LegRun {
  readonly first: number;
  readonly last: number;
  readonly stage: () => number;
  readonly control: (road: number) => boolean;
  readonly approach: (road: number, advance: number) => { readonly stops: boolean } | null;
  readonly nextStage: () => void;
  readonly events: () => { readonly point: number; readonly turn: number };
  readonly settled: () => boolean;
}

/** Each leg's objects and stages' runs, as a `stepping` drives each leg's run. */
export function runLegs(
  main: Uint8Array,
  stages: readonly { readonly scenery: readonly SceneryPoint[] }[],
  options: { readonly kmh: number; readonly slots: number; readonly clock: ProgramClock },
  stepping: (leg: LegRun) => void,
): { objects: StandingObject[]; runs: StageRun[] } {
  const objects: StandingObject[] = [];
  const runs: StageRun[] = [];
  const kinds = new Map<number, ReturnType<typeof readKind>>();
  const kindOf = (kind: number) => kinds.get(kind) ?? kinds.set(kind, readKind(main, kind)).get(kind)!;
  const tick = (options.kmh * options.clock.step) / 65536;
  for (let first = 0; first < stages.length; first += LEG_STAGES) {
    type Live = {
      depth: number;
      readonly item: TurboOutrunItem;
      readonly from: { stage: number; position: number };
      readonly line: number | null;
      stood: boolean;
    };
    const slots: (Live | null)[] = new Array<Live | null>(options.slots).fill(null);
    readStartObjects(main, first / LEG_STAGES).shown.forEach((item, i) => {
      const line = (item.b6 << 8) | item.b7;
      slots[i] = { depth: line << 16, item, from: { stage: first, position: 0 }, line, stood: false };
    });
    let stage = first,
      next = 0,
      gated = false,
      stopping = false;
    const tallies = new Map<number, { brought: number; dropped: number; ended: number }>();
    const tally = () => tallies.get(stage) ?? tallies.set(stage, { brought: 0, dropped: 0, ended: 0 }).get(stage)!;
    // The point being run, written by the control (so not narrowed to none where the events read it).
    type Running = {
      cursor: number;
      remaining: number;
      pattern: number;
      index: number;
      type: ReturnType<typeof readTurboOutrunSceneryType>;
    };
    let running = null as Running | null;
    const last = first + LEG_STAGES - 1;
    const legRuns: Omit<StageRun, 'brought' | 'dropped' | 'ended'>[] = [];
    const control = (road: number) => {
      let acted = false;
      const points = stages[stage]!.scenery;
      if (next < points.length && road >= points[next]!.position) {
        const point = points[next++]!;
        if (running) tally().ended += Math.max(0, running.remaining);
        const type = readTurboOutrunSceneryType(main, point.type);
        running = {
          cursor: point.position,
          remaining: point.count * type.items.length,
          pattern: type.pattern,
          index: 0,
          type,
        };
        acted = true;
      }
      if (running && running.cursor <= Math.floor(road + 1e-9) && running.remaining > 0) {
        for (let turn = 0; turn <= running.type.step; turn++) {
          let out: number;
          if (running.type.turn < 0) {
            out = running.pattern >>> 31;
            running.pattern = ((running.pattern << 1) | out) >>> 0;
          } else {
            const high = running.pattern >>> 16;
            out = high >>> 15;
            running.pattern = ((((high << 1) | out) & 0xffff) * 0x10000 + (running.pattern & 0xffff)) >>> 0;
          }
          if (!out) continue;
          const item = running.type.items[running.index]!;
          running.remaining--;
          running.index = (running.index + 1) % running.type.items.length;
          tally().brought++;
          const free = slots.indexOf(null);
          if (free < 0) tally().dropped++;
          else
            slots[free] = {
              depth: item.flags & 2 ? ((item.b6 << 8) | item.b7) << 16 : 0x10000,
              item,
              from: { stage, position: road },
              line: null,
              stood: false,
            };
        }
        running.cursor++;
        acted = true;
      }
      return acted;
    };
    // Every object approaches, in the objects' order.
    const approach = (road: number, advance: number) => {
      let passed: { stops: boolean } | null = null;
      for (let s = 0; s < slots.length; s++) {
        const o = slots[s];
        if (!o) continue;
        const { routine } = kindOf(o.item.kind);
        o.depth = approached(main, APPROACH, o.depth, advance, routine === FAR_STRIP);
        if (!o.stood && o.depth >>> 16 >= CAR_LINE) {
          o.stood = true;
          objects.push({ stage, position: road, item: o.item, from: o.from, line: o.line });
          if (routine === GATE_POST && o.line === null && !gated && !stopping) {
            gated = true;
            const stops = stage === last;
            stopping = stops;
            passed = { stops };
            legRuns.push({
              stage,
              gate: road,
              stageChange: road + (1 + CHANGE_STATE) * tick,
              backgroundChange: road + BACKGROUND_FLIP * tick,
              end: road + (stops ? STOP : END_STEPS + 1) * tick,
              stops,
            });
          }
        }
        const strip = routine >= STRIP_ROUTINES[0] && routine <= STRIP_ROUTINES[1];
        if (o.depth >>> 16 >= (strip ? STRIP_VANISHES : VANISHES)) slots[s] = null;
      }
      return passed;
    };
    stepping({
      first,
      last,
      stage: () => stage,
      control,
      approach,
      nextStage: () => {
        [stage, next, gated] = [stage + 1, 0, false];
      },
      events: () => ({
        point: next < stages[stage]!.scenery.length ? stages[stage]!.scenery[next]!.position : Infinity,
        turn: running && running.remaining > 0 ? running.cursor : Infinity,
      }),
      settled: () => slots.every((o) => !o || o.stood || o.depth === 0),
    });
    for (const run of legRuns) runs.push({ ...run, brought: 0, dropped: 0, ended: 0, ...tallies.get(run.stage) });
  }
  return { objects, runs };
}

/**
 * Where an object standing still at line `line` from GO stands, as the leg's start objects do: where its depth first
 * reaches the car's line, approaching by a unit of advance once a `phaseUnit` from GO, by `clock`.
 */
export function standsFrom(main: Uint8Array, line: number, clock: ProgramClock): number {
  let depth = line << 16;
  for (let units = 1; ; units++) {
    depth = approached(main, APPROACH, depth, 1);
    if (depth >>> 16 >= CAR_LINE) return units * phaseUnit(clock);
  }
}
