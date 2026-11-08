/**
 * POLE POSITION II's explosion ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#its-explosion)):
 * the player's car's, read from the second program, as this game's script of frames, its fireball's pictures, its
 * debris' pictures and rule, and their scales about the player's car, each found by the instructions that read it.
 */
import { formatSavedJson } from '../../../src/content/saved-json.js';
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { FRAMES_A_SECOND, PIXEL_ASPECT } from '../pole-position-hardware/display.js';
import { colorPalette, composeSprites, objectImage, objectPart } from './pole-position-ii-boards.js';
import { HIGH_UNITS } from './pole-position-ii-road.js';
import type { PolePositionII } from './pole-position-ii-rom.js';
import { readView } from './pole-position-ii-scenery.js';

/** A big sprite's pixels across, and a small one's. */
const BIG = 32;
const SMALL = 16;

/** The explosion script's file, among the originals' outputs. */
export const EXPLOSION_SCRIPT = 'explosions/polepos2-explosion.json';

/** A fireball picture's name: its picture and its size register. */
export const fireballName = (picture: number, size: number) => `polepos2-explosion-${picture}-${size}`;
/** A debris picture's name: its small sprite's code, two hex digits. */
export const debrisName = (code: number) => `polepos2-debris-${code.toString(16).padStart(2, '0')}`;

const signed = (v: number) => (v << 16) >> 16;
const shift = (v: number) => -signed(v);

/**
 * The player's car's depth and its road line and size as the second program draws it: its 0x0676 sets the depth
 * ($8C68) at the race's start, which its 0x0A86 puts on road line 0x6F − ⌊0x74 d / (d + 0x93)⌋ (`readView`), and its
 * 0x0B1C sizes ((line + 6) × 3 >> 3) − 1, a car's, which its 0x0B9E takes for the explosion's pictures 0 to 2.
 */
function readPlayerCar(p: PolePositionII) {
  const [depth] = instruction(
    p.second,
    0x0670,
    [0x4d05, 0x8c60, 0x8001, 0x4d05, 0x8c68, null],
    "the player's car's depth at the race's start",
  );
  const view = readView(p);
  const line = view.horizon - Math.floor((view.scale * depth!) / (depth! + view.behind));
  const [add, down] = instruction(
    p.second,
    0x0b1c,
    [0x0b01, 0x0070, 0xef0b, 0x0101, null, 0xa110, 0x8101, 0x8101, 0xb311, null, 0xab10],
    "a car's size, three times (line + 6) over 8",
  );
  const [carPictures, below] = instruction(
    p.second,
    0x0b9e,
    [0x6102, 0x8886, 0x0702, 0x000f, 0x0b02, null, null],
    "the explosion's size",
  );
  // `jr lt` to the car's size, its displacement in words from the next instruction.
  if (below! >> 8 !== 0xe1 || 0x0bac + 2 * ((below! << 24) >> 24) !== 0x0b1c)
    throw romDiffers("The explosion's first pictures are not sized as a car");
  return { depth: depth!, behind: view.behind, line, size: (((line + add!) * 3) >> shift(down!)) - 1, carPictures };
}

/** What a frame of the explosion draws: the vehicle as it stands, a fireball picture and size, or nothing. */
export type ExplosionFrame = 'vehicle' | { readonly picture: number; readonly size: number } | null;

/**
 * The explosion's script as the second program runs it (its 0x24CC, each frame while the player's car is of kind 4):
 * $8C7C counts the frames, and the byte at 0x5B10 + the count is, above 7, the picture to draw (its low 3 bits), hidden
 * where its bit 3 is set, at the size register (its byte shifted right 2, with bit 0 set); else a command by the table
 * at 0x252E: 0 hides it, 1 to 4 throw two pieces of debris, 5 clears the debris, 6 sets $81FE, 7 brings the car back.
 * Frame 0, the contact's, draws as frame 1 does (K's, 2026-11-08: the original's contacts leave $8C7E as it was).
 */
