import { requireInput } from '../course/authoring-io.js';
import { interleave } from './program-words.js';
import { spriteWords } from './sprite-pixels.js';
import type { ZipFile } from './zip.js';

/** A ROM by its name in the set and its CRC-32. */
interface Rom {
  readonly name: string;
  readonly crc: number;
}

/**
 * The program ROMs of MAME's `toutrun` (Turbo Out Run, the Out Run upgrade, FD1094 317-0118)
 * ([Original road data](../../docs/original-road-data.md#turbo-outrun)): for each CPU, pairs of 64 KiB ROMs, one holding
 * the even bytes and one the odd bytes of a 128 KiB part of its program. The main CPU's program is encrypted for
 * instruction fetches alone: its tables are its ROMs' bytes as they are, and it is never decrypted.
 */
export const TURBO_OUTRUN_PROGRAM_ROMS = Object.freeze({
  main: [
    { even: { name: 'epr-12513.133', crc: 0xae8835a5 }, odd: { name: 'epr-12512.118', crc: 0xf90372ad } },
    { even: { name: 'epr-12515.132', crc: 0x1f047df4 }, odd: { name: 'epr-12514.117', crc: 0x5539e9c3 } },
    { even: { name: 'epr-12293.131', crc: 0xf4321eea }, odd: { name: 'epr-12292.116', crc: 0x51d98af0 } },
  ],
  sub: [
    { even: { name: 'opr-12295.76', crc: 0xd43a3a84 }, odd: { name: 'opr-12294.58', crc: 0x27cdcfd3 } },
    { even: { name: 'opr-12297.75', crc: 0x1d9b5677 }, odd: { name: 'opr-12296.57', crc: 0x0a513671 } },
  ],
} as const);
/** The road ROM, twice with the same contents: 256 lines of 512 pixels, two bit planes, the second at 0x4000. */
export const TURBO_OUTRUN_ROAD_ROMS = Object.freeze([
  { name: 'epr-12298.11', crc: 0xfc9bc41b },
  { name: 'epr-12299.47', crc: 0xfc9bc41b },
] as const);
/** The tile ROMs: three bit planes, the lowest first, 8 bytes a tile. */
export const TURBO_OUTRUN_TILE_ROMS = Object.freeze([
  { name: 'opr-12323.102', crc: 0x4de43a6f },
  { name: 'opr-12324.103', crc: 0x24607a55 },
  { name: 'opr-12325.104', crc: 0x1405137a },
] as const);
/** The sprite ROMs: two sets of four, each ROM one byte of a 32-bit word, the least significant first. */
export const TURBO_OUTRUN_SPRITE_ROMS = Object.freeze([
  [
    { name: 'mpr-12336.9', crc: 0xdda465c7 },
    { name: 'mpr-12337.10', crc: 0x828233d1 },
    { name: 'mpr-12338.11', crc: 0x46b4b5f4 },
    { name: 'mpr-12339.12', crc: 0x0d7e3bab },
  ],
  [
    { name: 'mpr-12364.13', crc: 0xa4b83e65 },
    { name: 'mpr-12365.14', crc: 0x4a80b2a9 },
    { name: 'mpr-12366.15', crc: 0x385cb3ab },
    { name: 'mpr-12367.16', crc: 0x4930254a },
  ],
] as const);

const PROGRAM_ROM_SIZE = 0x10000;
const ROAD_ROM_SIZE = 0x8000;
const TILE_ROM_SIZE = 0x10000;
const SPRITE_ROM_SIZE = 0x20000;

const hex = (value: number) => value.toString(16).padStart(8, '0');

/** A ROM of the set: present, `size` bytes, its CRC-32 the set's. */
function romData(files: ReadonlyMap<string, ZipFile>, rom: Rom, size: number): Uint8Array {
  const file = files.get(rom.name);
  requireInput(file, `/rom/${rom.name}`, `The ROM set has no ${rom.name}`);
  requireInput(
    file.data.length === size && file.crc === rom.crc,
    `/rom/${rom.name}`,
    `${rom.name} is CRC ${hex(file.crc)} of ${file.data.length} bytes, not MAME toutrun's ${hex(rom.crc)} of ${size}`,
  );
  return file.data;
}

/** The two CPUs' programs as each CPU addresses them. */
export interface TurboOutrunPrograms {
  readonly main: Uint8Array;
  readonly sub: Uint8Array;
}

/**
 * The main and sub CPUs' programs from a ROM set's files, assembled as OUTRUN's are and not decrypted. Every ROM the
 * conversion reads (programs, road, tiles, sprites) is checked by name, size and CRC-32.
 */
export function assembleTurboOutrunPrograms(files: ReadonlyMap<string, ZipFile>): TurboOutrunPrograms {
  for (const rom of TURBO_OUTRUN_ROAD_ROMS) romData(files, rom, ROAD_ROM_SIZE);
  for (const rom of TURBO_OUTRUN_TILE_ROMS) romData(files, rom, TILE_ROM_SIZE);
  for (const rom of TURBO_OUTRUN_SPRITE_ROMS.flat()) romData(files, rom, SPRITE_ROM_SIZE);
  const program = (halves: readonly { readonly even: Rom; readonly odd: Rom }[]) => {
    const out = new Uint8Array(halves.length * 2 * PROGRAM_ROM_SIZE);
    halves.forEach(({ even, odd }, part) =>
      out.set(
        interleave(romData(files, even, PROGRAM_ROM_SIZE), romData(files, odd, PROGRAM_ROM_SIZE)),
        part * 2 * PROGRAM_ROM_SIZE,
      ),
    );
    return out;
  };
  return { main: program(TURBO_OUTRUN_PROGRAM_ROMS.main), sub: program(TURBO_OUTRUN_PROGRAM_ROMS.sub) };
}

/** Every ROM the tool reads, by name, with its CRC-32 as eight hex digits. */
export const turboOutrunRoms = (): Record<string, string> =>
  Object.fromEntries(
    [
      ...[...TURBO_OUTRUN_PROGRAM_ROMS.main, ...TURBO_OUTRUN_PROGRAM_ROMS.sub].flatMap(({ even, odd }) => [even, odd]),
      ...TURBO_OUTRUN_ROAD_ROMS,
      ...TURBO_OUTRUN_TILE_ROMS,
      ...TURBO_OUTRUN_SPRITE_ROMS.flat(),
    ].map(({ name, crc }) => [name, hex(crc)]),
  );

/** The sprite ROMs' words (`spriteWords`: .9 and .13 the lowest bytes, .12 and .16 the highest), set 1's after set 0's. */
export function assembleTurboOutrunSprites(files: ReadonlyMap<string, ZipFile>): Uint32Array {
  const words = new Uint32Array(TURBO_OUTRUN_SPRITE_ROMS.length * SPRITE_ROM_SIZE);
  TURBO_OUTRUN_SPRITE_ROMS.forEach((set, s) =>
    words.set(spriteWords(set.map((rom) => romData(files, rom, SPRITE_ROM_SIZE))), s * SPRITE_ROM_SIZE),
  );
  return words;
}

/** The tile ROMs' bit planes, the lowest first, 8 bytes a tile. */
export const assembleTurboOutrunTiles = (files: ReadonlyMap<string, ZipFile>): readonly Uint8Array[] =>
  TURBO_OUTRUN_TILE_ROMS.map((rom) => romData(files, rom, TILE_ROM_SIZE));
