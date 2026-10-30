/**
 * ENDURO RACER's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../../course/authoring-io.js';
import { enduroRacerDump } from './enduro-racer-dump.js';
import { ENDURO_RACER_CONVERSION } from './enduro-racer-course.js';
import { dumpDirectory, readSource, zipOptions, type RoadDataCommands, command } from '../road-data-commands.js';
import { ENDURO_RACER_ROMS } from './enduro-racer-rom.js';
import { conversionCommand } from '../original-outputs.js';
import { round1 } from '../shared/conversion.js';

export const ENDURO_RACER_COMMANDS: RoadDataCommands = Object.freeze({
  'enduro-racer-read': command(
    { ...zipOptions(ENDURO_RACER_ROMS), '--out': 'value' },
    async function* (options) {
      // ENDURO RACER's two ROM zips read, never decrypted; every table its course uses to the dump.
      const { zips, set } = await readSource(ENDURO_RACER_ROMS, options);
      const dump = enduroRacerDump(set);
      const out = options.get('--out') ?? dumpDirectory(ENDURO_RACER_ROMS);
      await atomicWrite(path.join(out, 'enduro-racer.json'), JSON.stringify(dump) + '\n');
      const degrees = (radians: number) => round1((radians * 180) / Math.PI);
      yield {
        ok: true,
        zips,
        out,
        constants: dump.constants,
        stageEnds: dump.stageEnds,
        paths: dump.paths.map(({ address, x, y }) => {
          // Each step's turn, counterclockwise positive as `Math.atan2` counts from x to the right and y ahead.
          let turn = 0;
          for (let p = 1; p < x.length; p++) {
            const step = Math.atan2(y[p]!, x[p]!) - Math.atan2(y[p - 1]!, x[p - 1]!);
            turn += Math.atan2(Math.sin(step), Math.cos(step));
          }
          const lengths = x.map((dx, p) => Math.hypot(dx, y[p]!) / 4096);
          return {
            address: `0x${address.toString(16)}`,
            first: [x[0], y[0]],
            last: [x.at(-1), y.at(-1)],
            turn: degrees(turn),
            notWhole: lengths.filter((l) => Math.abs(l - 1) > 0.01).length,
          };
        }),
        fords: dump.fords,
        hills: dump.hills.map((h) => h.start),
        scenery: Array.from({ length: 6 }, (_, s) => dump.scenery.filter((i) => i.position >> 11 === s).length),
        scaledScenery: dump.scenery.filter((i) => i.height !== undefined).length,
        sceneryTypes: Object.keys(dump.sceneryTypes).length,
        hitTypes: Object.entries(dump.sceneryTypes)
          .filter(([, t]) => t.flags & 8)
          .map(([type]) => Number(type).toString(16)),
        jumps: { halves: dump.jumps.halves, jumps: dump.jumps.jumps.length },
        start: dump.start.map(({ flags, position, x, sizes, height }) => ({
          flags: flags.toString(16),
          position,
          x,
          sizes: sizes.toString(16),
          height,
        })),
        sizeSets: Object.keys(dump.sizeSets).length,
        undrawnRows: Object.fromEntries(
          Object.entries(dump.sizeSets)
            .filter(([, set]) => set.undrawnPixels > 0)
            .map(([address, set]) => [Number(address).toString(16), set.undrawnPixels]),
        ),
        palettes: Object.keys(dump.palettes).length,
        layers: dump.backgrounds.map(({ front, back, backOffset }) => ({
          front: { rows: front.rows, columns: front.columns.length },
          back: { rows: back.rows, columns: back.columns.length, offset: backOffset },
        })),
      };
    },
    [ENDURO_RACER_ROMS],
  ),
  'enduro-racer-course': conversionCommand(ENDURO_RACER_CONVERSION, ENDURO_RACER_ROMS),
});