function readScript(p: PolePositionII, carPictures: number) {
  const [script, commands, down, table] = instruction(
    p.second,
    0x24f6,
    [
      0x6900,
      0x8c7c,
      0x6101,
      0x8c7c,
      0x6018,
      null,
      0x8c08,
      0x0b00,
      null,
      0xe20d,
      0xa080,
      0x0608,
      0x0f0f,
      0xb201,
      null,
      0x0400,
      0x0101,
      0x6f00,
      0x8c7e,
      0x4d05,
      0x8c60,
      0x8004,
      0x9e08,
      0xa102,
      0x8122,
      0x6122,
      null,
      0x1e28,
    ],
    "the explosion's script",
  );
  const handler = (k: number) => word(p.second, table! + 2 * k);
  instruction(p.second, handler(0), [0x4d05, 0x8c7e, 0x000f, 0x4d05, 0x8c60, 0x8004, 0x9e08], 'its command 0');
  const [debris] = instruction(p.second, handler(1), [0x2102, null], 'its command 1');
  for (let k = 2; k <= 4; k++) instruction(p.second, handler(k), [0x2102, debris! + 16 * (k - 1)], `its command ${k}`);
  instruction(
    p.second,
    handler(5),
    [0x4d05, 0x8c60, 0x0004, 0x2102, debris! + 14, 0x2101, 0x0008, 0x0d28, 0x0102, 0x0010, 0xf184, 0x9e08],
    'its command 5, the debris cleared',
  );
  instruction(p.second, handler(6), [0x4d05, 0x81fe, 0x0001, 0x9e08], 'its command 6');
  instruction(
    p.second,
    handler(7),
    [0x4d05, 0x8c60, 0x8001, 0x4d08, 0x825c, 0x4d08, 0x8218, 0x4d08, 0x821c, 0x9e08],
    'its command 7, the car back',
  );
  const frames: ExplosionFrame[] = [];
  const thrown: number[] = [];
  let [shown, cleared, signal, recovers]: [ExplosionFrame, number, number, number] = [null, -1, -1, -1];
  for (let n = 1; recovers < 0; n++) {
    if (n > 0xff) throw romDiffers("The explosion's script never brings the car back");
    const b = p.second[script! + n]!;
    if (b > commands!) {
      const picture = b & 7;
      shown = b & 8 ? null : picture < carPictures ? 'vehicle' : { picture, size: (b >> shift(down!)) | 1 };
    } else if (b === 0) shown = null;
    else if (b <= 4) thrown.push(n);
    else if (b === 5) cleared = n;
    else if (b === 6) signal = n;
    else recovers = n;
    if (recovers < 0) frames[n] = shown;
  }
  frames[0] = frames[1]!;
  if (thrown.length !== 4 || cleared < 0 || signal < 0) throw romDiffers("The explosion's script is not read whole");
  return { frames, thrown, cleared, signal, recovers, debris: debris! };
}

/**
 * The explosion's debris as the second program throws, moves and draws it: its 0x2598 throws two (the command's k − 1
 * and k + 3 of eight at `debris`, 16 bytes each: x, y and z each a place and a speed), from a random word each, a speed
 * the word shifted right 2 (x arithmetically; y logically, the second's bit 15 set first; z logically, 0x1000 added)
 * and a place the speed shifted right 9 more (z 10); its 0x102A moves each live one once a frame as it is drawn (a
 * step the speed shifted right 4, the speed less the step shifted right 1, z's 0xD0 more, a negative z place made
 * positive, the speed of pieces 0 and 3 of each four shifted right 2, its magnitude taken) and projects a place shifted
 * right 6 at depth y + 0x1BC; its 0x1146 draws each a small sprite of its code at 0x1176, in one color.
 */
