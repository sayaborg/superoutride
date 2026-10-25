/**
 * TURBO OUTRUN's road data dump ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md)): every table its
 * course uses, read from the ROM set as the programs hold them, raw, with the stage's described tables beside them. It
 * stays on the machine that read the ROMs. Reading it checks the tables against what the description says of them, and
 * the tables it says are OUTRUN's against OUTRUN's ROM set.
 */
import { word } from './program-words.js';
import { requireInput } from '../course/authoring-io.js';
import type { RomSet } from './rom-set.js';
import { assemblePrograms } from './outrun-rom.js';
import { readHeightTable } from './road-tables.js';
import { assembleTurboOutrunPrograms, turboOutrunRoms } from './turbo-outrun-rom.js';
import {
  readConstants,
  readKind,
  readRoutines,
  readShadowSizes,
  readSizeList,
  readSpritePalette,
  readStripes,
  readStripSizeTable,
  readTurboOutrunSceneryType,
  readTurboOutrunStages,
  sizeCount,
  STRIP_SIZE_TABLES,
  TURBO_OUTRUN_HEIGHT_TABLES,
} from './turbo-outrun-road.js';
import { readAllStartObjects, START_FIGURES } from './turbo-outrun-start.js';
import { backgroundNumber, PALETTE_PATCHES, readBackground, stageTilePalettes } from './turbo-outrun-backgrounds.js';
import { TURBO_OUTRUN_NAMES } from './turbo-outrun-names.js';

/** The dump's format: raw tables, local to the machine that read the ROMs. */
export const TURBO_OUTRUN_DUMP_FORMAT = Object.freeze({
  format: 'superoutride.turbo-outrun-road-data',
  version: 1,
} as const);

/**
 * What the description says is OUTRUN's, at each set's address: the 225 height tables, the stripes (32 phases of 512
 * words on the sub CPU), the approach table (16 advances of 512 longs on the main CPU) and the sub CPU's road drawing,
 * which differs from OUTRUN's only where it addresses the height tables.
 */
const HEIGHT_TABLE_COUNT = 225;
const SAME_AS_OUTRUN = Object.freeze({
  stripes: { cpu: 'sub', turbo: 0x109ee, outrun: 0x109ee, bytes: 32 * 512 * 2 },
  approach: { cpu: 'main', turbo: 0x48010, outrun: 0x28000, bytes: 16 * 512 * 4 },
  roadDrawing: { cpu: 'sub', turbo: 0x1280, outrun: 0x1334, bytes: 0x2156 - 0x1280 },
} as const);
const OUTRUN_HEIGHT_TABLES = 0x220a;

/** Where TURBO OUTRUN's tables are OUTRUN's, each compared: how many words differ, and any that are not explained. */
function compareWithOutrun(
  turbo: { main: Uint8Array; sub: Uint8Array },
  outrun: { main: Uint8Array; sub: Uint8Array },
) {
  // A table's contents, without the address it lies at.
  const contents = (table: object) =>
    JSON.stringify(table, (key, value: unknown) => (key === 'address' ? undefined : value));
  const heightTables = Array.from(
    { length: HEIGHT_TABLE_COUNT },
    (_, n) =>
      contents(readHeightTable(turbo.sub, n, TURBO_OUTRUN_HEIGHT_TABLES)) === contents(readHeightTable(outrun.sub, n)),
  ).filter((same) => !same).length;
  const regions = Object.fromEntries(
    Object.entries(SAME_AS_OUTRUN).map(([name, r]) => {
      const t = turbo[r.cpu],
        o = outrun[r.cpu];
      const differing: number[] = [];
      for (let i = 0; i < r.bytes; i += 2) {
        const tw = word(t, r.turbo + i),
          ow = word(o, r.outrun + i);
        // The road drawing addresses the height tables, which lie 0xB4 earlier on TURBO OUTRUN's sub CPU.
        if (tw !== ow && !(name === 'roadDrawing' && tw === TURBO_OUTRUN_HEIGHT_TABLES && ow === OUTRUN_HEIGHT_TABLES))
          differing.push(r.turbo + i);
      }
      return [name, differing.length];
    }),
  );
  return { heightTables, ...regions };
}

