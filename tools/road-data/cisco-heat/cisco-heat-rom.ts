/**
 * CISCO HEAT's ROM set ([CISCO HEAT road data](../../../docs/cisco-heat-road-data.md#its-rom-set)): MAME's `cischeat`,
 * its main program in two sets of ROMs at their addresses, its two road CPUs' programs and its tile planes' ROMs; every
 * ROM found by its CRC-32 and size.
 */
import { programImage } from '../cpu/program-words.js';
import type { Rom, RomSet, RomSource } from '../shared/rom-set.js';

/** Where CISCO HEAT's ROMs come from: MAME's `cischeat` ([Development](../../../docs/development.md#road-data-commands)). */
export const CISCO_HEAT_ROMS: RomSource = Object.freeze({ original: 'cisco-heat', sets: Object.freeze(['cischeat']) });

/** The main program's first set of ROMs: one pair of 256 KiB ROMs, its even and its odd bytes from 0. */
export const CISCO_HEAT_MAIN_ROMS = Object.freeze([
  {
    even: { name: 'ch9071v2.03', size: 0x40000, crc: 0xdd1bb26f },
    odd: { name: 'ch9071v2.01', size: 0x40000, crc: 0x7b65276a },
  },
] as const);

/** Its second set: one pair of 256 KiB ROMs, from 0x100000. */
export const CISCO_HEAT_MAIN_HIGH_ROMS = Object.freeze([
  {
    even: { name: 'ch9071.04', size: 0x40000, crc: 0x7fb48cbc },
    odd: { name: 'ch9071.02', size: 0x40000, crc: 0xa5d0f4dc },
  },
] as const);

/** Where the main CPU addresses its second set, and its ROM space's size. */
const HIGH_AT = 0x100000;
const MAIN_SPACE = 0x180000;

/** The main CPU's ROM space from the ROM set, as it addresses it: its first set from 0, its second from 0x100000. */
export function assembleCiscoHeatMain(set: RomSet): Uint8Array {
  const out = new Uint8Array(MAIN_SPACE);
  out.set(programImage(set, CISCO_HEAT_MAIN_ROMS), 0);
  out.set(programImage(set, CISCO_HEAT_MAIN_HIGH_ROMS), HIGH_AT);
  return out;
}

/** The road CPUs' programs: one pair of 256 KiB ROMs each, from 0; the first road CPU's, then the second's. */
export const CISCO_HEAT_ROAD_CPU_ROMS = Object.freeze([
  Object.freeze([
    {
      even: { name: 'ch9073.01', size: 0x40000, crc: 0xba331526 },
      odd: { name: 'ch9073.02', size: 0x40000, crc: 0xb45ff10f },
    },
  ] as const),
  Object.freeze([
    {
      even: { name: 'ch9073v1.03', size: 0x40000, crc: 0xbf1d1cbf },
      odd: { name: 'ch9073v1.04', size: 0x40000, crc: 0x1ec8a597 },
    },
  ] as const),
] as const);

/** Road CPU `cpu`'s (0 the first, 1 the second) program from the ROM set, as it addresses it. */
export const assembleCiscoHeatRoadCpu = (set: RomSet, cpu: 0 | 1): Uint8Array =>
  programImage(set, CISCO_HEAT_ROAD_CPU_ROMS[cpu]);

/** Each tile plane's ROM: plane 0's (the back), then plane 1's (the front). */
export const CISCO_HEAT_TILE_ROMS: readonly Rom[] = Object.freeze([
  { name: 'ch9071.a14', size: 0x40000, crc: 0x7a6d147f },
  { name: 'ch9071.t74', size: 0x40000, crc: 0x735a2e25 },
]);
