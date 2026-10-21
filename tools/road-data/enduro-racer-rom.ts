import { requireInput } from '../course/authoring-io.js';
import { instruction, interleave } from './program-words.js';
import { spriteWords } from './sprite-pixels.js';
import type { ZipFile } from './zip.js';

/** A ROM by its name in MAME's set and its CRC-32: the tool finds it by the latter. */
interface Rom {
  readonly name: string;
  readonly crc: number;
}

/**
 * ENDURO RACER's ROMs ([Original road data](../../docs/original-road-data.md#enduro-racers-rom-set)). The main CPU's
 * program is MAME's `endurobl` (bootleg set 1), whose ROMs hold the YM2203 set's program decrypted: 0x00000–0x0FFFF
 * from two 64 KiB ROMs whose first halves hold the instructions and second halves the data, 0x10000–0x2FFFF from
 * pairs of 32 KiB ROMs that hold both. The sub CPU's program and the graphics are MAME's `enduror` (Rev A), which are
 * not encrypted. The program is never decrypted here.
 */
export const ENDURO_RACER_PROGRAM_ROMS = Object.freeze({
  main: [
    { even: { name: '7.13j', crc: 0xf1d6b4b7 }, odd: { name: '4.13h', crc: 0x43bff873 } },
    { even: { name: '8.14j', crc: 0x2153154a }, odd: { name: '5.14h', crc: 0x0a97992c } },
    { even: { name: '9.15j', crc: 0xdb3bff1c }, odd: { name: '6.15h', crc: 0x54b1885a } },
  ],
  sub: [{ even: { name: 'epr-7634a.ic54', crc: 0xaec83731 }, odd: { name: 'epr-7635a.ic67', crc: 0xb2fce96f } }],
} as const);
/** The road ROM: 256 lines of 512 pixels, two bit planes of 64 bytes a line, the second 0x4000 after the first. */
export const ENDURO_RACER_ROAD_ROM = Object.freeze({ name: 'epr-7633.ic1', crc: 0x6f146210 });
/** The tile ROMs: three bit planes, the lowest first, 8 bytes a tile. */
export const ENDURO_RACER_TILE_ROMS = Object.freeze([
  { name: 'epr-7644.ic31', crc: 0xe7a4ff90 },
  { name: 'epr-7645.ic46', crc: 0x4caa0095 },
  { name: 'epr-7646.ic60', crc: 0x7e432683 },
] as const);
/** The sprite ROMs: eight banks of four, each ROM one byte of a 32-bit word, the least significant first. */
export const ENDURO_RACER_SPRITE_ROMS = Object.freeze([
  [
    { name: 'epr-7678.ic36', crc: 0x9fb5e656 },
    { name: 'epr-7670.ic28', crc: 0xdbbe2f6e },
    { name: 'epr-7662.ic18', crc: 0xcb0c13c5 },
    { name: 'epr-7654.ic8', crc: 0x2db6520d },
  ],
  [
    { name: 'epr-7677.ic35', crc: 0x7764765b },
    { name: 'epr-7669.ic27', crc: 0xf9525faa },
    { name: 'epr-7661.ic17', crc: 0xfe93a79b },
    { name: 'epr-7653.ic7', crc: 0x46a52114 },
  ],
  [
    { name: 'epr-7676.ic34', crc: 0x2e42e0d4 },
    { name: 'epr-7668.ic26', crc: 0xe115ce33 },
    { name: 'epr-7660.ic16', crc: 0x86dfbb68 },
    { name: 'epr-7652.ic6', crc: 0x2880cfdb },
  ],
  [
    { name: 'epr-7675.ic33', crc: 0x05cd2d61 },
    { name: 'epr-7667.ic25', crc: 0x923bde9d },
    { name: 'epr-7659.ic15', crc: 0x629dc8ce },
    { name: 'epr-7651.ic5', crc: 0xd7902bad },
  ],
  [
    { name: 'epr-7674.ic32', crc: 0x1a129acf },
    { name: 'epr-7666.ic24', crc: 0x23697257 },
    { name: 'epr-7658.ic14', crc: 0x1677f24f },
    { name: 'epr-7650.ic4', crc: 0x642635ec },
  ],
  [
    { name: 'epr-7673.ic31', crc: 0x82602394 },
    { name: 'epr-7665.ic23', crc: 0x12d77607 },
    { name: 'epr-7657.ic13', crc: 0x8158839c },
    { name: 'epr-7649.ic3', crc: 0x4edba14c },
  ],
  [
    { name: 'epr-7672.ic30', crc: 0xd11452f7 },
    { name: 'epr-7664.ic22', crc: 0x0df2cfad },
    { name: 'epr-7656.ic12', crc: 0x6c741272 },
    { name: 'epr-7648.ic2', crc: 0x983ea830 },
  ],
  [
    { name: 'epr-7671.ic29', crc: 0xb0c7fdc6 },
    { name: 'epr-7663.ic21', crc: 0x2b0b8f08 },
    { name: 'epr-7655.ic11', crc: 0x3433fe7b },
    { name: 'epr-7647.ic1', crc: 0x2e7fbec0 },
  ],
] as const);