/**
 * Every table the course uses, from TURBO OUTRUN's ROM set, checked against the description, and the tables
 * described as OUTRUN's checked against OUTRUN's ROM set.
 */
export function turboOutrunDump(set: RomSet, outrunSet: RomSet) {
  const programs = assembleTurboOutrunPrograms(set);
  const { main, sub } = programs;
  const { legs, names, stages } = readTurboOutrunStages(programs);
  const sameAsOutrun = compareWithOutrun(programs, assemblePrograms(outrunSet));
  for (const [table, differing] of Object.entries(sameAsOutrun))
    requireInput(differing === 0, `/rom/${table}`, `${differing} of TURBO OUTRUN's ${table} differ from OUTRUN's`);

  const heightNumbers = [
    ...new Set(stages.flatMap((s) => s.widthsHeights.filter((p) => p.kind === 0).map((p) => p.value))),
  ].sort((a, b) => a - b);
  const typeNumbers = [...new Set(stages.flatMap((s) => s.scenery.map((p) => p.type)))].sort((a, b) => a - b);
  const sceneryTypes = Object.fromEntries(typeNumbers.map((t) => [t, readTurboOutrunSceneryType(main, t)]));
  const startObjects = readAllStartObjects(main);
  const kindNumbers = [
    ...new Set([
      ...Object.values(sceneryTypes).flatMap((t) => t.items.map((i) => i.kind)),
      ...startObjects.flatMap((s) => s.items.map((i) => i.kind)),
    ]),
  ].sort((a, b) => a - b);
  const kinds = Object.fromEntries(kindNumbers.map((k) => [k, readKind(main, k)]));
  const sizeLists = new Map<number, number>();
  for (const kind of Object.values(kinds)) sizeLists.set(kind.sizes, sizeCount(kind.routine));
  for (const figure of START_FIGURES.flat()) sizeLists.set(figure.sizes, sizeLists.get(figure.sizes) ?? 5);
  const palettes = [
    ...new Set([...Object.values(kinds).map((k) => k.palette), ...START_FIGURES.flat().map((f) => f.palette)]),
  ].sort((a, b) => a - b);
  const backgroundNumbers = stages.map((s) => backgroundNumber(main, s.number));
  return {
    ...TURBO_OUTRUN_DUMP_FORMAT,
    roms: turboOutrunRoms(),
    constants: readConstants(main),
    legs,
    names: names.map((record, n) => ({ ...record, name: TURBO_OUTRUN_NAMES[n] })),
    stages,
    heightTables: Object.fromEntries(
      heightNumbers.map((n) => [n, readHeightTable(sub, n, TURBO_OUTRUN_HEIGHT_TABLES)]),
    ),
    stripes: readStripes(sub),
    sceneryTypes,
    kinds,
    routines: readRoutines(main),
    sizeLists: Object.fromEntries(
      [...sizeLists].sort(([a], [b]) => a - b).map(([address, count]) => [address, readSizeList(main, address, count)]),
    ),
    stripSizeTables: Object.fromEntries(
      Object.entries(STRIP_SIZE_TABLES).map(([name, address]) => [
        name,
        { address, sizes: readStripSizeTable(main, address) },
      ]),
    ),
    shadow: readShadowSizes(main),
    palettes: Object.fromEntries(palettes.map((p) => [p, readSpritePalette(main, p)])),
    startObjects,
    startFigures: START_FIGURES,
    backgrounds: Object.fromEntries(
      [...new Set(backgroundNumbers)]
        .sort((a, b) => a - b)
        .map((n) => {
          const { front, back, ...rest } = readBackground(main, n);
          return [
            n,
            {
              ...rest,
              front: { ...front, tiles: Array.from(front.tiles) },
              back: { ...back, tiles: Array.from(back.tiles) },
            },
          ];
        }),
    ),
    stageBackgrounds: stages.map((s, n) => ({
      stage: s.number,
      background: backgroundNumbers[n],
      tilePalettes: Array.from(stageTilePalettes(main, s.number)),
    })),
    palettePatches: PALETTE_PATCHES,
    sameAsOutrun,
  };
}
