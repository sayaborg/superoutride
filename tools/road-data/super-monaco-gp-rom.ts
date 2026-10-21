import { requireInput } from '../course/authoring-io.js';
import { interleave } from './program-words.js';
import { spriteWords } from './sprite-pixels.js';
import type { ZipFile } from './zip.js';

/** A ROM by its name in MAME's set and its CRC-32: the tool finds it by the latter. */
interface Rom {
  readonly name: string;
  readonly crc: number;
}

/**
 * SUPER MONACO GP's ROMs, MAME's `smgp` (Super Monaco GP, World, Rev B, FD1094 317-0126a)
 * ([Original road data](../../docs/original-road-data.md#super-monaco-gps-rom-set)): each CPU's program from a ROM of
 * its even bytes and a ROM of its odd bytes, 128 KiB each. The main CPU's program is encrypted for instruction fetches
 * alone: its tables are its ROMs' bytes as they are, and it is never decrypted. The sub CPU's holds the courses.
 */
export const SUPER_MONACO_GP_PROGRAM_ROMS = Object.freeze({
  main: { even: { name: 'epr-12563b.58', crc: 0xbaf1f333 }, odd: { name: 'epr-12564b.63', crc: 0xb5191af0 } },
  sub: { even: { name: 'epr-12576a.20', crc: 0x2c9599c1 }, odd: { name: 'epr-12577a.29', crc: 0xabf9a50b } },
} as const);
/** The tile ROMs: three bit planes, the lowest first, 8 bytes a tile. */
export const SUPER_MONACO_GP_TILE_ROMS = Object.freeze([
  { name: 'epr-12429.154', crc: 0x5851e614 },
  { name: 'epr-12430.153', crc: 0x05e00134 },
  { name: 'epr-12431.152', crc: 0x35572f4a },
] as const);
/**
 * The sprite ROMs: four sets of four, each ROM one byte of a 32-bit word, the least significant first; set g's words
 * are banks 2g (their first half) and 2g + 1.
 */
export const SUPER_MONACO_GP_SPRITE_ROMS = Object.freeze([
  [
    { name: 'mpr-12425.90', crc: 0x14bf2a15 },
    { name: 'mpr-12426.94', crc: 0x28b60dc0 },
    { name: 'mpr-12427.98', crc: 0x0a367928 },
    { name: 'mpr-12428.102', crc: 0xefa80ad5 },
  ],
  [
    { name: 'mpr-12421.91', crc: 0x25f46140 },
    { name: 'mpr-12422.95', crc: 0xcb51c8f6 },
    { name: 'mpr-12423.99', crc: 0x0be9818e },
    { name: 'mpr-12424.103', crc: 0x0ce00dfc },
  ],
  [
    { name: 'mpr-12417.92', crc: 0xa806eabf },
    { name: 'mpr-12418.96', crc: 0xed1a0f2b },
    { name: 'mpr-12419.100', crc: 0xce4568cb },
    { name: 'mpr-12420.104', crc: 0x679442eb },
  ],
  [
    { name: 'epr-12609.93', crc: 0xa867812f },
    { name: 'epr-12610.97', crc: 0x53b99417 },
    { name: 'epr-12611.101', crc: 0xbd5c6ab0 },
    { name: 'epr-12612.105', crc: 0xac86e890 },
  ],
] as const);

const PROGRAM_ROM_SIZE = 0x20000;
const TILE_ROM_SIZE = 0x10000;
const SPRITE_ROM_SIZE = 0x20000;

const hex = (value: number) => value.toString(16).padStart(8, '0');

/** A zip's files by CRC-32: the tool finds each ROM by its CRC, whatever the zip names it. */
export function superMonacoGpFiles(zip: ReadonlyMap<string, ZipFile>): Map<number, ZipFile> {
  return new Map([...zip.values()].map((file) => [file.crc, file]));
}

/** A ROM of the set: present by its CRC-32 and `size` bytes. */
function romData(files: ReadonlyMap<number, ZipFile>, rom: Rom, size: number): Uint8Array {
  const file = files.get(rom.crc);
  requireInput(file, `/rom/${rom.name}`, `The ROM set has no ${rom.name} (CRC ${hex(rom.crc)}): it is not MAME smgp`);
  requireInput(file.data.length === size, `/rom/${rom.name}`, `${rom.name} is ${file.data.length} bytes, not ${size}`);
  return file.data;
}

/** The two CPUs' programs as each CPU addresses them. */
export interface SuperMonacoGpPrograms {
  readonly main: Uint8Array;
  readonly sub: Uint8Array;
}

/**
 * The main and sub CPUs' programs, every ROM the conversion reads (programs, tiles, sprites) found by its CRC-32 and
 * size; the main CPU's program is not decrypted.
 */
export function assembleSuperMonacoGpPrograms(files: ReadonlyMap<number, ZipFile>): SuperMonacoGpPrograms {
  for (const rom of SUPER_MONACO_GP_TILE_ROMS) romData(files, rom, TILE_ROM_SIZE);
  for (const rom of SUPER_MONACO_GP_SPRITE_ROMS.flat()) romData(files, rom, SPRITE_ROM_SIZE);
  const program = ({ even, odd }: { readonly even: Rom; readonly odd: Rom }) =>
    interleave(romData(files, even, PROGRAM_ROM_SIZE), romData(files, odd, PROGRAM_ROM_SIZE));
  return { main: program(SUPER_MONACO_GP_PROGRAM_ROMS.main), sub: program(SUPER_MONACO_GP_PROGRAM_ROMS.sub) };
}

/** Every ROM the tool reads, by its name in MAME's set, with its CRC-32 as eight hex digits. */
export const superMonacoGpRoms = (): Record<string, string> =>
  Object.fromEntries(
    [
      ...[SUPER_MONACO_GP_PROGRAM_ROMS.main, SUPER_MONACO_GP_PROGRAM_ROMS.sub].flatMap(({ even, odd }) => [even, odd]),
      ...SUPER_MONACO_GP_TILE_ROMS,
      ...SUPER_MONACO_GP_SPRITE_ROMS.flat(),
    ].map(({ name, crc }) => [name, hex(crc)]),
  );

/** The sprite ROMs' words (`spriteWords`), set after set: banks of 0x10000 words, OUTRUN's. */
export function assembleSuperMonacoGpSprites(files: ReadonlyMap<number, ZipFile>): Uint32Array {
  const words = new Uint32Array(SUPER_MONACO_GP_SPRITE_ROMS.length * SPRITE_ROM_SIZE);
  SUPER_MONACO_GP_SPRITE_ROMS.forEach((set, g) =>
    words.set(spriteWords(set.map((rom) => romData(files, rom, SPRITE_ROM_SIZE))), g * SPRITE_ROM_SIZE),
  );
  return words;
}

/** The tile ROMs' bit planes, the lowest first, 8 bytes a tile. */
export const assembleSuperMonacoGpTiles = (files: ReadonlyMap<number, ZipFile>): readonly Uint8Array[] =>
  SUPER_MONACO_GP_TILE_ROMS.map((rom) => romData(files, rom, TILE_ROM_SIZE));