function readDebris(p: PolePositionII, base: number) {
  const throws = instruction(
    p.second,
    0x2598,
    [
      0x4d25,
      0x000e,
      0x0001,
      0x5f00,
      0x004e,
      0xb309,
      null,
      0x6f20,
      0x0002,
      0xb309,
      null,
      0x2f20,
      0xa923,
      0x5f00,
      0x004e,
      0xb301,
      null,
      0x6f20,
      0x0002,
      0xb301,
      null,
      0x2f20,
      0xa923,
      0x5f00,
      0x004e,
      0xb301,
      null,
      0x0100,
      null,
      0x6f20,
      0x0002,
      0xb301,
      null,
      0x2f20,
      0x0102,
      0x0038,
      0x2104,
      0x0004,
      0x4d25,
      0x000e,
      0x0001,
      0x5f00,
      0x004e,
      0xb309,
      null,
      0x6f20,
      0x0002,
      0xb309,
      null,
      0x2f20,
      0xa923,
      0x5f00,
      0x004e,
      0xa50f,
      0xb309,
      null,
      0x6f20,
      0x0002,
      0xb309,
      null,
      0x2f20,
      0xa923,
      0x5f00,
      0x004e,
      0xb301,
      null,
      0x0100,
      null,
      0x6f20,
      0x0002,
      0xb301,
      null,
      0x2f20,
    ],
    "the explosion's debris thrown",
  );
  const [speed, place, ySpeed, yPlace, zSpeed, lift, upPlace, ...second] = throws;
  // The second piece is thrown as the first: its y's bit 15 set before the same shifts.
  const first = [speed, place, ySpeed, yPlace, zSpeed, lift, upPlace];
  if (second.some((v, k) => v !== first[k]) || speed !== ySpeed || speed !== zSpeed || place !== yPlace)
    throw romDiffers("The explosion's debris is not thrown alike on each axis and for both pieces");
  const moves = instruction(
    p.second,
    0x102a,
    [
      0x2109,
      base,
      0xa1c8,
      0x93fa,
      0x93fb,
      0x210b,
      null,
      0x210a,
      null,
      0x4d94,
      0x000e,
      0xe65b,
      0x1490,
      0xa113,
      0xb319,
      null,
      0x8110,
      0xb319,
      null,
      0x8313,
      0xa131,
      0x1d90,
      0xa103,
      0x5490,
      0x0004,
      0xa114,
      0xb319,
      null,
      0x8110,
      0xb319,
      null,
      0x8314,
      0xa141,
      0x5d90,
      0x0004,
      0xa104,
      0x5490,
      0x0008,
      0xa115,
      0xb319,
      null,
      0x8110,
      0xb319,
      null,
      0x8315,
      0xa151,
      0x0301,
      null,
      0x8d04,
      0xed08,
      0x8d02,
      0xa7a1,
      0xee02,
      0xb319,
      null,
      0x8d14,
      0xed01,
      0x8d12,
      0x5d90,
      0x0008,
      0xa105,
      0xb339,
      null,
      0xb349,
      null,
      0xb359,
      null,
      0x0104,
      null,
      0x2101,
      null,
      0x8d08,
      0x9b40,
      0x6f91,
      0x000c,
      0xa112,
      0x2101,
      0x0074,
      0x8351,
      0x1900,
      null,
      0x9b40,
      0x8d12,
      0x0101,
      0x0067,
      0x8161,
      0x8121,
      0x2f81,
      0x1902,
      null,
      0x9b42,
    ],
    "the explosion's debris moved and projected",
  );
  const [groups, each, s1, d1, s2, d2, s3, d3, gravity, bounce, u1, u2, u3, depth, size, scale, again] = moves;
  if (
    groups! * each! !== 8 ||
    s1 !== s2 ||
    s2 !== s3 ||
    d1 !== d2 ||
    d2 !== d3 ||
    u1 !== u2 ||
    u2 !== u3 ||
    again !== scale
  )
    throw romDiffers("The explosion's debris is not moved alike on each axis");
  const [codes, color] = instruction(
    p.second,
    0x1146,
    [0x2109, base + 12, 0xa1d8, 0x2107, null, 0x2105, groups, 0x2106, each, 0x2191, 0xa091, 0x2079, 0x2f81, null],
    "the explosion's debris drawn",
  );
  if (color! >> 8 !== 0xc9) throw romDiffers("The explosion's debris is not drawn in one color");
  return {
    codes: Array.from({ length: 8 }, (_, k) => p.second[codes! + k]!),
    color: color! & 0xff,
    rule: {
      speed: shift(speed!),
      place: shift(place!),
      upPlace: shift(upPlace!),
      lift: lift!,
      step: shift(s1!),
      drag: shift(d1!),
      gravity: gravity!,
      bounce: shift(bounce!),
      // Pieces 0 and 3 of each four: the countdown from 4 whose bit 1 is clear (0x1090's `bit r10,#1`).
      damped: Array.from({ length: 8 }, (_, k) => k).filter((k) => ((each! - (k % each!)) & 2) === 0),
      unit: shift(u1!),
    },
    projection: { depth: depth!, size: size!, scale: scale! },
  };
}

/**
 * The fireball's pictures as the second program's 0x1104 draws them: picture f, ($8886 & 7), two big sprites side by
 * side, codes 0x18 + 2f and the next, in one color where f is 3 or more; its 0x0FEE stands them on the car's road line
 * about its middle.
 */
