/**
 * SUPER HANG-ON's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../../course/authoring-io.js';
import { superHangOnDump } from './super-hang-on-dump.js';
import { SUPER_HANG_ON_CONVERSION } from './super-hang-on-courses.js';
import { dumpDirectory, readSource, zipOptions, type RoadDataCommands, command } from '../road-data-commands.js';
import { SUPER_HANG_ON_ROMS } from './super-hang-on-rom.js';
import { conversionCommand } from '../original-outputs.js';

export const SUPER_HANG_ON_COMMANDS: RoadDataCommands = Object.freeze({
  'super-hang-on-read': command(
    { ...zipOptions(SUPER_HANG_ON_ROMS), '--out': 'value' },
    async function* (options) {
      // SUPER HANG-ON's ROM zip checked and read; every table its courses use to the dump.
      const { zips, set } = await readSource(SUPER_HANG_ON_ROMS, options);
      const dump = superHangOnDump(set);
      const out = options.get('--out') ?? dumpDirectory(SUPER_HANG_ON_ROMS);
      await atomicWrite(path.join(out, 'super-hang-on.json'), JSON.stringify(dump) + '\n');
      yield {
        ok: true,
        zips,
        out,
        positions: dump.positions,
        courses: dump.courses,
        sceneryTypes: Object.keys(dump.sceneryTypes).length,
        sprites: Object.keys(dump.sprites).length,
        palettes: Object.keys(dump.palettes).length,
      };
    },
    [SUPER_HANG_ON_ROMS],
  ),
  'super-hang-on-course': conversionCommand(SUPER_HANG_ON_CONVERSION, SUPER_HANG_ON_ROMS),
});
