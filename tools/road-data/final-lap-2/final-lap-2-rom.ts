/**
 * FINAL LAP 2's ROMs ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-rom-set)): where they
 * come from, which make its master's and slave's programs and its data, its road's color PROM and its settings' default.
 */
import { interleave } from '../cpu/program-words.js';
import type { RomSet, RomSource } from '../shared/rom-set.js';

/** Where FINAL LAP 2's ROMs come from: MAME's `finalap2` ([Development](../../../docs/development.md#road-data-commands)). */
export const FINAL_LAP_2_ROMS: RomSource = Object.freeze({
  original: 'final-lap-2',
  sets: Object.freeze(['finalap2']),
});

/** The programs and the data: each a pair of ROMs of its words' even (high) and odd (low) bytes. */
export const FINAL_LAP_2_PROGRAM_ROMS = Object.freeze({
  master: {
    even: { name: 'fls2_mp0b.11d', size: 0x20000, crc: 0x97b48aae },
    odd: { name: 'fls2_mp1b.13d', size: 0x20000, crc: 0xc9f3e0e7 },
  },
  slave: {
    even: { name: 'fls1_sp0b.11k', size: 0x20000, crc: 0x8bf15d9c },
    odd: { name: 'fls1_sp1b.13k', size: 0x20000, crc: 0xc1a31086 },
  },
  data: {
    even: { name: 'fls2dat0.13s', size: 0x40000, crc: 0xf1af432c },
    odd: { name: 'fls2dat1.13p', size: 0x40000, crc: 0x8719533e },
  },
} as const);
/** The road's color PROM, and the settings' default, MAME's NVRAM. */
export const FINAL_LAP_2_ROAD_COLORS = Object.freeze({ name: 'fl1-3.5b', size: 0x100, crc: 0xd179d99a });
export const FINAL_LAP_2_SETTINGS = Object.freeze({ name: 'finalap2.nv', size: 0x2000, crc: 0xc7ae5d0a });

/** Every ROM the conversion reads, in its order. */
export const FINAL_LAP_2_READ_ROMS = Object.freeze([
  ...Object.values(FINAL_LAP_2_PROGRAM_ROMS).flatMap((p) => [p.even, p.odd]),
  FINAL_LAP_2_ROAD_COLORS,
  FINAL_LAP_2_SETTINGS,
]);

/** Where the data ROMs lie in the programs' address space. */
export const DATA_BASE = 0x200000;

/** The master's and slave's programs, the data, the road's color PROM and the settings, from the ROM set. */
export function assembleFinalLap2(set: RomSet) {
  const pair = (p: { readonly even: Parameters<RomSet['data']>[0]; readonly odd: Parameters<RomSet['data']>[0] }) =>
    interleave(set.data(p.even), set.data(p.odd));
  const roms = FINAL_LAP_2_PROGRAM_ROMS;
  return {
    master: pair(roms.master),
    slave: pair(roms.slave),
    data: pair(roms.data),
    roadColors: set.data(FINAL_LAP_2_ROAD_COLORS),
    settings: set.data(FINAL_LAP_2_SETTINGS),
  };
}
export type FinalLap2 = ReturnType<typeof assembleFinalLap2>;
