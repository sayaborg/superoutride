/**
 * SUPER MONACO GP's road data commands ([Development](../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { atomicWrite, requireInput } from '../course/authoring-io.js';
import { superMonacoGpDump, VIEWED } from './super-monaco-gp-dump.js';
import {
  SUPER_MONACO_GP_CONVERSION_VERSION,
  PATH_UNIT as SUPER_MONACO_GP_PATH_UNIT,
  STEP_METRES as SUPER_MONACO_GP_STEP,
  superMonacoGpCourses,
} from './super-monaco-gp-course.js';

import {
  dumpDirectory,
  oneZip,
  romDirectory,
  romSet,
  round1,
  round3,
  saveCourse,
  type RoadDataCommands,
} from './road-data-commands.js';

export const SUPER_MONACO_GP_COMMANDS: RoadDataCommands = Object.freeze({
  'super-monaco-gp-read': async (options) => {
    // SUPER MONACO GP's ROM zip read, never decrypted; every table its courses use to the dump.
    const zip = await oneZip(options.get('--zip'), romDirectory('super-monaco-gp'), '--zip');
    const dump = superMonacoGpDump(await romSet('smgp', [zip]));
    const out = options.get('--out') ?? dumpDirectory('super-monaco-gp');
    await atomicWrite(path.join(out, 'super-monaco-gp.json'), JSON.stringify(dump) + '\n');
    const objects = Object.values(dump.groups).flat();
    console.log(
      JSON.stringify({
        ok: true,
        zip,
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
            byKind: { flat: count(0x04), standing: count(0x08), viewed: count(VIEWED) },
            bands: {
              left: bands.left.map((b) => [b.end, b.t1]),
              right: bands.right.map((b) => [b.end, b.t1]),
            },
          };
        }),
        groups: Object.keys(dump.groups).length,
        kinds: new Set(objects.map((o) => `${o.kind} ${o.frames} ${o.flags & 0xff} ${o.b1}`)).size,
        viewTables: Object.keys(dump.views).map((v) => `0x${Number(v).toString(16)}`),
        frameTables: Object.keys(dump.frameTables).length,
        pixelsPastEnd: Object.values(dump.frameTables).reduce((sum, f) => sum + f.pastEnd, 0),
        roadLayer: { sky: dump.background.roadLayer.rgb555[0x31], top: dump.background.roadLayer.rgb555[0] },
      }),
    );
  },
  'super-monaco-gp-course': async (options) => {
    // SUPER MONACO GP's two circuits from its ROM zip, written to content, or with `--check` compared.
    const check = options.has('--check');
    const zip = await oneZip(options.get('--zip'), romDirectory('super-monaco-gp'), '--zip');
    const built = superMonacoGpCourses(await romSet('smgp', [zip]));
    const courses = [];
    for (const { course, document, plan, written, hills, sections, objects, kerbs, inside } of built.courses) {
      const file = await saveCourse(course.id, document, check);
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
    for (const { image } of built.boards) {
      const picture = `content/${image.path}`;
      if (check) {
        const committed = await readFile(picture).catch(() => null);
        requireInput(
          committed && Buffer.compare(committed, image.bytes) === 0,
          `/${picture}`,
          `${picture} is not the ROMs'`,
        );
      } else await atomicWrite(picture, image.bytes);
    }
    // The skies, baked from the ROMs; course images are saved as their exact compact bytes.
    for (const { name, document } of built.skies) {
      const text = JSON.stringify(document);
      const skyFile = `content/images/${name}.json`;
      if (check) {
        const committed = await readFile(skyFile, 'utf8').catch(() => null);
        requireInput(committed === text, `/${skyFile}`, `${skyFile} is not the ROMs'`);
      } else await atomicWrite(skyFile, text);
    }
    console.log(
      JSON.stringify({
        ok: true,
        zip,
        conversion: SUPER_MONACO_GP_CONVERSION_VERSION,
        factor: built.factor,
        checked: check,
        metresAStep: SUPER_MONACO_GP_STEP,
        courses,
        images: {
          boards: built.boards.length,
          masterTexels: built.boards.reduce((sum, b) => sum + b.texels, 0),
        },
      }),
    );
  },
});
