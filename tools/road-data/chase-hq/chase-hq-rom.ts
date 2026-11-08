import { programImage } from '../cpu/program-words.js';
import { tileGraphics } from '../taito/tc0100scn.js';
import type { RomSet, RomSource } from '../shared/rom-set.js';

/** Where CHASE H.Q.'s ROMs come from: MAME's `chasehq` ([Development](../../../docs/development.md#road-data-commands)). */
export const CHASE_HQ_ROMS: RomSource = Object.freeze({ original: 'chase-hq', sets: Object.freeze(['chasehq']) });

const ROM_SIZE = 0x20000;

/**
 * The main CPU's program ROMs of MAME's `chasehq` (World): pairs of 128 KiB ROMs, one holding the even bytes and one the
 * odd bytes of a 256 KiB half of its program, the halves one after another from address 0.
 */
export const CHASE_HQ_MAIN_ROMS = Object.freeze([
  {
    even: { name: 'b52-130.36', size: ROM_SIZE, crc: 0x4e7beb46 },
    odd: { name: 'b52-136.29', size: ROM_SIZE, crc: 0x2f414df0 },
  },
  {
    even: { name: 'b52-131.37', size: ROM_SIZE, crc: 0xaa945d83 },
    odd: { name: 'b52-129.30', size: ROM_SIZE, crc: 0x0eaebc08 },
  },
] as const);

/** The main CPU's program from the ROM set, as it addresses it. */
export const assembleChaseHqMain = (set: RomSet): Uint8Array => programImage(set, CHASE_HQ_MAIN_ROMS);

/** The sub CPU's program ROMs: one pair of 64 KiB ROMs, its even and its odd bytes from address 0. */
export const CHASE_HQ_SUB_ROMS = Object.freeze([
  {
    even: { name: 'b52-132.39', size: 0x10000, crc: 0xa2f54789 },
    odd: { name: 'b52-133.55', size: 0x10000, crc: 0x12232f95 },
  },
] as const);

/** The sub CPU's program from the ROM set, as it addresses it. */
export const assembleChaseHqSub = (set: RomSet): Uint8Array => programImage(set, CHASE_HQ_SUB_ROMS);

/** The TC0100SCN's tile ROM: 16,384 tiles of 8 × 8 pixels at 4 bits a pixel. */
export const CHASE_HQ_TILE_ROM = Object.freeze({ name: 'b52-29.27', size: 0x80000, crc: 0x8366d27c });

/** The tile layers' graphics from the ROM set, as the TC0100SCN reads them. */
export const assembleChaseHqTiles = (set: RomSet): Uint8Array => tileGraphics(set.data(CHASE_HQ_TILE_ROM));
