/**
 * TURBO OUTRUN's own constants and fixed rules, each with its reason
 * ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md#turbo-outruns-constants)): what its ROMs do not hold,
 * or hold only in its encrypted program, read from it decrypted locally. What they hold is read where it is used.
 */
import type { Mound } from '../shared/jump-mound.js';

/**
 * The 959 at GO, road units right of the car (0xC238 places it on the left road, 0xC28E, at the car's depth, 0xC27C
 * and 0x11D28, its x −0x80 at 0xC294 and 0xC29C): the instructions are encrypted, read from the program decrypted
 * locally ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md#turbo-outruns-programs)).
 */
export const RIVAL_X = -0x80;
/**
 * A dip ([Original road data](../../../docs/original-road-data.md#profile), Jumps and dips): K's, its 2 m face straight
 * down at 5 % to its bottom 0.1 m deep, back up in 2 m (K, 2026-10-26).
 */
export const DIP: Mound = Object.freeze({ face: 2, root: -0.05, crest: -0.05 });

/**
 * Collision class 2 throws the car (its handler at 0x742A, in the decrypted program alone): here a dip across the
 * road, not an object.
 */
export const DIP_CLASS = 2;
/** The strips that loop, by what they show, by size list (K, 2026-10-24): the fog (0x2603A) and the flower beds (0x2743A). */
export const LOOPING_STRIPS: ReadonlySet<number> = new Set([0x2603a, 0x2743a]);
/**
 * The far strip approaches at half the rate, so it stands still twice as far and twice as large as drawn, a pixel 4
 * road units: its edge 32 of its pixels from P as the original's is from the screen's middle, reaching away from it,
 * and its base point `farUp` road units up, as OUTRUN's clouds.
 */
export const FAR_UNITS = 4;
export const FAR_EDGE = 32;
/**
 * After the gate's post passes the car (tick T), the stage's end runs 11 steps from T + 2; the next stage begins at
 * T + 13. At a leg's last stage the car stops at T + 2. Both are the encrypted program's.
 */
export const END_STEPS = 11;
export const STOP = 2;
/** The layers change by a page flip at T + 11, within the stage's change: the encrypted program's (research notes). */
export const BACKGROUND_FLIP = 11;
/**
 * A stage's change, the encrypted program's ([TURBO OUTRUN's research notes](../../../docs/research/turbo-outrun.md),
 * Backgrounds): the stage's end's state 4 (M 0x10832), at T + 1 + 4 as its states run one a tick from T + 2, sets
 * $60BDC bit 0, which the background routine takes (M 0x1CDCA, M 0x1CF00), starting the sky and in its next state
 * the colors ($60C5B, M 0x1CF68). From the frame interrupt (M 0x103A) the road's 8 words and the ground's 16 fill in 2
 * frames and move in 128 (M 0x108E → 0x1800); from the main loop the sky's 64 colors take one a tick (M 0x157FA →
 * 0x15A10), the tick after them marking them ready, and the interrupt copies its 31 rows one every second frame
 * (M 0x108A → 0x1758). OUTRUN's code, so counted as OUTRUN's is (`readStageChangeFrames`).
 */
export const CHANGE_STATE = 4;
export const CHANGE_COLOR_FRAMES = 1 + 2 + 128;
export const CHANGE_SKY_STEPS = 64;
export const CHANGE_SKY_ROWS = 31;

/** The car's line (the word at 0x608BC): an object stands where its depth reaches it; the gates are judged there. */
export const CAR_LINE = 0x180;
/** An object vanishes at line 0x1FF, a strip at 0x1F8, freeing its slot. */
export const VANISHES = 0x1ff;
export const STRIP_VANISHES = 0x1f8;
/** Routines: the strips (0x0C to 0x24), the far strip that approaches at half the rate (0x24), the gate's judging post. */
export const STRIP_ROUTINES = [0x0c, 0x24] as const;
export const FAR_STRIP = 0x24;
export const GATE_POST = 0x28;
/**
 * The strips, by routine, as OUTRUN's families ([Strips and patches](../../../docs/outrun-road-data.md#strips-and-patches)):
 * strip A (0x0C to 0x14, the grass bank) VINEYARD's trees' family, its 9 sizes, the nearest last, size k the nearest
 * shrunk to k/8; strip B (0x18 to 0x20: waves, dunes, flower beds) OUTRUN's strips', its 16 sizes, the nearest last,
 * size k shrunk to (k + 1)/16; the far strip (0x24, fog) the clouds', its 9 sizes, the nearest last. Each shows its
 * nearest size by its edge nearest the road.
 */
