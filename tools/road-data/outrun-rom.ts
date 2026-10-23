import { requireInput } from '../course/authoring-io.js';
import { interleave } from './program-words.js';
import { spriteWords } from './sprite-pixels.js';
import type { ZipFile } from './zip.js';

/**
 * The program ROMs of MAME's `outrun` (Rev. B) that hold the road data ([Original road data](../../docs/original-road-data.md)):
 * for each CPU, pairs of 64 KiB ROMs, one holding the even bytes and one the odd bytes of a 128 KiB half of its program.
 */
export const OUTRUN_PROGRAM_ROMS = Object.freeze({
  main: [
    { even: { name: 'epr-10380b.133', crc: 0x1f6cadad }, odd: { name: 'epr-10382b.118', crc: 0xc4c3fa1a } },
    { even: { name: 'epr-10381b.132', crc: 0xbe8c412b }, odd: { name: 'epr-10383b.117', crc: 0x10a2014a } },
  ],
  sub: [
    { even: { name: 'epr-10327a.76', crc: 0xe28a5baf }, odd: { name: 'epr-10329a.58', crc: 0xda131c81 } },
    { even: { name: 'epr-10328a.75', crc: 0xd5ec5e5d }, odd: { name: 'epr-10330a.57', crc: 0xba9ec82a } },
  ],
} as const);

const ROM_SIZE = 0x10000;

/** The two CPUs' programs as each CPU addresses them. */
export interface OutrunPrograms {
  readonly main: Uint8Array;
  readonly sub: Uint8Array;
}

/** The main and sub CPUs' programs from a ROM set's files, each ROM checked by name, size and CRC-32. */
export function assemblePrograms(files: ReadonlyMap<string, ZipFile>): OutrunPrograms {
  const rom = ({ name, crc }: { readonly name: string; readonly crc: number }) => {
    const file = files.get(name);
    requireInput(file, `/rom/${name}`, `The ROM set has no ${name}`);
    requireInput(
      file.data.length === ROM_SIZE && file.crc === crc,
      `/rom/${name}`,
      `${name} is CRC ${hex(file.crc)} of ${file.data.length} bytes, not MAME outrun (Rev. B)'s ${hex(crc)} of ${ROM_SIZE}`,
    );
    return file.data;
  };
  const program = (
    halves: readonly { readonly even: { name: string; crc: number }; readonly odd: { name: string; crc: number } }[],
  ) => {
    const out = new Uint8Array(halves.length * 2 * ROM_SIZE);
    halves.forEach(({ even, odd }, half) => out.set(interleave(rom(even), rom(odd)), half * 2 * ROM_SIZE));
    return out;
  };
  return { main: program(OUTRUN_PROGRAM_ROMS.main), sub: program(OUTRUN_PROGRAM_ROMS.sub) };
}

const hex = (value: number) => `0x${value.toString(16).padStart(8, '0')}`;

/** The tile ROMs: three bit planes, each two 32 KiB ROMs (tiles 0–4095, then 4096–8191), the lowest bit first. */
export const OUTRUN_TILE_ROMS = Object.freeze([
  [
    { name: 'opr-10268.99', crc: 0x95344b04 },
    { name: 'opr-10232.102', crc: 0x776ba1eb },
  ],
  [
    { name: 'opr-10267.100', crc: 0xa85bb823 },
    { name: 'opr-10231.103', crc: 0x8908bcbf },
  ],
  [
    { name: 'opr-10266.101', crc: 0x9f6f1a74 },
    { name: 'opr-10230.104', crc: 0x686f5e50 },
  ],
] as const);
const TILE_ROM_SIZE = 0x8000;

/** The tile ROMs' three bit planes, each 8 bytes a tile (a byte a row, its bit 7 the leftmost pixel). */
export function assembleTiles(files: ReadonlyMap<string, ZipFile>): readonly Uint8Array[] {
  return OUTRUN_TILE_ROMS.map((halves) => {
    const plane = new Uint8Array(halves.length * TILE_ROM_SIZE);
    halves.forEach(({ name, crc }, h) => {
      const file = files.get(name);
      requireInput(file, `/rom/${name}`, `The ROM set has no ${name}`);
      requireInput(
        file.data.length === TILE_ROM_SIZE && file.crc === crc,
        `/rom/${name}`,
        `${name} is not MAME outrun's tile ROM of CRC ${crc.toString(16).padStart(8, '0')}`,
      );
      plane.set(file.data, h * TILE_ROM_SIZE);
    });
    return plane;
  });
}

