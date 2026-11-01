/**
 * SUPER HANG-ON's road data dump ([SUPER HANG-ON road data](../../../docs/super-hang-on-road-data.md)): every table its
 * courses use, read from the ROM set as the programs hold them, raw. It stays on the machine that read the ROMs.
 */
import type { RomSet } from '../shared/rom-set.js';
import {
  assembleSuperHangOnPrograms,
  assembleSuperHangOnSprites,
  superHangOnRoms,
  type SuperHangOnPrograms,
} from './super-hang-on-rom.js';
import {
  COURSE_COUNT,
  readCourses,
  readGoal,
  readHeightVectors,
  readSceneryType,
  readSection,
  readStripes,
  sectionPositions,
} from './super-hang-on-road.js';
import {
  hitWidth,
  readGateParts,
  readGrid,
  sizeList,
  spriteList,
  spritePalette,
  readGateBringOuts,
} from './super-hang-on-sprites.js';
import { backgroundMap, backgroundNumber, backgroundPalettes } from './super-hang-on-backgrounds.js';

/** The dump's format: raw tables, local to the machine that read the ROMs. */
export const SUPER_HANG_ON_DUMP_FORMAT = Object.freeze({
  format: 'superoutride.super-hang-on-road-data',
  version: 2,
} as const);

/** Every table the courses use, from the ROM set. */
export function superHangOnDump(set: RomSet) {
  const programs: SuperHangOnPrograms = assembleSuperHangOnPrograms(set);
  // The sprite ROMs are checked too: the dump names their CRCs.
  assembleSuperHangOnSprites(set);
  const { main, sub } = programs;
  const positions = sectionPositions(main);
  const courses = readCourses(main);
  const numbers = courses.flatMap((c) => c.sections);
  const sections = [...numbers].sort((a, b) => a - b).map((n) => readSection(programs, n, positions.length));
  const goal = readGoal(programs);
  const heightTables = [...new Set(sections.flatMap((s) => s.heights.map((h) => h.table)))].sort((a, b) => a - b);
  const types = [...new Set([...sections.flatMap((s) => s.scenery), ...goal.scenery.flat()].map((p) => p.type))].sort(
    (a, b) => a - b,
  );
  const sceneryTypes = Object.fromEntries(types.map((t) => [t, readSceneryType(main, t)]));
  const gates = readGateParts(main);
  const bringOuts = readGateBringOuts(main);
  // The sprites the scenery shows by number, and the gates' frames by their size lists.
  const spriteNumbers = [...new Set(Object.values(sceneryTypes).flatMap((t) => t.items.map((i) => i.sprite)))].sort(
    (a, b) => a - b,
  );
  const palettes = [
    ...new Set([
      ...Object.values(sceneryTypes).flatMap((t) => t.items.map((i) => i.palette)),
      ...gates.map((g) => g.palette),
      ...[bringOuts.start, bringOuts.check, bringOuts.goal].map((g) => g.palette),
    ]),
  ].sort((a, b) => a - b);
  return {
    ...SUPER_HANG_ON_DUMP_FORMAT,
    roms: superHangOnRoms(),
    positions,
    courses,
    sections,
    goal,
    heightTables: Object.fromEntries(heightTables.map((t) => [t, readHeightVectors(sub, t)])),
    sceneryTypes,
    stripes: readStripes(main),
    sprites: Object.fromEntries(
      spriteNumbers.map((n) => [
        n,
        { list: spriteList(main, n), sizes: sizeList(main, spriteList(main, n)), hitWidth: hitWidth(main, n) },
      ]),
    ),
    gates: { parts: gates.map((g) => ({ ...g, sizes: sizeList(main, g.sprite) })), bringOuts },
    palettes: Object.fromEntries(palettes.map((p) => [p, spritePalette(main, p)])),
    grids: Array.from({ length: COURSE_COUNT }, (_, c) => readGrid(main, c)),
    backgrounds: courses.map((course, c) =>
      course.sections.map((_, order) => {
        const number = backgroundNumber(main, c, order);
        const { address, palettes: loaded } = backgroundPalettes(main, number);
        return {
          number,
          palettes: { address, loaded: Object.fromEntries(loaded) },
          map: Array.from(backgroundMap(main, c, order)),
        };
      }),
    ),
  };
}