export const STRIP_A = { from: 0x0c, to: 0x14, sizes: 9, nearest: 8 } as const;
export const STRIP_B = { from: 0x18, to: 0x20, sizes: 16, nearest: 15 } as const;
/**
 * Each strip routine's anchor down as it sets it, read from the program decrypted locally: 0x0C (0x6716) and 0x18
 * (0x6840) the bottom edge, 0x1C (0x685C, the waves, the dunes and the flower beds) the middle, the far strip 0x24
 * (0x6D82) the bottom edge. Across, a strip's is its left edge where its item's x ≥ 0, its right where x < 0 (after
 * `tst.w $22(a5)`), the far strip's by its mirroring: its left edge at −0x20 pixels, or mirrored its right at +0x20.
 */
export const STRIP_ANCHORS: ReadonlyMap<number, number> = new Map([
  [0x0c, 8],
  [0x18, 8],
  [0x1c, 0],
  [FAR_STRIP, 8],
]);
export const FAR = { sizes: 9, nearest: 8 };
/**
 * The routines drawing objects on the road: 0x08 (half scale: gravel, earth, snow, sand, puddles, pebbles; the grass and
 * stones) and the puddles that splash when hit (0x4C, 0x50). What they draw lies on the ground about its top edge, their
 * anchor (`ON_ROAD_ANCHOR`), but what the car hits as a standing thing (K, 2026-10-26). The anchor is the object's byte
 * 9 as the sprite list's builder at 0x118D8 places it (0x11A66: down 0 the middle, 4 the top edge, 8 the bottom edge;
 * across the middle), as each routine sets it, read from the program decrypted locally (K, 2026-10-25): 0x08's at
 * 0x6572, 0x4C's at 0x62A4, 0x50's at 0x63A8. What stands stands on its base point, the bottom edge, whatever its
 * routine's anchor.
 */
export const ON_ROAD = 0x08;
export const ON_ROAD_ROUTINES: readonly number[] = [ON_ROAD, 0x4c, 0x50];
export const ON_ROAD_ANCHOR = 4;
export const STANDING_ANCHOR = 8;
/** Routines whose picture is the first of a frame list, not their kind's: the walkers' (0x34, 0x38) and 0x60's. */
export const FRAME_LISTS: ReadonlyMap<number, number> = new Map([
  [0x34, 0x8a0e],
  [0x38, 0x8a0e],
  [0x60, 0x92e4],
]);
/** The girl (0x64) and her sign (0x68) of STAGE UP! and GOAL!, drawn over the screen. */
export const GIRL = 0x64;
export const SIGN = 0x68;
/**
 * The girl's frames: 8-byte entries {long size list, word, word}, 16 of them. She holds up her sign in the last, the
 * READY board's picture (0x27F8E), drawn 1:1 where an object drawn 1:1 stands (from line 254), a pixel 2 road units;
 * across, her item's x × 32 units from P, her sign's height its y × 2, her sign 0.1 m nearer, before her board.
 */
export const GIRL_FRAMES = 0x8fce;
export const GIRL_FRAME_COUNT = 16;
export const ONE_TO_ONE = 254;
/**
 * Collision classes 0 and 1 push the car aside and slow it, overturning it as they overlap (the player's handler table
 * at 0x728C, 0x7348): the objects of those standing on the ground have a body.
 */
export const SOLID = 1;
/** Classes 3 and 11 to 17 are thrown or broken when hit: they stand without a body until K decides how they show it. */
export const THROWN: readonly number[] = [3, 11, 12, 13, 14, 15, 16, 17];

/**
 * What the countdown's encrypted motion makes of a start figure's record by its last tick, the signal at GO: the
 * fields it changes (x and height in road units, its picture's size list, its palette), whether it is drawn mirrored
 * and its pixel (road units a pixel of its largest size spans), the values the stage's description took from the
 * original's program run on a 68000; and the figure's name.
 */
export interface StartMotion {
  readonly figure: string;
  readonly mirrored: boolean;
  readonly pixel: number;
  readonly x?: number;
  readonly height?: number;
  readonly sizes?: number;
  readonly palette?: number;
}
const moved = (
  figure: string,
  mirrored: boolean,
  pixel: number,
  changes: Omit<StartMotion, 'figure' | 'mirrored' | 'pixel'> = {},
): StartMotion => ({ figure, mirrored, pixel, ...changes });
/** The signal and the ready girls, alike at every leg's start but the second's. */
const SIGNAL = moved('signal', false, 2, { sizes: 0x27e30, palette: 0x16d });
const READY = [104, 149, 194, 244].map((x) => moved('ready girl', false, 1.333, { x }));
/** OKLAHOMA CITY's crowd's heights, each bobbing from its record's. */
const CROWD = [292, 280, 280, 280, 280, 284, 284, 288, 288, 288, 284];
/**
 * Each leg's start figures' motion, record by record (the routine at 0x5446 moves them; their records
 * `readStartFigures`).
 */
