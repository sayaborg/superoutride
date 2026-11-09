/**
 * TOP SPEED's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one
 * JSON result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../../course/authoring-io.js';
import { command, dumpDirectory, readSource, zipOptions, type RoadDataCommands } from '../road-data-commands.js';
import { conversionCommand } from '../original-outputs.js';
import { TOP_SPEED_CONVERSION } from './top-speed-course.js';
import { topSpeedDump } from './top-speed-dump.js';
import { TOP_SPEED_ROMS } from './top-speed-rom.js';

export const TOP_SPEED_COMMANDS: RoadDataCommands = Object.freeze({
  'top-speed-read': command(
    { ...zipOptions(TOP_SPEED_ROMS), '--out': 'value' },
    async function* (options) {
      // TOP SPEED's zip read; its course tables to the dump.
      const { zips, set } = await readSource(TOP_SPEED_ROMS, options);
      const dump = topSpeedDump(set);
      const out = options.get('--out') ?? dumpDirectory(TOP_SPEED_ROMS);
      await atomicWrite(path.join(out, 'top-speed.json'), JSON.stringify(dump) + '\n');
      yield {
        ok: true,
        zips,
        out,
        paths: dump.stages.map((s) => s.paths.length),
        courses: dump.courses.map((c) => `${c.course}: ${c.sections.length} sections, ${c.skies.length} skies`),
      };
    },
    [TOP_SPEED_ROMS],
  ),
  'top-speed-course': conversionCommand(TOP_SPEED_CONVERSION, TOP_SPEED_ROMS),
});
