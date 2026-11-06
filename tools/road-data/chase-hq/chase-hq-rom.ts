import { programImage } from '../cpu/program-words.js';
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
