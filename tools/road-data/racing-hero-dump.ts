/**
 * RACING HERO's road data dump ([Original road data](../../docs/original-road-data.md#racing-heros-dump)): every table
 * its courses use, read from the ROM set as the main program holds them, raw. It stays on the machine that read the
 * ROMs.
 */
import type { ZipFile } from './zip.js';
import { assembleRacingHeroMain, assembleRacingHeroSprites, racingHeroRoms } from './racing-hero-rom.js';
import {
  COUNTRIES,
  countrySections,
  DESCRIPTION_COUNT,
  readCourseSelect,
  readDescription,
  readGrades,
  readObjects,
  readRoad,
} from './racing-hero-road.js';
import {
  COUNTRY_PALETTES,
  EMPTY_DEFINITION,
  PALETTE_COUNT,
  pictureSize,
  readDefinition,
  readPicture,
  readSpritePalette,
  TYPE_COUNT,
  typeDefinition,
} from './racing-hero-sprites.js';
import {
  backgroundNumber,
  readBackgroundNumbers,
  readCommandList,
  readPaletteSet,
  readSkyColors,
  readTilePaletteWords,
  SKY_COLORS,
} from './racing-hero-backgrounds.js';
import { pixelsPastEnd } from './super-monaco-gp-sprites.js';

/** The dump's format: raw tables, local to the machine that read the ROMs. */
export const RACING_HERO_DUMP_FORMAT = Object.freeze({
  format: 'superoutride.racing-hero-road-data',
  version: 1,
} as const);

/** Every table the courses use, from the ROM set's files by CRC-32. */
export function racingHeroDump(files: ReadonlyMap<number, ZipFile>) {
  const main = assembleRacingHeroMain(files);
  const words = assembleRacingHeroSprites(files);
  const descriptions = Array.from({ length: DESCRIPTION_COUNT }, (_, k) => readDescription(main, k));
  const countries = COUNTRIES.map((country) => ({
    ...country,
    sections: countrySections(main, country.section),
    background: backgroundNumber(main, country.section),
  }));
  const sections = Object.fromEntries(
    countries
      .flatMap((c) => c.sections)
      .sort((a, b) => a - b)
      .map((k) => {
        const d = descriptions[k]!;
        return [
          k,
          {
            road: readRoad(main, d.road),
            grades: readGrades(main, d.grades),
            scenery: readObjects(main, d.scenery),
            surface: readObjects(main, d.surface),
          },
        ];
      }),
  );
  const used = [
    ...new Set(
      Object.values(sections).flatMap((s) =>
        [...s.scenery, ...s.surface].flatMap((e) => ('type' in e ? [e.type] : [])),
      ),
    ),
  ].sort((a, b) => a - b);
  const types = Object.fromEntries(
    used.map((t) => [t, typeDefinition(main, t) === EMPTY_DEFINITION ? null : readDefinition(main, t)]),
  );
  const pictures = [...new Set(Object.values(types).flatMap((d) => (d ? d.parts[0]!.map((p) => p.picture) : [])))].sort(
    (a, b) => a - b,
  );
  const backgrounds = [...new Set(countries.map((c) => c.background))].sort((a, b) => a - b);
  return {
    ...RACING_HERO_DUMP_FORMAT,
    roms: racingHeroRoms(),
    descriptions,
    countries,
    sections,
    courseSelect: readCourseSelect(main),
    typeTable: Array.from({ length: TYPE_COUNT / 4 }, (_, k) => typeDefinition(main, 4 * k)),
    types,
    pictures: Object.fromEntries(
      pictures.map((a) => [a, { ...readPicture(main, a), pastEnd: pixelsPastEnd(words, pictureSize(main, a)) }]),
    ),
    palettes: {
      A: Array.from({ length: PALETTE_COUNT }, (_, p) => readSpritePalette(main, p, 'A')),
      B: Array.from({ length: PALETTE_COUNT - COUNTRY_PALETTES }, (_, p) =>
        readSpritePalette(main, COUNTRY_PALETTES + p, 'B'),
      ),
    },
    background: {
      numbers: readBackgroundNumbers(main),
      lists: Object.fromEntries(backgrounds.map((n) => [n, readCommandList(main, n)])),
      tilePalettes: readTilePaletteWords(main),
      paletteSets: Object.fromEntries(backgrounds.map((n) => [n + 1, readPaletteSet(main, n + 1)])),
      sky: Object.fromEntries(Object.entries(SKY_COLORS).map(([name, a]) => [name, readSkyColors(main, a)])),
    },
  };
}
