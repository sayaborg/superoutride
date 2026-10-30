/**
 * Where TURBO OUTRUN's objects stand on its course and what they show
 * ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md#turbo-outruns-objects)): each object the scenery model stands
 * (`turboOutrunObjects`), the start objects where their lines lie (`lineAhead`), the start figures, and
 * the girls who hold up STAGE UP! and GOAL!, each across from P by the rule its routine follows, with its picture, its
 * height and, where the original tests a hit and it stands on the ground, a body.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { long } from '../sega-16/program-words.js';
import type { Quadratic } from '../shared/quadratic.js';
import type { BoardClock } from '../out-run-board/clock.js';
import { farUp } from '../out-run-board/hills.js';
import { PIXEL_ASPECT, UNIT_METRES } from '../shared/pixel-grid.js';
import { floats } from '../shared/sprite-rules.js';
import { type PictureUse } from './turbo-outrun-boards.js';
import { readConstants, readKind } from './turbo-outrun-road.js';
import { standsFrom, type StageRun, type StandingObject } from './turbo-outrun-scenery.js';
import { START_FIGURES } from './turbo-outrun-start.js';
import { stripFractions } from '../out-run-board/strips.js';
import { DIP_CLASS, FAR_EDGE, FAR_UNITS, LOOPING_STRIPS } from './turbo-outrun-constants.js';

/**
 * The strips, by routine, as OUTRUN's families ([Strips and patches](../../../docs/outrun-road-data.md#strips-and-patches)):
 * strip A (0x0C to 0x14, the grass bank) VINEYARD's trees' family, its 9 sizes, the nearest last, size k the nearest
 * shrunk to k/8; strip B (0x18 to 0x20: waves, dunes, flower beds) OUTRUN's strips', its 16 sizes, the nearest last,
 * size k shrunk to (k + 1)/16; the far strip (0x24, fog) the clouds', its 9 sizes, the nearest last. Each shows its
 * nearest size by its edge nearest the road.
 */
const STRIP_A = { from: 0x0c, to: 0x14, sizes: 9, nearest: 8 } as const;
const STRIP_B = { from: 0x18, to: 0x20, sizes: 16, nearest: 15 } as const;
const FAR_STRIP = 0x24;
/**
 * Each strip routine's anchor down as it sets it, read from the program decrypted locally: 0x0C (0x6716) and 0x18
 * (0x6840) the bottom edge, 0x1C (0x685C, the waves, the dunes and the flower beds) the middle, the far strip 0x24
 * (0x6D82) the bottom edge. Across, a strip's is its left edge where its item's x ≥ 0, its right where x < 0 (after
 * `tst.w $22(a5)`), the far strip's by its mirroring: its left edge at −0x20 pixels, or mirrored its right at +0x20.
 */
const STRIP_ANCHORS: ReadonlyMap<number, number> = new Map([
  [0x0c, 8],
  [0x18, 8],
  [0x1c, 0],
  [FAR_STRIP, 8],
]);
const FAR = { sizes: 9, nearest: 8 };
/**
 * The routines drawing objects on the road: 0x08 (half scale: gravel, earth, snow, sand, puddles, pebbles; the grass and
 * stones) and the puddles that splash when hit (0x4C, 0x50). What they draw lies on the ground about its top edge, their
 * anchor (`ON_ROAD_ANCHOR`), but what the car hits as a standing thing (K, 2026-10-26). The anchor is the object's byte
 * 9 as the sprite list's builder at 0x118D8 places it (0x11A66: down 0 the middle, 4 the top edge, 8 the bottom edge;
 * across the middle), as each routine sets it, read from the program decrypted locally (K, 2026-10-25): 0x08's at
 * 0x6572, 0x4C's at 0x62A4, 0x50's at 0x63A8. What stands stands on its base point, the bottom edge, whatever its
 * routine's anchor.
 */