/** The sprite ROMs: two sets of four, each ROM one byte of a 32-bit word, the least significant first. */
export const OUTRUN_SPRITE_ROMS = Object.freeze([
  [
    { name: 'mpr-10371.9', crc: 0x7cc86208 },
    { name: 'mpr-10373.10', crc: 0xb0d26ac9 },
    { name: 'mpr-10375.11', crc: 0x59b60bd7 },
    { name: 'mpr-10377.12', crc: 0x17a1b04a },
  ],
  [
    { name: 'mpr-10372.13', crc: 0xb557078c },
    { name: 'mpr-10374.14', crc: 0x8051e517 },
    { name: 'mpr-10376.15', crc: 0xf3b8f318 },
    { name: 'mpr-10378.16', crc: 0xa1062984 },
  ],
] as const);
const SPRITE_ROM_SIZE = 0x20000;

/** The sprite ROMs' words (`spriteWords`: .9 and .13 the lowest bytes, .12 and .16 the highest), set 1's after set 0's. */
export function assembleSprites(files: ReadonlyMap<string, ZipFile>): Uint32Array {
  const words = new Uint32Array(OUTRUN_SPRITE_ROMS.length * SPRITE_ROM_SIZE);
  OUTRUN_SPRITE_ROMS.forEach((set, s) => {
    const data = set.map(({ name, crc }) => {
      const file = files.get(name);
      requireInput(file, `/rom/${name}`, `The ROM set has no ${name}`);
      requireInput(
        file.data.length === SPRITE_ROM_SIZE && file.crc === crc,
        `/rom/${name}`,
        `${name} is not MAME outrun's sprite ROM of CRC ${crc.toString(16).padStart(8, '0')}`,
      );
      return file.data;
    });
    words.set(spriteWords(data), s * SPRITE_ROM_SIZE);
  });
  return words;
}

/** The road ROM: 256 lines of 512 pixels, two bit planes of 64 bytes a line one after the other, 32 KiB. */
export const OUTRUN_ROAD_ROM = Object.freeze({ name: 'opr-10185.11', crc: 0x22794426 });

/** The sound program, and the PCM ROMs by bank: each 32 KiB, a bank's 64 KiB holding it twice. */
export const OUTRUN_SOUND_ROMS = Object.freeze({
  program: { name: 'epr-10187.88', crc: 0xa10abaa9 },
  pcm: [
    { name: 'opr-10193.66', crc: 0xbcd10dde },
    { name: 'opr-10192.67', crc: 0x770f1270 },
    { name: 'opr-10191.68', crc: 0x20a284ab },
    { name: 'opr-10190.69', crc: 0x7cab70e2 },
    { name: 'opr-10189.70', crc: 0x01366b54 },
    { name: 'opr-10188.71', crc: 0xbad30ad9 },
  ],
} as const);
export const SOUND_ROM_SIZE = 0x8000;

/** The sound program and the PCM banks from a ROM set's files, each ROM checked by size and CRC-32. */
export function assembleSound(files: ReadonlyMap<string, ZipFile>) {
  const rom = ({ name, crc }: { readonly name: string; readonly crc: number }) => {
    const file = files.get(name);
    requireInput(file, `/rom/${name}`, `The ROM set has no ${name}`);
    requireInput(
      file.data.length === SOUND_ROM_SIZE && file.crc === crc,
      `/rom/${name}`,
      `${name} is not MAME outrun's sound ROM of CRC ${crc.toString(16).padStart(8, '0')}`,
    );
    return file.data;
  };
  return { program: rom(OUTRUN_SOUND_ROMS.program), banks: OUTRUN_SOUND_ROMS.pcm.map(rom) };
}
