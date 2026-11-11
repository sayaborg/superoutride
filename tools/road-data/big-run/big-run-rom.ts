/**
 * BIG RUN's ROM set ([BIG RUN road data](../../../docs/big-run-road-data.md#its-rom-set)): MAME's `bigrun`, its main
 * program in two sets of ROMs at their addresses, its two road CPUs' programs, its tile planes' ROMs and its road ROMs;
 * every ROM found by its CRC-32 and size.
 */
import { programImage } from '../cpu/program-words.js';
import type { Rom, RomSet, RomSource } from '../shared/rom-set.js';

/** Where BIG RUN's ROMs come from: MAME's `bigrun` ([Development](../../../docs/development.md#road-data-commands)). */
export const BIG_RUN_ROMS: RomSource = Object.freeze({ original: 'big-run', sets: Object.freeze(['bigrun']) });

/** The main program's first set of ROMs: one pair of 256 KiB ROMs, its even and its odd bytes from 0. */
export const BIG_RUN_MAIN_ROMS = Object.freeze([
  {
    even: { name: 'br8950b.e1', size: 0x40000, crc: 0xbfb54a62 },
    odd: { name: 'br8950b.e2', size: 0x40000, crc: 0xc0483e81 },
  },
] as const);

/** Its second set: one pair of 128 KiB ROMs, from 0x100000. */
export const BIG_RUN_MAIN_HIGH_ROMS = Object.freeze([
  {
    even: { name: 'br8950b.3', size: 0x20000, crc: 0x864cebf7 },
    odd: { name: 'br8950b.4', size: 0x20000, crc: 0x702c2a6e },
  },
] as const);

/** Where the main CPU addresses its second set, and its ROM space's size. */
const HIGH_AT = 0x100000;
const MAIN_SPACE = 0x140000;

/** The main CPU's ROM space from the ROM set, as it addresses it: its first set from 0, its second from 0x100000. */
export function assembleBigRunMain(set: RomSet): Uint8Array {
  const out = new Uint8Array(MAIN_SPACE);
  out.set(programImage(set, BIG_RUN_MAIN_ROMS), 0);
  out.set(programImage(set, BIG_RUN_MAIN_HIGH_ROMS), HIGH_AT);
  return out;
}

/** The road CPUs' programs: one pair of 128 KiB ROMs each, from 0; the first road CPU's, then the second's. */
export const BIG_RUN_ROAD_CPU_ROMS = Object.freeze([
  Object.freeze([
    {
      even: { name: 'br8952a.19', size: 0x20000, crc: 0xfcf6b70c },
      odd: { name: 'br8952a.20', size: 0x20000, crc: 0xc43d367b },
    },
  ] as const),
  Object.freeze([
    {
      even: { name: 'br8952a.9', size: 0x20000, crc: 0xf803f0d9 },
      odd: { name: 'br8952a.10', size: 0x20000, crc: 0x8c0df287 },
    },
  ] as const),
] as const);

/** Road CPU `cpu`'s (0 the first, 1 the second) program from the ROM set, as it addresses it. */
export const assembleBigRunRoadCpu = (set: RomSet, cpu: 0 | 1): Uint8Array =>
  programImage(set, BIG_RUN_ROAD_CPU_ROMS[cpu]);

/** Each tile plane's ROMs, one after the other: plane 0's (the back), then plane 1's (the front). */
export const BIG_RUN_TILE_ROMS: readonly (readonly Rom[])[] = Object.freeze([
  Object.freeze([
    { name: 'br8950b.5', size: 0x20000, crc: 0x0530764e },
    { name: 'br8950b.6', size: 0x20000, crc: 0xcf40ecfa },
  ]),
  Object.freeze([
    { name: 'br8950b.7', size: 0x20000, crc: 0xbd5fd061 },
    { name: 'br8950b.8', size: 0x20000, crc: 0x7d66f418 },
  ]),
]);

/** The road ROMs, one after the other: 2,048 lines of 1,024 pixels, two road layers reading the same two. */
export const BIG_RUN_ROAD_ROMS: readonly Rom[] = Object.freeze([
  { name: 'mr88004g.t45', size: 0x80000, crc: 0xbb397bae },
  { name: 'mb88004h.t46', size: 0x80000, crc: 0x6b31a1ba },
]);

/** The sprites' ROMs: three pairs, each its even and odd bytes, one after the other. */
export const BIG_RUN_SPRITE_ROMS = Object.freeze([
  {
    even: { name: 'mr88004a.t41', size: 0x80000, crc: 0xc781d8c5 },
    odd: { name: 'mr88004d.t43', size: 0x80000, crc: 0xe4041208 },
  },
  {
    even: { name: 'mr88004b.t42', size: 0x80000, crc: 0x2df2e7b9 },
    odd: { name: 'mr88004e.t44', size: 0x80000, crc: 0x7af7fbf6 },
  },
  {
    even: { name: 'mb88004c.t48', size: 0x40000, crc: 0x02e2931d },
    odd: { name: 'mb88004f.t49', size: 0x40000, crc: 0x4f012dab },
  },
] as const);

/** The sprites' ROMs from the ROM set, as the sprite generator reads them. */
export const assembleBigRunSprites = (set: RomSet): Uint8Array => programImage(set, BIG_RUN_SPRITE_ROMS);

/** ROMs `roms` from the ROM set, one after the other. */
export function concatenated(set: RomSet, roms: readonly Rom[]): Uint8Array {
  const out = new Uint8Array(roms.reduce((n, r) => n + r.size, 0));
  let at = 0;
  for (const rom of roms) {
    out.set(set.data(rom), at);
    at += rom.size;
  }
  return out;
}

/** Every ROM BIG RUN's conversion reads, for its dump's record. */
export const BIG_RUN_READ_ROMS: readonly Rom[] = Object.freeze([
  ...[BIG_RUN_MAIN_ROMS, BIG_RUN_MAIN_HIGH_ROMS, ...BIG_RUN_ROAD_CPU_ROMS, BIG_RUN_SPRITE_ROMS].flatMap((pairs) =>
    pairs.flatMap((p) => [p.even, p.odd]),
  ),
  ...BIG_RUN_TILE_ROMS.flat(),
  ...BIG_RUN_ROAD_ROMS,
]);
