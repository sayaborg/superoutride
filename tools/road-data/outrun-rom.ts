import { requireInput } from '../course/authoring-io.js';
import { interleave } from './program-words.js';
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
