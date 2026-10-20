/**
 * SUPER HANG-ON's road data dump ([Original road data](../../docs/original-road-data.md#super-hang-on)): every table its
 * courses use, read from the ROM set as the programs hold them, raw. It stays on the machine that read the ROMs.
 */
import type { ZipFile } from './zip.js';
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
  readHeightTable,
  readSceneryType,
  readSection,
  readStripes,
  sectionPositions,
} from './super-hang-on-road.js';
import { hitWidth, readGateParts, readGrid, sizeList, SPRITE_COUNT, spriteList, spritePalette } from './super-hang-on-sprites.js';
import { backgroundMap, backgroundNumber, backgroundPalettes } from './super-hang-on-backgrounds.js';
import { instruction } from './program-words.js';

/** The dump's format: raw tables, local to the machine that read the ROMs. */
export const SUPER_HANG_ON_DUMP_FORMAT = Object.freeze({
  format: 'superoutride.super-hang-on-road-data',
  version: 1,
} as const);

/**
 * The CHECK and GOAL banners' palettes: the programs' `move.b #palette, ($16, a0, d0.w)` at 0x6E40 (CHECK) and 0x6DFC
 * (GOAL), set on the banner's object as the gate comes out; START's is the banner's template's.
 */
export function bannerPalettes(main: Uint8Array) {
  const [check] = instruction(main, 0x6e40, [0x11bc, null, 0x0016], "the CHECK banner's palette");
  const [goal] = instruction(main, 0x6dfc, [0x11bc, null, 0x0016], "the GOAL banner's palette");
  return { start: readGateParts(main)[5]!.palette, check: check!, goal: goal! };
}

/** Every table the courses use, from the ROM set's files. */
export function superHangOnDump(files: ReadonlyMap<string, ZipFile>) {
  const programs: SuperHangOnPrograms = assembleSuperHangOnPrograms(files);
  // The sprite ROMs are checked too: the dump names their CRCs.
  assembleSuperHangOnSprites(files);
  const { main, sub } = programs;
  const positions = sectionPositions(main);
  const courses = readCourses(main);
  const numbers = courses.flatMap((c) => c.sections);
  if (new Set(numbers).size !== numbers.length) throw new RangeError('A section runs in more than one course');
  const sections = [...numbers].sort((a, b) => a - b).map((n) => readSection(programs, n, positions.length));
  const goal = readGoal(programs);
  const heightTables = [...new Set(sections.flatMap((s) => s.heights.map((h) => h.table)))].sort((a, b) => a - b);
  const types = [
    ...new Set([...sections.flatMap((s) => s.scenery), ...goal.scenery.flat()].map((p) => p.type)),
  ].sort((a, b) => a - b);
  const sceneryTypes = Object.fromEntries(types.map((t) => [t, readSceneryType(main, t)]));
  const gates = readGateParts(main);
  // The sprites the scenery shows by number, and the gates' frames by their size lists.
  const spriteNumbers = [
    ...new Set(Object.values(sceneryTypes).flatMap((t) => t.items.map((i) => i.sprite))),
  ].sort((a, b) => a - b);
  for (const n of spriteNumbers) if (n >= SPRITE_COUNT) throw new RangeError(`Sprite ${n} lies past the table`);
  const palettes = [
    ...new Set([
      ...Object.values(sceneryTypes).flatMap((t) => t.items.map((i) => i.palette)),
      ...gates.map((g) => g.palette),
      ...Object.values(bannerPalettes(main)),
    ]),
  ].sort((a, b) => a - b);
  return {
    ...SUPER_HANG_ON_DUMP_FORMAT,
    roms: superHangOnRoms(),
    positions,
    courses,
    sections,
    goal,
    heightTables: Object.fromEntries(heightTables.map((t) => [t, readHeightTable(sub, t)])),
    sceneryTypes,
    stripes: readStripes(main),
    sprites: Object.fromEntries(
      spriteNumbers.map((n) => [n, { list: spriteList(main, n), sizes: sizeList(main, spriteList(main, n)), hitWidth: hitWidth(main, n) }]),
    ),
    gates: { parts: gates.map((g) => ({ ...g, sizes: sizeList(main, g.sprite) })), banners: bannerPalettes(main) },
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
