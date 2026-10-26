/**
 * Where TURBO OUTRUN's objects stand along its legs when its main CPU runs each leg tick by tick from GO at one speed,
 * the procedure the conversion followed before [Time made into
 * position](../../docs/original-road-data.md#time-made-into-position): its ticks' waits too counted at `kmh`. It
 * places nothing in a course; `positions-at-speed` compares it with `turboOutrunObjects`, the speed-0 limit.
 */
import { approached } from './object-approach.js';
import type { BoardClock } from './board-clock.js';
import { tickAdvance } from './board-ticks.js';
import { readKind, readTurboOutrunSceneryType, LEG_STAGES, type TurboOutrunItem } from './turbo-outrun-road.js';
import type { SceneryPoint } from './road-tables.js';
import { readStartObjects } from './turbo-outrun-start.js';
import {
  APPROACH,
  CAR_LINE,
  END_STEPS,
  FAR_STRIP,
  GATE_POST,
  STOP,
  STRIP_ROUTINES,
  STRIP_VANISHES,
  VANISHES,
  type StageRun,
  type StandingObject,
} from './turbo-outrun-scenery.js';

/**
 * Each leg's objects at `kmh` with `slots` objects for scenery (108 the original's), from `stages[n]`'s scenery points,
 * tick by tick:
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
  options: { readonly kmh: number; readonly slots: number; readonly clock: BoardClock },
): { objects: StandingObject[]; runs: StageRun[] } {
  const objects: StandingObject[] = [];
  const runs: StageRun[] = [];
  const kinds = new Map<number, ReturnType<typeof readKind>>();
  const kindOf = (kind: number) => kinds.get(kind) ?? kinds.set(kind, readKind(main, kind)).get(kind)!;
  const step = options.kmh * options.clock.step;
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
      road = 0,
      remainder = 0,
      next = 0,
      gateTick: number | null = null,
      stopTick: number | null = null;
    const tallies = new Map<number, { brought: number; dropped: number; ended: number }>();
    const tally = () => tallies.get(stage) ?? tallies.set(stage, { brought: 0, dropped: 0, ended: 0 }).get(stage)!;
    let running: {
      cursor: number;
      remaining: number;
      pattern: number;
      index: number;
      type: ReturnType<typeof readTurboOutrunSceneryType>;
    } | null = null;
    const last = first + LEG_STAGES - 1;
    const legRuns: Omit<StageRun, 'brought' | 'dropped' | 'ended'>[] = [];
    for (let tick = 1; ; tick++) {
      let advance;
      ({ advance, remainder } = tickAdvance(options.clock, options.kmh, remainder));
      if (gateTick !== null && stage !== last && tick === gateTick + END_STEPS + 2) {
        stage++;
        road = 0;
        next = 0;
        gateTick = null;
      }
      road += step;
      const position = Math.floor(road / 65536);
      if (stopTick === null || tick <= stopTick) {
        const points = stages[stage]!.scenery;
        if (next < points.length && position >= points[next]!.position) {
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
        }
        if (running && running.cursor <= position && running.remaining > 0) {
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
                from: { stage, position: road / 65536 },
                line: null,
                stood: false,
              };
          }
          running.cursor++;
        }
      }
      // Every object approaches, in the objects' order.
      for (let s = 0; s < slots.length; s++) {
        const o = slots[s];
        if (!o) continue;
        const { routine } = kindOf(o.item.kind);
        o.depth = approached(main, APPROACH, o.depth, advance, routine === FAR_STRIP);
        if (!o.stood && o.depth >>> 16 >= CAR_LINE) {
          o.stood = true;
          objects.push({
            stage,
            position: road / 65536,
            item: o.item,
            from: o.from,
            line: o.line,
            pastStop: stopTick !== null && tick > stopTick,
          });
          if (routine === GATE_POST && o.line === null && gateTick === null && stopTick === null) {
            gateTick = tick;
            const at = road / 65536;
            const stops = stage === last;
            if (stops) stopTick = tick + STOP;
            legRuns.push({
              stage,
              gate: at,
              backgroundChange: at + (END_STEPS * step) / 65536,
              end: at + ((stops ? STOP : END_STEPS + 1) * step) / 65536,
              stops,
            });
          }
        }
        const strip = routine >= STRIP_ROUTINES[0] && routine <= STRIP_ROUTINES[1];
        if (o.depth >>> 16 >= (strip ? STRIP_VANISHES : VANISHES)) slots[s] = null;
      }
      // The leg ends once its car has stopped and every object still coming has stood.
      if (stopTick !== null && tick > stopTick && slots.every((o) => !o || o.stood || o.depth === 0)) break;
      // A stage's road position is a word: a leg whose stage runs past it never reaches its last gate.
      if (road >= 65536 * 65536) throw new Error(`Leg ${first / LEG_STAGES} never reaches its last gate`);
    }
    for (const run of legRuns) runs.push({ ...run, brought: 0, dropped: 0, ended: 0, ...tallies.get(run.stage) });
  }
  return { objects, runs };
}
