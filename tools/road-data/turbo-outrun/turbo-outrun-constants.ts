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
 * The girl as she holds up her sign: the READY board's picture (0x27F8E, of her frames at 0x8FCE), drawn 1:1, where an
 * object drawn 1:1 stands: from line 254, a pixel 2 road units; across, her item's x × 32 units from P, her sign's
 * height its y × 2, her sign 0.1 m nearer, before her board.
 */
export const HOLDING = 0x27f8e;
/** Her frames: 8-byte entries {long size list, word, word}, the READY board's among the first 16. */
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
 * A start figure as it stands still: its picture (a size list), palette, whether mirrored, x (road units from road 0's
 * centre), its height (road units, before the pixel aspect), its depth (a road line) and its pixel (road units a
 * pixel of its largest size spans).
 */
export interface StartFigure {
  readonly figure: string;
  readonly sizes: number;
  readonly palette: number;
  readonly mirrored: boolean;
  readonly x: number;
  readonly height: number;
  readonly line: number;
  readonly pixel: number;
}
const figure = (
  name: string,
  sizes: number,
  palette: number,
  mirrored: boolean,
  x: number,
  height: number,
  line: number,
  pixel: number,
): StartFigure => ({ figure: name, sizes, palette, mirrored, x, height, line, pixel });
/** OKLAHOMA CITY's crowd: {x, picture, height}, each in palette 0x0E8 at line 209, a pixel 2 units. */
const CROWD: readonly (readonly [number, number, number])[] = [
  [-64, 0x26d82, 292],
  [64, 0x26db4, 280],
  [-192, 0x26d82, 280],
  [192, 0x26db4, 280],
  [320, 0x26db4, 280],
  [-320, 0x26d82, 284],
  [0, 0x26d82, 284],
  [128, 0x26db4, 288],
  [-128, 0x26d82, 288],
  [256, 0x26d82, 288],
  [-256, 0x26db4, 284],
];
/**
 * The start figures of each leg (the routine at 0x5446 and its records at 0x7B66, 0x7F16, 0x82E6 and 0x85BE), each as
 * it stands in the countdown's last tick (state 0x0B), the signal as it shows GO. Their motion lies in the encrypted
 * code: these are the values the stage's description took from the original's program run on a 68000.
 */
export const START_FIGURES: readonly (readonly StartFigure[])[] = Object.freeze([
  [
    figure('signal', 0x27e30, 0x16d, false, -94, 228, 198, 2),
    figure('ready girl', 0x27f8e, 0x166, false, 104, 0, 384, 1.333),
    figure('flag waver', 0x25fa4, 0x15e, true, 176, 0, 370, 1.232),
    figure('flag waver', 0x25eaa, 0x15f, true, 80, 0, 380, 1.305),
    figure('flag waver', 0x25edc, 0x160, true, 157, 0, 370, 1.232),
  ],
  [
    figure('signal lights', 0x2659e, 0x094, false, -180, 0, 360, 1.156),
    figure('ready girl', 0x27f8e, 0x166, false, 104, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x179, false, 149, 0, 384, 1.333),
    figure("driver's head", 0x27c96, 0x075, true, -141, 325, 204, 1.49),
    figure('open car', 0x27cbe, 0x15c, false, -141, 290, 204, 2),
    figure('coupe', 0x27606, 0x162, false, 119, 310, 206, 2),
    figure('coupe', 0x27606, 0x163, false, 328, 310, 208, 2),
    figure('pickup', 0x275d4, 0x164, false, 243, 310, 206, 2),
    figure('pickup', 0x275d4, 0x165, false, -11, 310, 208, 2),
  ],
  [
    figure('signal', 0x27e30, 0x16d, false, -94, 188, 198, 2),
    figure('ready girl', 0x27f8e, 0x166, false, 104, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x179, false, 149, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x17a, false, 194, 0, 384, 1.333),
  ],
  [
    figure('signal', 0x27e30, 0x16d, false, -94, 196, 198, 2),
    figure('ready girl', 0x27f8e, 0x166, false, 104, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x179, false, 149, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x17b, false, 194, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x17a, false, 244, 0, 384, 1.333),
    figure('guitarist', 0x2801a, 0x171, false, -128, 320, 206, 2),
    figure('man', 0x25edc, 0x10f, true, -500, 286, 211, 1),
    figure('man', 0x25edc, 0x15e, true, -486, 286, 211, 1),
    figure('man', 0x25e78, 0x15f, true, -320, 286, 211, 1),
    figure('man', 0x25eaa, 0x160, false, 320, 286, 211, 1),
    figure('girl', 0x27ef8, 0x17b, true, -200, 286, 210, 1),
    figure('girl', 0x27ec6, 0x17a, true, -232, 286, 210, 1),
    figure('girl', 0x27e94, 0x179, true, -264, 286, 210, 1),
    figure('girl', 0x27e62, 0x166, true, -296, 286, 210, 1),
    ...CROWD.map(([x, sizes, height]) => figure('crowd', sizes, 0x0e8, false, x, height, 209, 2)),
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