const ON_ROAD = 0x08;
const ON_ROAD_ROUTINES: readonly number[] = [ON_ROAD, 0x4c, 0x50];
const ON_ROAD_ANCHOR = 4;
const STANDING_ANCHOR = 8;
/** Routines whose picture is the first of a frame list, not their kind's: the walkers' (0x34, 0x38) and 0x60's. */
const FRAME_LISTS: ReadonlyMap<number, number> = new Map([
  [0x34, 0x8a0e],
  [0x38, 0x8a0e],
  [0x60, 0x92e4],
]);
/** The girl (0x64) and her sign (0x68) of STAGE UP! and GOAL!, drawn over the screen. */
const GIRL = 0x64;
const SIGN = 0x68;
/**
 * The girl as she holds up her sign: the READY board's picture (0x27F8E, of her frames at 0x8FCE), drawn 1:1, where an
 * object drawn 1:1 stands: from line 254, a pixel 2 road units; across, her item's x × 32 units from P, her sign's
 * height its y × 2, her sign 0.1 m nearer, before her board.
 */
const HOLDING = 0x27f8e;
/** Her frames: 8-byte entries {long size list, word, word}, the READY board's among the first 16. */
const GIRL_FRAMES = 0x8fce;
const GIRL_FRAME_COUNT = 16;
const ONE_TO_ONE = 254;
/**
 * Collision classes 0 and 1 push the car aside and slow it, overturning it as they overlap (the player's handler table
 * at 0x728C, 0x7348): the objects of those standing on the ground have a body.
 */
const SOLID = 1;
/** Classes 3 and 11 to 17 are thrown or broken when hit: they stand without a body until K decides how they show it. */
const THROWN: readonly number[] = [3, 11, 12, 13, 14, 15, 16, 17];

/** Whether the scenery model's object `o` is a dip. */
export const isDip = (main: Uint8Array, o: StandingObject) => readKind(main, o.item.kind).collision === DIP_CLASS;

/**
 * An object placed on the course: its course position, metres right of P, metres up, its picture, and its body's width
 * by its hit extents (at most its picture's, which the course takes); and whether it lies on the ground.
 */
export interface PlacedObject {
  readonly g: number;
  readonly x: number;
  readonly height: number;
  readonly use: PictureUse;
  readonly body: number | null;
  readonly lies?: true;
}

/** What the placing reports. */
export interface PlacingReport {
  readonly placed: number;
  readonly start: { readonly passing: number; readonly sized: number };
  readonly figures: number;
  readonly girls: number;
  readonly bodies: number;
  /** Objects of classes 3 and 11 to 17 (thrown or broken when hit), passed through: by class, how many. */
  readonly breakable: Readonly<Record<string, number>>;
  /** The strips' pieces and the far strips', and the items below the road (never seen). */
  readonly strips: number;
  readonly farStrips: number;
  /** What lies on the ground: by size list and material, how many. */
  readonly lying: Readonly<Record<string, number>>;
  readonly below: number;
}

/**
 * The objects on leg `leg`'s course: `objects` from the scenery model, each stage's from its course position
 * `start(stage)`, by the road width `width` (units, by course position), which their laterals follow, and the
 * original's (`originalWidth`, straight between its points), by which the roads are apart for one as it comes out;
 * with the leg's start figures and the runs' stops.
 */