export const START_MOTION: readonly (readonly StartMotion[])[] = Object.freeze([
  [
    SIGNAL,
    READY[0]!,
    moved('flag waver', true, 1.232, { x: 176, sizes: 0x25fa4 }),
    moved('flag waver', true, 1.305, { x: 80, sizes: 0x25eaa }),
    moved('flag waver', true, 1.232, { x: 157, sizes: 0x25edc }),
  ],
  [
    moved('signal lights', false, 1.156, { palette: 0x094 }),
    READY[0]!,
    READY[1]!,
    moved("driver's head", true, 1.49, { x: -141 }),
    moved('open car', false, 2, { x: -141 }),
    moved('coupe', false, 2, { x: 119 }),
    moved('coupe', false, 2, { x: 328 }),
    moved('pickup', false, 2, { x: 243 }),
    moved('pickup', false, 2, { x: -11 }),
  ],
  [SIGNAL, READY[0]!, READY[1]!, READY[2]!],
  [
    SIGNAL,
    ...READY,
    moved('guitarist', false, 2, { height: 320, sizes: 0x2801a }),
    moved('man', true, 1, { x: -500, height: 286, sizes: 0x25edc }),
    moved('man', true, 1, { x: -486, height: 286, sizes: 0x25edc }),
    moved('man', true, 1, { x: -320, height: 286, sizes: 0x25e78 }),
    moved('man', false, 1, { x: 320, height: 286, sizes: 0x25eaa }),
    moved('girl', true, 1, { x: -200, height: 286, sizes: 0x27ef8 }),
    moved('girl', true, 1, { x: -232, height: 286, sizes: 0x27ec6 }),
    moved('girl', true, 1, { x: -264, height: 286, sizes: 0x27e94 }),
    moved('girl', true, 1, { x: -296, height: 286 }),
    ...CROWD.map((height) => moved('crowd', false, 2, { height })),
  ],
]);
/**
 * Each stage's palette patch, which the main CPU's encrypted code applies as the stage's background is loaded: its
 * {source, first palette, count}, the 8 words at `source` copied to `count` palettes from `first`. The stage's
 * description gives them; a stage's palettes are its leg's start's with the patches of the leg's stages to it applied
 * in turn.
 */
export const PALETTE_PATCHES: readonly (readonly (readonly [number, number, number])[])[] = Object.freeze([
  [
    [0x1dd62, 49, 1],
    [0x1dcc2, 47, 1],
    [0x1dcd2, 30, 1],
  ],
  [[0x1dc72, 67, 1]],
  [
    [0x1dbb2, 24, 3],
    [0x1dbf2, 53, 2],
    [0x1dc02, 8, 2],
    [0x1dc22, 27, 1],
  ],
  [
    [0x1da82, 10, 2],
    [0x1db62, 49, 1],
  ],
  [
    [0x1dd02, 30, 1],
    [0x1dd12, 47, 1],
    [0x1dd22, 59, 1],
    [0x1dd52, 60, 1],
  ],
  [],
  [
    [0x1db22, 48, 1],
    [0x1db32, 53, 2],
    [0x1db42, 8, 2],
  ],
  [
    [0x1da72, 59, 1],
    [0x1dba2, 16, 2],
  ],
  [
    [0x1dbc2, 35, 1],
    [0x1dbc2, 40, 1],
    [0x1dcb2, 31, 1],
  ],
  [
    [0x1dae2, 41, 2],
    [0x1db92, 55, 3],
  ],
  [
    [0x1daf2, 49, 2],
    [0x1db02, 41, 2],
  ],
  [[0x1dd32, 16, 2]],
  [[0x1dc42, 41, 2]],
  [
    [0x1daa2, 43, 1],
    [0x1daa2, 44, 1],
    [0x1dab2, 48, 1],
    [0x1dac2, 15, 1],
  ],
  [
    [0x1db12, 19, 1],
    [0x1db52, 48, 1],
  ],
  [
    [0x1db72, 30, 1],
    [0x1db82, 47, 1],
    [0x1dc92, 60, 1],
    [0x1dd42, 59, 1],
  ],
]);
/**
 * The car's lateral limit, the word the program adds at 0x16274 (`add.w $1ddf6.l, d0`). The instruction is encrypted
 * (FD1094), so its address is written here, read from the program decrypted locally (K, 2026-10-25); the word itself is
 * a plain table entry, read from the ROMs.
 */
export const LATERAL_LIMIT = 0x1ddf6;
/**
 * A tick's frames: the main loop's wait, two, set at 0xFE68 and counted down by the frame interrupt at 0x103E past 0, an
 * encrypted instruction read from its program decrypted locally (K, 2026-10-25).
 */
export const TICK_FRAMES = 2;
/** The road's material: the ROMs hold none, so K's (2026-10-25). */
export const ROAD_MATERIAL = 'ASPHALT';
/** The ground's material beyond the road: the ROMs hold none, so K's (2026-10-25). */
export const GROUND_MATERIAL = 'SAND';