function readFireball(p: PolePositionII) {
  const [first, below, color] = instruction(
    p.second,
    0x1104,
    [
      0x6100,
      0x8834,
      0xa507,
      0x6101,
      0x8886,
      0x0701,
      0x000f,
      0x0b01,
      0x0007,
      0xe201,
      0x8d08,
      0x0701,
      0x0007,
      0xa112,
      0x8111,
      0x0101,
      null,
      0xa080,
      0xa081,
      0xc800,
      0x0b02,
      null,
      0xe101,
      null,
    ],
    "the explosion's pictures",
  );
  if (color! >> 8 !== 0xc8) throw romDiffers("The explosion's fireball is not drawn in one color");
  instruction(
    p.second,
    0x0fee,
    [0x6101, 0x8824, 0x8d12, 0x0101, 0x0182, 0xa116, 0x4101, 0x8834, 0x6fc1, 0x0010, 0x6fc1, 0x0014],
    "the explosion's place, on the car's road line",
  );
  return { first: first!, from: below!, color: color! & 0xff };
}

/**
 * The player's car's explosion: its script, its pictures (each its name, picture and image) and its scales, metres,
 * a board's source pixel `pixelMetres` across, the car's `carShare` of it (its 0x0B1C beside a board's 0x0B6C), and an
 * interval of the clock `intervalMetres` long.
 */
export function polePositionIIExplosion(
  p: PolePositionII,
  pixelMetres: number,
  carShare: number,
  intervalMetres: number,
) {
  const car = readPlayerCar(p);
  const fire = readFireball(p);
  if (fire.from !== car.carPictures) throw romDiffers("The explosion's fireball and car pictures do not part alike");
  const script = readScript(p, car.carPictures);
  const debris = readDebris(p, script.debris);
  // The car's picture, 32 pixels of `carShare` a board's, is drawn its size + 1 rows on its road line: a screen pixel.
  const screen = (pixelMetres * carShare * BIG) / (car.size + 1);
  const { depth, size, scale } = debris.projection;
  const debrisSize = Math.floor(size / depth);
  const scales = {
    screenPixel: screen,
    // The debris' unit on the car's depth across and up, and along as the camera's distance from the car (0x93 + its
    // depth units, K, 2026-11-08) over the projection's depth.
    debris: {
      across: (screen * scale) / depth,
      up: (screen * PIXEL_ASPECT * scale) / depth,
      along: ((car.behind + car.depth) * intervalMetres) / HIGH_UNITS / depth,
    },
    debrisPixel: (screen * (debrisSize + 1)) / SMALL,
  };
  const pairs = new Map<string, { picture: number; size: number }>();
  for (const frame of script.frames)
    if (frame !== null && frame !== 'vehicle') pairs.set(fireballName(frame.picture, frame.size), frame);
  const pictures = [...pairs].map(([name, { picture, size: h }]) => {
    const sprites = [0, 1].map((k) => ({
      code: fire.first + 2 * picture + k,
      big: true,
      color: fire.color,
      x: BIG * k,
      y: BIG,
    }));
    const part = objectPart(composeSprites(p, sprites), () => true)!;
    if (part.bottom !== 0) throw romDiffers(`The explosion's picture ${picture} does not stand on its road line`);
    const pixel = (screen * (h + 1)) / BIG;
    return {
      picture,
      size: h,
      ...objectImage(name, part, [colorPalette(p, fire.color)], pixel, { anchor: BIG - part.left }),
    };
  });
  const codes = [...new Set(debris.codes)];
  const debrisPictures = codes.map((code) => {
    const sprite = { code, big: false, color: debris.color, x: 0, y: SMALL };
    const part = objectPart(composeSprites(p, [sprite]), () => true)!;
    return { code, ...objectImage(debrisName(code), part, [colorPalette(p, debris.color)], scales.debrisPixel) };
  });
  const document = {
    about:
      "POLE POSITION II's explosion of the player's car, read from its second program by `npm run road-data -- " +
      "pole-position-ii-course` (POLE POSITION II road data, Its explosion): each frame's drawing from the contact, " +
      'the frames a second, when the car is back, and its debris: when each two are thrown, when they are cleared, ' +
      "each piece's picture, a unit's metres and the original's rule in its integers.",
    framesASecond: FRAMES_A_SECOND,
    frames: script.frames.map((frame) =>
      frame === null || frame === 'vehicle' ? frame : fireballName(frame.picture, frame.size),
    ),
    recovers: script.recovers,
    debris: {
      thrown: script.thrown,
      cleared: script.cleared,
      pictures: debris.codes.map(debrisName),
      metres: scales.debris,
      rule: debris.rule,
    },
  };
  return {
    script: formatSavedJson(document),
    document,
    car,
    signal: script.signal,
    scales,
    pictures,
    debrisPictures,
  };
}
