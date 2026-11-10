import { programImage } from '../cpu/program-words.js';
import { tileGraphics } from '../taito/tc0100scn.js';
import { zSpriteGraphics, type ChunkRows } from '../taito/z-sprites.js';
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

/** The TC0150ROD's road ROM: 1,024 tiles of two road lines. */
export const CHASE_HQ_ROAD_ROM = Object.freeze({ name: 'b52-28.4', size: 0x80000, crc: 0x963bc82b });

/** The sprites' tile ROMs of their 128 × 128 pictures (OBJ A): four of 512 KiB, each a 16-bit word of every 8 bytes. */
export const CHASE_HQ_SPRITE_ROMS = Object.freeze([
  { name: 'b52-34.5', size: 0x80000, crc: 0x7d8dce36 },
  { name: 'b52-35.7', size: 0x80000, crc: 0x78eeec0d },
  { name: 'b52-36.9', size: 0x80000, crc: 0x61e89e91 },
  { name: 'b52-37.11', size: 0x80000, crc: 0xf02e47b9 },
] as const);

/** The spritemap ROM: each sprite's chunks' tile codes, 16-bit words little-endian. */
export const CHASE_HQ_SPRITE_MAP_ROM = Object.freeze({ name: 'b52-38.34', size: 0x80000, crc: 0x5b5bf7f6 });

/** A sprite's chunks' rows: tiles of 16 × 16 pixels, 8 × 8 chunks a sprite (MAME's `chasehq`). */
export const CHASE_HQ_CHUNK_ROWS: ChunkRows = 16;

/** The sprites' 128 × 128 pictures' tiles from the ROM set, as the chip reads them, and the spritemap. */
export const assembleChaseHqSprites = (set: RomSet) => ({
  gfx: zSpriteGraphics(CHASE_HQ_SPRITE_ROMS.map((rom) => set.data(rom))),
  map: set.data(CHASE_HQ_SPRITE_MAP_ROM),
});
