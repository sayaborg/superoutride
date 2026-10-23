/**
 * An original's ROM set as the road data tool reads it
 * ([Rules of the originals](../../docs/original-road-data.md#rules-of-the-originals)): each ROM of MAME's list found
 * in the set's zips by its CRC-32 and size, whatever a zip names it.
 */
import { requireInput } from '../course/authoring-io.js';
import type { ZipFile } from './zip.js';

/** A ROM of MAME's list for a set: its name there, its size in bytes and its CRC-32. */
export interface Rom {
  readonly name: string;
  readonly size: number;
  readonly crc: number;
}

const hex = (value: number) => value.toString(16).padStart(8, '0');
const key = (crc: number, size: number) => `${hex(crc)}:${size}`;

/** The ROMs of MAME's set `name` in one or more zips, each found by its CRC-32 and size. */
export class RomSet {
  private readonly files = new Map<string, Uint8Array>();

  constructor(
    readonly name: string,
    zips: readonly ReadonlyMap<string, ZipFile>[],
  ) {
    for (const zip of zips) for (const file of zip.values()) this.files.set(key(file.crc, file.data.length), file.data);
  }

  /** The ROM's bytes; a set without it is refused, naming the set and the ROM. */
  data(rom: Rom): Uint8Array {
    const data = this.files.get(key(rom.crc, rom.size));
    requireInput(
      data,
      `/rom/${rom.name}`,
      `The ROM set has no ${rom.name} of MAME ${this.name} (CRC ${hex(rom.crc)}, ${rom.size} bytes)`,
    );
    return data;
  }
}

/** The dump's record of the ROMs read: each one's name with its CRC-32 as eight hex digits, in their order. */
export const romRecords = (roms: readonly Rom[]): Record<string, string> =>
  Object.fromEntries(roms.map(({ name, crc }) => [name, hex(crc)]));