/** The main CPU's first 64 KiB ROMs: the first half of each holds the instructions, the second the data. */
const FIRST_MAIN_ROM_SIZE = 0x10000;
const ROM_SIZE = 0x8000;
/** The main CPU's program: 0x00000–0x2FFFF. */
const MAIN_SIZE = 0x30000;

/**
 * The instructions the main CPU's tables are found by, checked on its instructions' image ({address, words, what});
 * a `lea` names its table, PC-relative ones by their displacement.
 */
const MAIN_INSTRUCTIONS: readonly (readonly [number, readonly number[], string])[] = Object.freeze([
  [0x608c, [0xe140], "the road position's step, speed × 256 (asl.w #8, d0)"],
  [0x608e, [0xd1ae, 0x0188], "the road position's step added (add.l d0, $188(a6))"],
  [0x60ee, [0x2a3c, 0x0000, 0x00c0], "the bike's place ahead of the road position (move.l #$C0, d5)"],
  [0x5312, [0x41f9, 0x0000, 0x53ac], "the stages' ends (lea $53AC)"],
  [0xcc22, [0x41f9, 0x0000, 0xaea0], 'the scenery table (lea $AEA0)'],
  [0xcca8, [0x41f9, 0x0000, 0xc6a4], "the scenery types' table (lea $C6A4)"],
  [0xcc7a, [0x41fb, 0x200c], "the scaled items' x (lea $CC88(pc, d2.w))"],
  [0xce72, [0x41f9, 0x0000, 0xc8ae], "the jumps' table (lea $C8AE)"],
  [0xceca, [0x41f9, 0x0000, 0xca60], "the jumps' kinds (lea $CA60)"],
  [0xd8b2, [0x41fa, 0x0094], "the road's colors (lea $D948(pc))"],
  [0xd8a4, [0x41fb, 0x0072], "the ground's colors (lea $D918(pc, d0.w))"],
  [0xd882, [0x41fa, 0x007c], "the sky's top colors (lea $D900(pc))"],
  [0xd878, [0x41fa, 0x0062], "the sky's ramps (lea $D8DC(pc))"],
  [0xd7e8, [0x43fa, 0x0052], 'the water crossings (lea $D83C(pc))'],
  [0xd316, [0x41f9, 0x0000, 0xd668], 'the front background layers (lea $D668)'],
  [0xd38a, [0x41f9, 0x0000, 0xd67c], 'the back background layers (lea $D67C)'],
  [0xd05e, [0x41fa, 0x0092], "the back layers' vertical offsets (lea $D0F2(pc))"],
  [0x1c4e, [0x43f9, 0x0000, 0x9f08], "the sprites' palettes (lea $9F08)"],
  [0x1c36, [0x43f9, 0x0000, 0xaac8], "the tiles' first palettes (lea $AAC8)"],
  [0x1c66, [0x45f9, 0x0000, 0xab28], "the tiles' palette sources (lea $AB28)"],
  [0x1c76, [0x43f9, 0x0000, 0xaba0], "the tiles' palette words (lea $ABA0)"],
]);

const hex = (value: number) => value.toString(16).padStart(8, '0');

/** Every file of the zips, by CRC-32: the tool finds each ROM by its CRC, whatever the zip names it. */
export function filesByCrc(zips: readonly ReadonlyMap<string, ZipFile>[]): Map<number, ZipFile> {
  const files = new Map<number, ZipFile>();
  for (const zip of zips) for (const file of zip.values()) files.set(file.crc, file);
  return files;
}

