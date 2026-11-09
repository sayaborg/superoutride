import { programImage } from '../cpu/program-words.js';
import { tileGraphics } from '../taito/tc0100scn.js';
import type { RomSet, RomSource } from '../shared/rom-set.js';

/**
 * Where CONTINENTAL CIRCUS's ROMs come from: MAME's `contcirc`
 * ([Development](../../../docs/development.md#road-data-commands)).
 */
export const CONTINENTAL_CIRCUS_ROMS: RomSource = Object.freeze({
  original: 'continental-circus',
  sets: Object.freeze(['contcirc']),
});

const ROM_SIZE = 0x20000;

/** The main CPU's program ROMs of MAME's `contcirc` (World): one pair of 128 KiB ROMs, its even and its odd bytes from 0. */
export const CONTINENTAL_CIRCUS_MAIN_ROMS = Object.freeze([
  {
    even: { name: 'b33-ww.ic25', size: ROM_SIZE, crc: 0xf5c92e42 },
    odd: { name: 'b33-xx.ic26', size: ROM_SIZE, crc: 0xe7c1d1fa },
  },
] as const);

/** The main CPU's program from the ROM set, as it addresses it. */
export const assembleContinentalCircusMain = (set: RomSet): Uint8Array =>
  programImage(set, CONTINENTAL_CIRCUS_MAIN_ROMS);

/** The sub CPU's program ROMs: one pair of 128 KiB ROMs, its even and its odd bytes from address 0. */
export const CONTINENTAL_CIRCUS_SUB_ROMS = Object.freeze([
  {
    even: { name: 'b33-yy.ic35', size: ROM_SIZE, crc: 0x16522f2d },
    odd: { name: 'cc_36.bin', size: ROM_SIZE, crc: 0xa1732ea5 },
  },
] as const);

/** The sub CPU's program from the ROM set, as it addresses it. */
export const assembleContinentalCircusSub = (set: RomSet): Uint8Array => programImage(set, CONTINENTAL_CIRCUS_SUB_ROMS);

/** The TC0100SCN's tile ROM: 16,384 tiles of 8 × 8 pixels at 4 bits a pixel. */
export const CONTINENTAL_CIRCUS_TILE_ROM = Object.freeze({ name: 'b33-02.57', size: 0x80000, crc: 0xf6fb3ba2 });

/** The tile layers' graphics from the ROM set, as the TC0100SCN reads them. */
export const assembleContinentalCircusTiles = (set: RomSet): Uint8Array =>
  tileGraphics(set.data(CONTINENTAL_CIRCUS_TILE_ROM));
