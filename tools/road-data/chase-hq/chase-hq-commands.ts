/**
 * CHASE H.Q.'s road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one
 * JSON result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../../course/authoring-io.js';
import { command, dumpDirectory, readSource, zipOptions, type RoadDataCommands } from '../road-data-commands.js';
import { conversionCommand } from '../original-outputs.js';
import { CHASE_HQ_CONVERSION } from './chase-hq-course.js';
import { chaseHqDump } from './chase-hq-dump.js';
import { CHASE_HQ_ROMS } from './chase-hq-rom.js';

export const CHASE_HQ_COMMANDS: RoadDataCommands = Object.freeze({
  'chase-hq-read': command(
    { ...zipOptions(CHASE_HQ_ROMS), '--out': 'value' },
    async function* (options) {
      // CHASE H.Q.'s zip read; its course tables to the dump.
      const { zips, set } = await readSource(CHASE_HQ_ROMS, options);
      const dump = chaseHqDump(set);
      const out = options.get('--out') ?? dumpDirectory(CHASE_HQ_ROMS);
      await atomicWrite(path.join(out, 'chase-hq.json'), JSON.stringify(dump) + '\n');
      yield {
        ok: true,
        zips,
        out,
        courses: dump.courses.map((c) => `${c.stage}${c.side[0]!.toUpperCase()}: ${c.sections.length} sections`),
        palettes: Object.keys(dump.palettes).length,
      };
    },
    [CHASE_HQ_ROMS],
  ),
  'chase-hq-course': conversionCommand(CHASE_HQ_CONVERSION, CHASE_HQ_ROMS),
});
