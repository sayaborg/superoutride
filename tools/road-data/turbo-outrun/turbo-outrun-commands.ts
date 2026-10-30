/**
 * TURBO OUTRUN's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../../course/authoring-io.js';
import { phaseUnit } from '../out-run-hardware/clock.js';
import {
  readClock,
  LEG_STAGES,
  readConstants,
  readTurboOutrunStages,
  type TurboOutrunItem,
} from './turbo-outrun-road.js';
import { turboOutrunDump } from './turbo-outrun-dump.js';
import { assembleTurboOutrunPrograms, TURBO_OUTRUN_ROMS } from './turbo-outrun-rom.js';
import { turboOutrunObjects, type StageRun, type StandingObject } from './turbo-outrun-scenery.js';
import { TURBO_OUTRUN_CONVERSION } from './turbo-outrun-course.js';
import { pathTurn } from '../out-run-hardware/road-tables.js';
import {
  dumpDirectory,
  readSource,
  zipOptions,
  type RoadDataCommands,
  command,
  compareStandings,
  type RoadDataOptions,
  type Standing,
} from '../road-data-commands.js';
import { assemblePrograms, OUTRUN_ROMS } from '../outrun/outrun-rom.js';
import { OUTRUN_HEIGHT_TABLES } from '../outrun/outrun-road.js';
import { conversionCommand } from '../original-outputs.js';
import { turboOutrunObjectsAtSpeed } from './turbo-outrun-ticks.js';
import { belowMostAdvance } from '../out-run-hardware/ticks.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { round3 } from '../shared/conversion.js';

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
export async function turboOutrunAtSpeed(options: RoadDataOptions, kmh: number) {
  const { set } = await readSource(TURBO_OUTRUN_ROMS, options);
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

export const TURBO_OUTRUN_COMMANDS: RoadDataCommands = Object.freeze({
  'turbo-outrun-read': command(
    { ...zipOptions(TURBO_OUTRUN_ROMS, OUTRUN_ROMS), '--out': 'value' },
    async function* (options) {
      // TURBO OUTRUN's ROM zip checked and read, never decrypted; every table its course uses to the dump, and the
      // tables described as OUTRUN's checked against OUTRUN's ROM zip.
      const { zips, set } = await readSource(TURBO_OUTRUN_ROMS, options);
      const outrun = await readSource(OUTRUN_ROMS, options);
      const dump = turboOutrunDump(set, {
        ...assemblePrograms(outrun.set),
        heightTables: OUTRUN_HEIGHT_TABLES,
      });
      // Where the objects stand in the speed-0 limit, its waits at the top speed: with the original's 108 objects, and
      // with no object wanting.
      const programs = assembleTurboOutrunPrograms(set);
      const { main } = programs;
      const clock = readClock(programs);
      const model = (kmh: number, slots: number) => {
        const { objects, runs } = turboOutrunObjects(main, dump.stages, { kmh, slots, clock });
        return { objects, runs };
      };
      const top = model(dump.constants.topSpeed, dump.constants.objectSlots.count);
      const designed = model(dump.constants.topSpeed, 4096);
      const out = options.get('--out') ?? dumpDirectory(TURBO_OUTRUN_ROMS);
      await atomicWrite(path.join(out, 'turbo-outrun.json'), JSON.stringify(dump) + '\n');
      const degrees = (radians: number) => Math.round(((radians * 180) / Math.PI) * 100) / 100;
      yield {
        ok: true,
        zips: [...zips, ...outrun.zips],
        out,
        constants: dump.constants,
        stages: dump.stages.map((stage, n) => {
          const { path: p } = stage;
          // Where the last turn ends: the heading holds from there to the path's end.
          let lastTurn = p.x.length - 1;
          while (lastTurn > 0 && p.x[lastTurn - 1] === p.x[lastTurn] && p.y[lastTurn - 1] === p.y[lastTurn]) lastTurn--;
          return {
            number: n,
            name: dump.names[n]!.name,
            curves: stage.curves.length,
            widths: stage.widthsHeights.filter((q) => q.kind !== 0).length,
            heights: stage.widthsHeights.filter((q) => q.kind === 0).length,
            scenery: stage.scenery.length,
            lastTurn,
            // Counterclockwise positive, as `pathTurn` counts.
            turn: degrees(pathTurn(p, 0, p.x.length - 1)),
            background: dump.stageBackgrounds[n]!.background,
          };
        }),
        heightTables: Object.keys(dump.heightTables).length,
        sceneryTypes: Object.keys(dump.sceneryTypes).length,
        kinds: Object.keys(dump.kinds).length,
        sizeLists: Object.keys(dump.sizeLists).length,
        palettes: Object.keys(dump.palettes).length,
        startObjects: dump.startObjects.map((s) => s.shown.length),
        sameAsOutrun: dump.sameAsOutrun,
        objects: {
          kmh: dump.constants.topSpeed,
          stages: top.runs.map((run) => ({
            stage: run.stage,
            gate: round3(run.gate),
            backgroundChange: round3(run.backgroundChange),
            end: round3(run.end),
            stops: run.stops,
            standing: top.objects.filter((o) => o.stage === run.stage).length,
            brought: run.brought,
            dropped: run.dropped,
            ended: run.ended,
            intoNext: top.objects.filter((o) => o.from.stage === run.stage && o.stage !== run.stage).length,
          })),
          standing: top.objects.length,
          pointItems: top.runs.reduce((n, r) => n + r.brought, 0),
          dropped: top.runs.reduce((n, r) => n + r.dropped, 0),
          designed: designed.runs.reduce((n, r) => n + r.brought, 0),
          designedDropped: designed.runs.reduce((n, r) => n + r.dropped, 0),
        },
      };
    },
    [TURBO_OUTRUN_ROMS, OUTRUN_ROMS],
  ),
  'turbo-outrun-course': conversionCommand(TURBO_OUTRUN_CONVERSION, TURBO_OUTRUN_ROMS),
});
