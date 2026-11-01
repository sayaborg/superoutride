/**
 * SUPER MONACO GP's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../../course/authoring-io.js';
import { superMonacoGpDump } from './super-monaco-gp-dump.js';
import { FLAG } from './super-monaco-gp-boards.js';
import { SUPER_MONACO_GP_CONVERSION } from './super-monaco-gp-course.js';
import { dumpDirectory, readSource, zipOptions, type RoadDataCommands, command } from '../road-data-commands.js';
import { SUPER_MONACO_GP_ROMS } from './super-monaco-gp-rom.js';
import { conversionCommand } from '../original-outputs.js';
import { FLAT, UPRIGHT, VIEWED } from './super-monaco-gp-road.js';

export const SUPER_MONACO_GP_COMMANDS: RoadDataCommands = Object.freeze({
  'super-monaco-gp-read': command(
    { ...zipOptions(SUPER_MONACO_GP_ROMS), '--out': 'value' },
    async function* (options) {
      // SUPER MONACO GP's ROM zip read, never decrypted; every table its courses use to the dump.
      const { zips, set } = await readSource(SUPER_MONACO_GP_ROMS, options);
      const dump = superMonacoGpDump(set);
      const out = options.get('--out') ?? dumpDirectory(SUPER_MONACO_GP_ROMS);
      await atomicWrite(path.join(out, 'super-monaco-gp.json'), JSON.stringify(dump) + '\n');
      const objects = Object.values(dump.groups).flat();
      yield {
        ok: true,
        zips,
        out,
        course: (({ form, descriptor, headings, path: p, scenery, sides }) => {
          // The objects the course shows, by kind, and the kinds (kind, frames, palette, b1) among them.
          const shown = scenery.flatMap((s) => dump.groups[s.group] ?? []);
          const count = (kind: number) => shown.filter((o) => o.kind === kind).length;
          return {
            form,
            descriptor: Object.fromEntries(Object.entries(descriptor).map(([k, v]) => [k, `0x${v.toString(16)}`])),
            steps: headings.length,
            listWords: scenery.length,
            length: Math.round(p.dx.reduce((sum, dx, k) => sum + Math.hypot(dx, p.dy[k]!, p.dz[k]!), 0)),
            objects: shown.length,
            byKind: { flat: count(FLAT), standing: count(UPRIGHT), viewed: count(VIEWED) },
            sides: {
              left: sides.left.map((b) => [b.end, b.t1]),
              right: sides.right.map((b) => [b.end, b.t1]),
            },
          };
        })(dump.course),
        groups: Object.keys(dump.groups).length,
        kinds: new Set(objects.map((o) => `${o.kind} ${o.frames} ${o.flags & FLAG.palette} ${o.b1}`)).size,
        viewTables: Object.keys(dump.views).map((v) => `0x${Number(v).toString(16)}`),
        frameTables: Object.keys(dump.frameTables).length,
        pixelsPastEnd: Object.values(dump.frameTables).reduce((sum, f) => sum + f.pastEnd, 0),
        roadLayer: { sky: dump.background.roadLayer.rgb555[0x31], top: dump.background.roadLayer.rgb555[0] },
      };
    },
    [SUPER_MONACO_GP_ROMS],
  ),
  'super-monaco-gp-course': conversionCommand(SUPER_MONACO_GP_CONVERSION, SUPER_MONACO_GP_ROMS),
});
