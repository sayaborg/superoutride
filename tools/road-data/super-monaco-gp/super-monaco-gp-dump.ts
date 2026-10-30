/**
 * SUPER MONACO GP's road data dump ([SUPER MONACO GP road data](../../../docs/super-monaco-gp-road-data.md#super-monaco-gps-dump)): every
 * table its courses use, read from the ROM set as the programs hold them, raw. It stays on the machine that read the
 * ROMs.
 */
import type { RomSet } from '../shared/rom-set.js';
import {
  assembleSuperMonacoGpPrograms,
  assembleSuperMonacoGpSprites,
  superMonacoGpRoms,
} from './super-monaco-gp-rom.js';
import {
  COURSES,
  readCourseBands,
  readDescriptor,
  readGroup,
  readHeadings,
  readPath,
  readSceneryList,
} from './super-monaco-gp-road.js';
import {
  largestSize,
  PALETTE_COUNT,
  readFrameTable,
  readSpritePalette,
  readViewTable,
  pixelsPastEnd,
} from './super-monaco-gp-sprites.js';
import { drawPages, PAGE_RECORDS, readRoadLayerColors, readTilePalettes } from './super-monaco-gp-backgrounds.js';

/** The dump's format: raw tables, local to the machine that read the ROMs. */
export const SUPER_MONACO_GP_DUMP_FORMAT = Object.freeze({
  format: 'superoutride.super-monaco-gp-road-data',
  version: 2,
} as const);

/** The objects' kinds: a flat board, a standing one, and one that changes with the angle, its frames a view table. */
export const FLAT = 0x04;
export const UPRIGHT = 0x08;
export const VIEWED = 0x0c;
/** The rival cars' frame table on the main CPU. */
const RIVAL_FRAMES = 0x10e0;

/** Every table the courses use, from the ROM set. */
export function superMonacoGpDump(set: RomSet) {
  const { main, sub } = assembleSuperMonacoGpPrograms(set);
  const words = assembleSuperMonacoGpSprites(set);
  const courses = COURSES.map((form, c) => {
    const descriptor = readDescriptor(sub, c);
    const headings = readHeadings(sub, descriptor.headings);
    const list = readSceneryList(sub, descriptor.scenery);
    return {
      form,
      descriptor,
      headings,
      path: readPath(sub, descriptor.path, headings.length),
      scenery: list,
      bands: readCourseBands(main, c, headings.length),
    };
  });
  const groups = [...new Set(courses.flatMap((c) => c.scenery.map((s) => s.group)))].sort((a, b) => a - b);
  const groupObjects = Object.fromEntries(groups.map((g) => [g, readGroup(sub, g)]));
  const objects = Object.values(groupObjects).flat();
  const viewTables = [...new Set(objects.filter((o) => o.kind === VIEWED).map((o) => o.frames))].sort((a, b) => a - b);
  const views = Object.fromEntries(viewTables.map((t) => [t, readViewTable(sub, t)]));
  const frames = [
    ...new Set([
      ...objects.filter((o) => o.kind !== VIEWED).map((o) => o.frames),
      ...Object.values(views).flat(),
      RIVAL_FRAMES,
    ]),
  ].sort((a, b) => a - b);
  const frameTables = Object.fromEntries(
    frames.map((f) => [f, { sizes: readFrameTable(main, f), pastEnd: pixelsPastEnd(words, largestSize(main, f)) }]),
  );
  const pages = drawPages(main);
  return {
    ...SUPER_MONACO_GP_DUMP_FORMAT,
    roms: superMonacoGpRoms(),
    courses,
    groups: groupObjects,
    views,
    frameTables,
    rivalFrames: RIVAL_FRAMES,
    palettes: Array.from({ length: PALETTE_COUNT }, (_, p) => readSpritePalette(main, p)),
    background: {
      records: PAGE_RECORDS,
      pages: Array.from(pages),
      tilePalettes: Object.fromEntries(readTilePalettes(main)),
      roadLayer: readRoadLayerColors(main),
    },
  };
}
