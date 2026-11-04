/**
 * POLE POSITION II's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints
 * one JSON result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../../course/authoring-io.js';
import { command, dumpDirectory, readSource, zipOptions, type RoadDataCommands } from '../road-data-commands.js';
import { conversionCommand } from '../original-outputs.js';
import { round3 } from '../shared/conversion.js';
import { polePositionIIDump } from './pole-position-ii-dump.js';
import { POLE_POSITION_II_CONVERSION } from './pole-position-ii-course.js';
import { POLE_POSITION_II_ROMS } from './pole-position-ii-rom.js';

export const POLE_POSITION_II_COMMANDS: RoadDataCommands = Object.freeze({
  'pole-position-ii-read': command(
    { ...zipOptions(POLE_POSITION_II_ROMS), '--out': 'value' },
    async function* (options) {
      // POLE POSITION II's zip read; every table its courses take to the dump.
      const { zips, set } = await readSource(POLE_POSITION_II_ROMS, options);
      const dump = polePositionIIDump(set);
      const out = options.get('--out') ?? dumpDirectory(POLE_POSITION_II_ROMS);
      await atomicWrite(path.join(out, 'pole-position-ii.json'), JSON.stringify(dump) + '\n');
      yield {
        ok: true,
        zips,
        out,
        names: dump.names,
        turns: dump.curveTables.map((t) => t.reduce((sum, v) => sum + v, 0)),
        interval: { factor: dump.interval.factor, metres: round3(dump.interval.metres) },
      };
    },
    [POLE_POSITION_II_ROMS],
  ),
  'pole-position-ii-course': conversionCommand(POLE_POSITION_II_CONVERSION, POLE_POSITION_II_ROMS),
});
