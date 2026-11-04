/**
 * FINAL LAP 2's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints
 * one JSON result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../../course/authoring-io.js';
import { command, dumpDirectory, readSource, zipOptions, type RoadDataCommands } from '../road-data-commands.js';
import { conversionCommand } from '../original-outputs.js';
import { round3 } from '../shared/conversion.js';
import { finalLap2Dump } from './final-lap-2-dump.js';
import { FINAL_LAP_2_CONVERSION } from './final-lap-2-course.js';
import { FINAL_LAP_2_ROMS } from './final-lap-2-rom.js';

export const FINAL_LAP_2_COMMANDS: RoadDataCommands = Object.freeze({
  'final-lap-2-read': command(
    { ...zipOptions(FINAL_LAP_2_ROMS), '--out': 'value' },
    async function* (options) {
      // FINAL LAP 2's zip read; every table its courses take to the dump.
      const { zips, set } = await readSource(FINAL_LAP_2_ROMS, options);
      const dump = finalLap2Dump(set);
      const out = options.get('--out') ?? dumpDirectory(FINAL_LAP_2_ROMS);
      await atomicWrite(path.join(out, 'final-lap-2.json'), JSON.stringify(dump) + '\n');
      yield {
        ok: true,
        zips,
        out,
        names: dump.names,
        turns: dump.curveTables.map((t) => t.reduce((sum, v) => sum + v, 0)),
        line: dump.line,
        laps: dump.laps,
        interval: round3(dump.interval.interval),
      };
    },
    [FINAL_LAP_2_ROMS],
  ),
  'final-lap-2-course': conversionCommand(FINAL_LAP_2_CONVERSION, FINAL_LAP_2_ROMS),
});
