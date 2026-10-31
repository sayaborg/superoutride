/**
 * TURBO OUTRUN's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../../course/authoring-io.js';
import { readClock } from './turbo-outrun-road.js';
import { turboOutrunDump } from './turbo-outrun-dump.js';
import { assembleTurboOutrunPrograms, TURBO_OUTRUN_ROMS } from './turbo-outrun-rom.js';
import { turboOutrunObjects } from './turbo-outrun-scenery.js';
import { TURBO_OUTRUN_CONVERSION } from './turbo-outrun-course.js';
import { pathTurn } from '../out-run-hardware/road-tables.js';
import { dumpDirectory, readSource, zipOptions, type RoadDataCommands, command } from '../road-data-commands.js';
import { assemblePrograms, OUTRUN_ROMS } from '../outrun/outrun-rom.js';
import { OUTRUN_HEIGHT_TABLES } from '../outrun/outrun-road.js';
import { conversionCommand } from '../original-outputs.js';
import { round3 } from '../shared/conversion.js';

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
