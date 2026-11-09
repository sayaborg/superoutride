import { programImage } from '../cpu/program-words.js';
import type { RomSet, RomSource } from '../shared/rom-set.js';

/** Where TOP SPEED's ROMs come from: MAME's `topspeed` ([Development](../../../docs/development.md#road-data-commands)). */
export const TOP_SPEED_ROMS: RomSource = Object.freeze({ original: 'top-speed', sets: Object.freeze(['topspeed']) });

/** The main CPU's program ROMs of MAME's `topspeed` (World): one pair of 64 KiB ROMs, its even and its odd bytes from 0. */
export const TOP_SPEED_PROGRAM_ROMS = Object.freeze([
  {
    even: { name: 'b14-67-1.9', size: 0x10000, crc: 0x23f17616 },
    odd: { name: 'b14-68-1.11', size: 0x10000, crc: 0x835659d9 },
  },
] as const);

/** Its data ROMs: two pairs of 128 KiB ROMs, even and odd bytes, from 0x80000 one after the other. */
export const TOP_SPEED_DATA_ROMS = Object.freeze([
  {
    even: { name: 'b14-54.24', size: 0x20000, crc: 0x172924d5 },
    odd: { name: 'b14-52.26', size: 0x20000, crc: 0xe1b5b2a1 },
  },
  {
    even: { name: 'b14-55.23', size: 0x20000, crc: 0xa1f15499 },
    odd: { name: 'b14-53.25', size: 0x20000, crc: 0x04a04f5f },
  },
] as const);

/** Where the main CPU addresses its data ROMs, and its ROM space's size. */
const DATA_AT = 0x80000;
const MAIN_SPACE = 0x100000;

/** The main CPU's ROM space from the ROM set, as it addresses it: its program from 0, its data from 0x80000. */
export function assembleTopSpeedMain(set: RomSet): Uint8Array {
  const out = new Uint8Array(MAIN_SPACE);
  out.set(programImage(set, TOP_SPEED_PROGRAM_ROMS), 0);
  out.set(programImage(set, TOP_SPEED_DATA_ROMS), DATA_AT);
  return out;
}

/** The sub CPU's program ROMs: one pair of 64 KiB ROMs, its even and its odd bytes from address 0. */
export const TOP_SPEED_SUB_ROMS = Object.freeze([
  {
    even: { name: 'b14-69.80', size: 0x10000, crc: 0xd652e300 },
    odd: { name: 'b14-70.81', size: 0x10000, crc: 0xb720592b },
  },
] as const);

/** The sub CPU's program from the ROM set, as it addresses it. */
export const assembleTopSpeedSub = (set: RomSet): Uint8Array => programImage(set, TOP_SPEED_SUB_ROMS);

/** The two PC080SNs' tile ROMs: the even and the odd bytes of 16,384 tiles of 8 × 8 pixels at 4 bits a pixel. */
export const TOP_SPEED_TILE_ROMS = Object.freeze([
  {
    even: { name: 'b14-06.52', size: 0x20000, crc: 0xb4e2536e },
    odd: { name: 'b14-07.54', size: 0x20000, crc: 0xc6025fff },
  },
] as const);

/** The tile layers' graphics from the ROM set, as the PC080SNs read them: the pair's bytes interleaved. */
export const assembleTopSpeedTiles = (set: RomSet): Uint8Array => programImage(set, TOP_SPEED_TILE_ROMS);
