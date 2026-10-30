/**
 * SUPER MONACO GP's road data commands ([Development](../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../course/authoring-io.js';
import { FLAT, superMonacoGpDump, UPRIGHT, VIEWED } from './super-monaco-gp-dump.js';
import { FLAG } from './super-monaco-gp-boards.js';
import {
  SUPER_MONACO_GP_CONVERSION_VERSION,
  PATH_UNIT as SUPER_MONACO_GP_PATH_UNIT,
  superMonacoGpCourses,
} from './super-monaco-gp-course.js';
import { STEP_METRES as SUPER_MONACO_GP_STEP } from './super-monaco-gp-constants.js';

import {
  dumpDirectory,
  readSource,
  zipOptions,
  round1,
  round3,
  type RoadDataCommands,
  command,
} from './road-data-commands.js';
import { SUPER_MONACO_GP_ROMS } from './super-monaco-gp-rom.js';
import { conversionCommand, OriginalOutputs, type Conversion } from './original-outputs.js';

/** super-monaco-gp's conversion: its courses, pictures and skies raised from the ROMs, and its report. */
export const SUPER_MONACO_GP_CONVERSION: Conversion = async (options) => {
  // SUPER MONACO GP's two circuits from its ROM zip, written to content, or with `--check` compared.
  const outputs = new OriginalOutputs();
  const { zips, set } = await readSource(SUPER_MONACO_GP_ROMS, options);
  const built = superMonacoGpCourses(set);
  const courses = [];
  for (const { course, document, plan, written, hills, sections, objects, kerbs, inside } of built.courses) {
    const file = outputs.course(course.id, document);
    const elements = written.flat();
    const arcs = elements.filter((e) => e.kind === 'arc');
    courses.push({
      course: file,
      // P's runs and its elements as written, the tightest arc, and how far a point of the path lies from P.
      runs: plan.runs.length,
      elements: elements.length,
      arcs: arcs.length,
      tightest: round1(Math.min(...arcs.map((e) => e.radius!))),
      departure: round3(plan.departure * SUPER_MONACO_GP_PATH_UNIT),
      lapMetres: round3(elements.reduce((sum, e) => sum + e.length, 0)),
      // The profile's runs, how far a point of the path lies from it, its heights' range and its steepest grade.
      profile: (() => {
        const lap = elements.reduce((sum, e) => sum + e.length, 0);
        const samples = Array.from({ length: Math.ceil(lap) + 1 }, (_, i) => Math.min(lap, i));
        const grades = samples.map((u) => hills.profile.grade(u));
        const heights = samples.map((u) => hills.profile.height(u));
        return {
          runs: hills.runs.length,
          departure: round3(hills.departure),
          lowest: round1(Math.min(...heights)),
          highest: round1(Math.max(...heights)),
          steepest: round3(Math.max(...grades.map(Math.abs))),
          closes: round3(hills.profile.height(lap)),
        };
      })(),
      sections: sections.map(({ id, steps, boards }) => ({ id, steps, boards })),
      // The boards placed, the kerbs drawn as stripes, and the boards left out on a curve's inside.
      boards: objects.length,
      // The boards whose foot is below the ground, by group: at the original's height, folded, standing.
      below: Object.fromEntries(
        (['original', 'folded', 'standing'] as const).map((g) => [g, objects.filter((o) => o.below === g).length]),
      ),
      kerbs: kerbs.length,
      inside,
    });
  }
  // The boards' images, as the ROMs' pictures are.
  for (const { image } of built.boards) outputs.file(image.path, image.bytes);
  // The skies, baked from the ROMs; course images are saved as their exact compact bytes.
  for (const { name, document } of built.skies) {
    const text = JSON.stringify(document);
    outputs.file(`images/${name}.json`, text);
  }
  return {
    outputs,
    report: {
      zips,
      conversion: SUPER_MONACO_GP_CONVERSION_VERSION,
      factor: built.factor,
      metresAStep: SUPER_MONACO_GP_STEP,
      courses,
      images: {
        boards: built.boards.length,
        masterTexels: built.boards.reduce((sum, b) => sum + b.texels, 0),
      },
      // The tunnel's frame: its pictures, the boards that show them, its half width and top, and its opening's.
      frame: built.frame && {
        pictures: built.boards.filter((b) => b.name.endsWith('-frame')).map((b) => b.name),
        boards: built.courses.reduce((sum, c) => sum + c.objects.filter((o) => o.image.endsWith('-frame')).length, 0),
        half: round3(built.frame.half),
        top: round3(built.frame.top),
        inner: round3(built.frame.inner),
        ceiling: round3(built.frame.ceiling),
      },
    },
  };
};

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
        courses: dump.courses.map(({ form, descriptor, headings, path: p, scenery, bands }) => {
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
            bands: {
              left: bands.left.map((b) => [b.end, b.t1]),
              right: bands.right.map((b) => [b.end, b.t1]),
            },
          };
        }),
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
