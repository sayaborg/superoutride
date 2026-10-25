/**
 * SUPER HANG-ON's road data commands ([Development](../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { atomicWrite, requireInput } from '../course/authoring-io.js';
import { superHangOnDump } from './super-hang-on-dump.js';
import { courseId, superHangOnCourses, SUPER_HANG_ON_CONVERSION_VERSION } from './super-hang-on-courses.js';
import { scaleTag } from './section-writing.js';

import {
  crossingReport,
  dumpDirectory,
  fidelityReport,
  oneZip,
  romDirectory,
  romSet,
  round1,
  round3,
  saveCourse,
  type RoadDataCommands,
} from './road-data-commands.js';

export const SUPER_HANG_ON_COMMANDS: RoadDataCommands = Object.freeze({
  'super-hang-on-read': async (options) => {
    // SUPER HANG-ON's ROM zip checked and read; every table its courses use to the dump.
    const zip = await oneZip(options.get('--zip'), romDirectory('super-hang-on'), '--zip');
    const dump = superHangOnDump(await romSet('shangon', [zip]));
    const out = options.get('--out') ?? dumpDirectory('super-hang-on');
    await atomicWrite(path.join(out, 'super-hang-on.json'), JSON.stringify(dump) + '\n');
    console.log(
      JSON.stringify({
        ok: true,
        zip,
        out,
        positions: dump.positions,
        courses: dump.courses,
        sceneryTypes: Object.keys(dump.sceneryTypes).length,
        sprites: Object.keys(dump.sprites).length,
        palettes: Object.keys(dump.palettes).length,
      }),
    );
  },
  'super-hang-on-course': async (options) => {
    // SUPER HANG-ON's courses, pictures and skies from the ROMs, written to content, or with `--check` compared.
    const check = options.has('--check');
    const zip = await oneZip(options.get('--zip'), romDirectory('super-hang-on'), '--zip');
    // `--lane`, temporary until K decides the scale: AFRICA alone at that lane's width, its id and pictures tagged.
    const lane = options.get('--lane');
    const candidate = lane === undefined ? undefined : { lane: Number(lane), courses: ['AFRICA'] };
    const built = superHangOnCourses(await romSet('shangon', [zip]), candidate);
    const courses = [];
    for (const { course, road, dropped, passed } of built.built) {
      const file = await saveCourse(courseId(course.name) + scaleTag(candidate?.lane), road.document, check);
      courses.push({
        course: file,
        sections: road.document.sections.length,
        metres: round1(road.path.length),
        objects: road.objects,
        notBroughtOut: dropped,
        runs: road.plan.runs.length,
        elements: road.plan.elements.length,
        ...fidelityReport(road.plan.fidelity),
        // The profile: its rise table's runs, the height points passed by, its heights' range and steepest grade.
        hills: (() => {
          const stations = Array.from({ length: Math.floor(road.path.length) + 1 }, (_, s) => s);
          const heights = stations.map(road.profile.height);
          return {
            runs: road.hills.runs,
            departure: road.hills.departure,
            passed,
            lowest: round1(Math.min(...heights)),
            highest: round1(Math.max(...heights)),
            steepest: round3(Math.max(...stations.map((s) => Math.abs(road.profile.grade(s))))),
          };
        })(),
        crossings: road.crossings.map((c) => crossingReport(c, road.profile.height)),
        rampRadius: road.rampRadius === null ? null : Math.round(road.rampRadius),
      });
    }
    for (const { image } of built.pictures) {
      const file = `content/${image.path}`;
      if (check) {
        const committed = await readFile(file).catch(() => null);
        requireInput(committed && Buffer.compare(committed, image.bytes) === 0, `/${file}`, `${file} is not the ROMs'`);
      } else await atomicWrite(file, image.bytes);
    }
    // Each section's sky, baked from its background; course images are saved as their exact compact bytes.
    const skies = built.built.flatMap(({ skies }) => skies);
    for (const { name, document } of skies) {
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
        conversion: SUPER_HANG_ON_CONVERSION_VERSION,
        checked: check,
        metresAPosition: built.metres,
        metresAUnit: built.unit,
        hillScale: built.hillScale,
        ground: built.ground,
        courses,
        pictures: built.pictures.length,
        skies: skies.length,
      }),
    );
  },
});
