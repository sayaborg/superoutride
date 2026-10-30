/**
 * SUPER HANG-ON's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../../course/authoring-io.js';
import { superHangOnDump } from './super-hang-on-dump.js';
import { courseId, superHangOnCourses, SUPER_HANG_ON_CONVERSION_VERSION, displayKmh } from './super-hang-on-courses.js';

import {
  overpassReport,
  dumpDirectory,
  fidelityReport,
  gradeReport,
  readSource,
  zipOptions,
  round1,
  round3,
  type RoadDataCommands,
  command,
  compareStandings,
  type RoadDataOptions,
  type Standing,
} from '../road-data-commands.js';
import { SUPER_HANG_ON_ROMS, assembleSuperHangOnPrograms } from './super-hang-on-rom.js';
import { conversionCommand, OriginalOutputs, type Conversion } from '../original-outputs.js';
import { readCourses, readSection, sectionPositions } from './super-hang-on-road.js';
import { courseScenery, sceneryRules, type ScenerySpot } from './super-hang-on-scenery.js';
import { courseSceneryAtSpeed } from './super-hang-on-ticks.js';
import { requireInput } from '../../authoring/authoring-error.js';

/** super-hang-on's conversion: its courses, pictures and skies raised from the ROMs, and its report. */
export const SUPER_HANG_ON_CONVERSION: Conversion = async (options) => {
  // SUPER HANG-ON's courses, pictures and skies from the ROMs, written to content, or with `--check` compared.
  const outputs = new OriginalOutputs();
  const { zips, set } = await readSource(SUPER_HANG_ON_ROMS, options);
  const built = superHangOnCourses(set);
  const courses = [];
  for (const { course, road, dropped, passed } of built.built) {
    const file = outputs.course(courseId(course.name), road.document);
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
          flights: gradeReport(road.profile, road.profile, road.path.length, built.topKmh).flights,
        };
      })(),
      overpasses: road.overpasses.map((c) => overpassReport(c, road.profile.height)),
      rampRadius: road.rampRadius === null ? null : Math.round(road.rampRadius),
    });
  }
  for (const { image } of built.pictures) outputs.file(image.path, image.bytes);
  // Each section's sky, baked from its background; course images are saved as their exact compact bytes.
  const skies = built.built.flatMap(({ skies }) => skies);
  for (const { name, document } of skies) {
    const text = JSON.stringify(document);
    outputs.file(`images/${name}.json`, text);
  }
  return {
    outputs,
    report: {
      zips,
      conversion: SUPER_HANG_ON_CONVERSION_VERSION,
      metresAPosition: built.metres,
      metresAUnit: built.unit,
      factor: built.factor,
      ground: built.ground,
      courses,
      pictures: built.pictures.length,
      skies: skies.length,
    },
  };
};

// A SUPER HANG-ON object's kind: its section and item.
const superHangOnStanding = (o: ScenerySpot): Standing => ({
  position: o.position,
  x: o.item.x,
  key: `section ${o.section} sprite ${o.item.sprite} palette ${o.item.palette} x ${o.item.x} ${o.item.mirrored}`,
});

/**
 * SUPER HANG-ON's scenery in the limit and by the ticks at the even speed word nearest `kmh` (v shows as
 * `displayKmh` km/h), compared course by course in each section's positions. An object's depth gains ⌊v / 2⌋ a tick (the
 * words at 0xC5EA), half the speed only where v is even, so the limit is the one through the even speed words (K,
 * 2026-10-27).
 */
export async function superHangOnAtSpeed(options: RoadDataOptions, kmh: number) {
  const programs = assembleSuperHangOnPrograms((await readSource(SUPER_HANG_ON_ROMS, options)).set);
  const { main } = programs;
  const positions = sectionPositions(main);
  const rules = sceneryRules(main);
  const speed = 2 * Math.round(kmh / displayKmh(main) / 2);
  requireInput(
    speed > 0 && speed <= rules.speed,
    '/arguments/--kmh',
    `--kmh is SUPER HANG-ON's even speed word ${speed}, above 0 and at most its top speed's, ${rules.speed}`,
  );
  // A tick at `speed` advances the road this many positions: where the ticks place an object, to within one.
  const tolerance = (rules.advance * speed) / 65536;
  const courses = readCourses(main).map((course) => {
    const points = course.sections.map((n) => readSection(programs, n, positions.length).scenery);
    const limit = courseScenery(main, points, positions.length);
    const ticks = courseSceneryAtSpeed(main, points, positions.length, speed);
    return {
      course: course.name,
      ...compareStandings(limit.spots.map(superHangOnStanding), ticks.spots.map(superHangOnStanding), tolerance),
    };
  });
  return { original: 'super-hang-on', kmh, speed, tolerance: round3(tolerance), courses };
}

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