export function turboOutrunPlacements(
  main: Uint8Array,
  inputs: {
    readonly objects: readonly StandingObject[];
    readonly runs: readonly StageRun[];
    readonly leg: number;
    readonly start: (stage: number) => number;
    readonly width: Quadratic;
    readonly originalWidth: Quadratic;
    /** The road positions ahead of the car at which an object standing at a line stands (`lineAhead`). */
    readonly ahead: (line: number) => number;
    readonly clock: BoardClock;
  },
): { placed: PlacedObject[]; report: PlacingReport } {
  const { width } = inputs;
  const { rightFromLeftWidth } = readConstants(main);
  const placed: PlacedObject[] = [];
  const start = { passing: 0, sized: 0 };
  const breakable: Record<string, number> = {};
  let strips = 0,
    farStrips = 0,
    below = 0,
    girls = 0,
    bodies = 0;
  const units = (u: number) => u * UNIT_METRES;
  const { clock } = inputs;
  const holdingLead = standsFrom(main, ONE_TO_ONE, clock);
  if (!Array.from({ length: GIRL_FRAME_COUNT }, (_, k) => long(main, GIRL_FRAMES + 8 * k)).includes(HOLDING))
    throw romDiffers("The girls' frames at 0x8FCE do not hold the READY board's picture");

  for (const o of inputs.objects) {
    const kind = readKind(main, o.item.kind);
    const strip = [STRIP_A, STRIP_B].find((f) => kind.routine >= f.from && kind.routine <= f.to);
    if (strip || kind.routine === FAR_STRIP) {
      placed.push(stripPiece(o, kind, strip, inputs));
      if (strip) strips++;
      else farStrips++;
      continue;
    }
    if (o.item.y < 0) {
      below++;
      continue;
    }
    const half = (kind.flags & 1) !== 0;
    const pixel = half ? 1 : 2;
    const mirrored = (o.item.flags & 1) !== 0;
    const sizes =
      kind.routine === GIRL
        ? HOLDING
        : FRAME_LISTS.has(kind.routine)
          ? long(main, FRAME_LISTS.get(kind.routine)!)
          : kind.sizes;
    // Where it stands: a start object where it passes the car or where its line lies ahead of the car, the nearer; a
    // girl or her sign where an object drawn 1:1 stands after her leg's car stops; any other where it passes the car.
    let stage = o.stage,
      position = o.position;
    if (o.line !== null) {
      const sized = inputs.ahead(o.line);
      start[position <= sized ? 'passing' : 'sized']++;
      position = Math.min(position, sized);
    }
    const holding = kind.routine === GIRL || kind.routine === SIGN;
    if (holding) {
      stage = o.from.stage;
      position = inputs.runs.find((r) => r.stage === stage)!.end + holdingLead;
      if (kind.routine === GIRL) girls++;
    }
    const g = inputs.start(stage) + position;
    // Across, units from P: a girl's and her sign's x × 32; an item marked by b7 from P; else left from road 0's centre,
    // right from road 1's, but from road 0's where the roads were wider apart than 280 as it came out.
    const w = width.at(g);
    const apart = inputs.originalWidth.at(inputs.start(o.from.stage) + o.from.position) > rightFromLeftWidth;
    const fromP = !(o.item.flags & 2) && o.item.b7 !== 0;
    const x = holding ? 32 * o.item.x : 16 * o.item.x + (fromP ? 0 : o.item.x < 0 || apart ? -w : w);
    // What the routines drawing on the road (0x08, 0x4C, 0x50) put there lies about their anchor, the top edge, but
    // what the original's car hits as it does a standing thing (classes 0 and 1: the grass and stones 0x27570), which
    // stands on its base point (K, 2026-10-26).
    const lies = ON_ROAD_ROUTINES.includes(kind.routine) && kind.collision > SOLID;
    const anchor = lies ? ON_ROAD_ANCHOR : STANDING_ANCHOR;
    // A body where the original's hit pushes the car aside and the object stands on the ground, as wide as its hit
    // extents (a pixel 2 units, half scale 1).
    const hits = !lies && kind.collision <= SOLID && o.item.y === 0 && kind.hit[1] > kind.hit[0];
    const aside = ((mirrored ? -1 : 1) * (kind.hit[0] + kind.hit[1]) * pixel) / 2;
    // What lies on the ground lies at its height 0.
    const height = lies ? 0 : holding ? 2 * o.item.y : half ? o.item.y / 2 : o.item.y;
    const use: PictureUse = {
      sizes,
      units: pixel,
      mirrored,
      palette: kind.palette,
      shadow: (kind.flags & 2) !== 0,
      // Drawn with shadows allowed where its kind shades and it stands.
      shades: (kind.flags & 4) !== 0 && !floats(height, pixel),
      anchor,
      aside,
      lies,
    };
    const body = hits ? units((kind.hit[1] - kind.hit[0]) * pixel) : null;
    if (body !== null) bodies++;
    if (THROWN.includes(kind.collision)) breakable[kind.collision] = (breakable[kind.collision] ?? 0) + 1;
    placed.push({
      g,
      x: units(x + aside),
      height: units(height) * PIXEL_ASPECT,
      use,
      body,
      ...(lies ? { lies: true as const } : {}),
    });
  }

  // The leg's start figures, at its first stage, where each passes the car or where its line lies, the nearer.
  let figures = 0;
  {
    const stage = 4 * inputs.leg;
    for (const f of START_FIGURES[inputs.leg]!) {
      const sized = inputs.ahead(f.line);
      const position = Math.min(standsFrom(main, f.line, clock), sized);
      const g = inputs.start(stage) + position;
      placed.push({
        g,
        x: units(f.x - width.at(g)),
        height: units(f.height) * PIXEL_ASPECT,
        use: {
          sizes: f.sizes,
          units: f.pixel,
          mirrored: f.mirrored,
          palette: f.palette,
          shadow: false,
          shades: false,
          anchor: 8,
          aside: 0,
        },
        body: null,
      });
      figures++;
    }
  }
  return {
    placed,
    report: {
      placed: placed.length,
      start,
      figures,
      girls,
      bodies,
      breakable,
      strips,
      farStrips,
      lying: placed.reduce<Record<string, number>>((counts, o) => {
        const key = o.lies && o.use.sizes.toString(16);
        if (key) counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
      below,
    },
  };
}

/**
 * A strip where it stands: strip A's and B's edge nearest the road at its x × 16 units from road 0's centre (x < 0, drawn
 * mirrored on the left) or road 1's, at its y; the far strip's by P, its x unused. Each is anchored as its routine sets
 * it (`STRIP_ANCHORS`) and reaches away from the road, on the ground but the far strip, as K's table has it meet it.
 */
function stripPiece(
  o: StandingObject,
  kind: ReturnType<typeof readKind>,
  strip: typeof STRIP_A | typeof STRIP_B | undefined,
  inputs: { readonly start: (stage: number) => number; readonly width: Quadratic; readonly clock: BoardClock },
): PlacedObject {
  const mirrored = (o.item.flags & 1) !== 0;
  const g = inputs.start(o.stage) + o.position;
  const down = STRIP_ANCHORS.get(kind.routine);
  if (down === undefined) throw romDiffers(`Strip routine 0x${kind.routine.toString(16)} has no anchor read`);
  const right = strip ? o.item.x < 0 : mirrored;
  const use: PictureUse = {
    sizes: kind.sizes,
    units: strip ? 2 : FAR_UNITS,
    mirrored,
    palette: kind.palette,
    shadow: false,
    shades: (kind.flags & 4) !== 0,
    anchor: down | (right ? 2 : 1),
    aside: 0,
    strip: {
      sizes: (strip ?? FAR).sizes,
      nearest: (strip ?? FAR).nearest,
      ...(LOOPING_STRIPS.has(kind.sizes) ? { loops: true as const } : { fractions: stripFractions(strip!.sizes) }),
    },
  };
  const w = inputs.width.at(g);
  const edge = strip ? 16 * o.item.x + (o.item.x < 0 ? -w : w) : (mirrored ? 1 : -1) * FAR_EDGE * FAR_UNITS;
  const height = (strip ? o.item.y : farUp(inputs.clock)) * UNIT_METRES * PIXEL_ASPECT;
  return { g, x: edge * UNIT_METRES, height, use, body: null };
}