/** A ROM of the set: present by its CRC-32 and `size` bytes. */
function romData(files: ReadonlyMap<number, ZipFile>, rom: Rom, size: number): Uint8Array {
  const file = files.get(rom.crc);
  requireInput(file, `/rom/${rom.name}`, `The ROM sets have no ${rom.name} (CRC ${hex(rom.crc)})`);
  requireInput(file.data.length === size, `/rom/${rom.name}`, `${rom.name} is ${file.data.length} bytes, not ${size}`);
  return file.data;
}

/** The two CPUs' programs as each CPU addresses them; the main CPU's as its data and as its instructions. */
export interface EnduroRacerPrograms {
  readonly main: Uint8Array;
  readonly mainInstructions: Uint8Array;
  readonly sub: Uint8Array;
}

/**
 * The main CPU's data and instructions images and the sub CPU's program, every ROM the conversion reads (programs,
 * road, tiles, sprites) found by its CRC-32 and size, and the instructions the tables are found by checked.
 */
export function assembleEnduroRacerPrograms(files: ReadonlyMap<number, ZipFile>): EnduroRacerPrograms {
  romData(files, ENDURO_RACER_ROAD_ROM, ROM_SIZE);
  for (const rom of ENDURO_RACER_TILE_ROMS) romData(files, rom, ROM_SIZE);
  for (const rom of ENDURO_RACER_SPRITE_ROMS.flat()) romData(files, rom, ROM_SIZE);
  const [first, ...rest] = ENDURO_RACER_PROGRAM_ROMS.main;
  const [even, odd] = [romData(files, first.even, FIRST_MAIN_ROM_SIZE), romData(files, first.odd, FIRST_MAIN_ROM_SIZE)];
  const image = (half: number) => {
    const out = new Uint8Array(MAIN_SIZE);
    out.set(interleave(even.subarray(half, half + ROM_SIZE), odd.subarray(half, half + ROM_SIZE)), 0);
    rest.forEach((pair, k) =>
      out.set(interleave(romData(files, pair.even, ROM_SIZE), romData(files, pair.odd, ROM_SIZE)), 0x10000 * (k + 1)),
    );
    return out;
  };
  const main = image(ROM_SIZE),
    mainInstructions = image(0);
  for (const [address, words, what] of MAIN_INSTRUCTIONS) instruction(mainInstructions, address, words, what);
  const [sub] = ENDURO_RACER_PROGRAM_ROMS.sub;
  return {
    main,
    mainInstructions,
    sub: interleave(romData(files, sub.even, ROM_SIZE), romData(files, sub.odd, ROM_SIZE)),
  };
}

/** Every ROM the tool reads, by its name in MAME's sets, with its CRC-32 as eight hex digits. */
export const enduroRacerRoms = (): Record<string, string> =>
  Object.fromEntries(
    [
      ...[...ENDURO_RACER_PROGRAM_ROMS.main, ...ENDURO_RACER_PROGRAM_ROMS.sub].flatMap(({ even, odd }) => [even, odd]),
      ENDURO_RACER_ROAD_ROM,
      ...ENDURO_RACER_TILE_ROMS,
      ...ENDURO_RACER_SPRITE_ROMS.flat(),
    ].map(({ name, crc }) => [name, hex(crc)]),
  );

/** The sprite ROMs' words (`spriteWords`), bank after bank, 0x8000 a bank. */
export function assembleEnduroRacerSprites(files: ReadonlyMap<number, ZipFile>): Uint32Array {
  const words = new Uint32Array(ENDURO_RACER_SPRITE_ROMS.length * ROM_SIZE);
  ENDURO_RACER_SPRITE_ROMS.forEach((bank, k) =>
    words.set(spriteWords(bank.map((rom) => romData(files, rom, ROM_SIZE))), k * ROM_SIZE),
  );
  return words;
}

/** The tile ROMs' bit planes, the lowest first, 8 bytes a tile. */
export const assembleEnduroRacerTiles = (files: ReadonlyMap<number, ZipFile>): readonly Uint8Array[] =>
  ENDURO_RACER_TILE_ROMS.map((rom) => romData(files, rom, ROM_SIZE));

/** The road ROM's bytes. */
export const enduroRacerRoadRom = (files: ReadonlyMap<number, ZipFile>) =>
  romData(files, ENDURO_RACER_ROAD_ROM, ROM_SIZE);
