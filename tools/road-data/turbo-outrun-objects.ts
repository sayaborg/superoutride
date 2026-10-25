/**
 * Where TURBO OUTRUN's objects stand on its course and what they show
 * ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md#turbo-outruns-objects)): each object the scenery model stands
 * (`turboOutrunObjects`), the start objects where they look as large as the original draws them, the start figures, and
 * the girls who hold up STAGE UP! and GOAL!, each across from P by the rule its routine follows, with its picture, its
 * height and, where the original tests a hit and it stands on the ground, a body.
 */
import { long } from './program-words.js';
import type { Quadratic } from './quadratic.js';
import { POSITION_METRES } from './hills.js';
import { startDepth } from './object-approach.js';
import { PIXEL_ASPECT, UNIT_METRES } from './pixel-grid.js';
import { type PictureUse } from './turbo-outrun-boards.js';
import { readConstants, readKind } from './turbo-outrun-road.js';
import { CAR_LINE, passedPositions, standsFrom, type StageRun, type StandingObject } from './turbo-outrun-scenery.js';
import { START_FIGURES } from './turbo-outrun-start.js';

/**
 * The strips, by routine, as OUTRUN's families ([Strips and patches](../../docs/outrun-road-data.md#strips-and-patches)):
 * strip A (0x0C to 0x14, the grass bank) VINEYARD's trees' family, its 9 sizes, the nearest last; strip B (0x18 to
 * 0x20: waves, dunes, flower beds) OUTRUN's strips', its 16 sizes, the nearest last; the far strip (0x24, fog) the
 * clouds', its 9 sizes, the nearest last. Each shows its nearest size by its edge nearest the road.
 */
const STRIP_A = { from: 0x0c, to: 0x14, sizes: 9, nearest: 8 };
const STRIP_B = { from: 0x18, to: 0x20, sizes: 16, nearest: 15 };
const FAR_STRIP = 0x24;
/**
 * What lies on the ground, by size list, a board by its middle: strip B's waves (0x2725A) and dunes (0x272FA), the
 * puddles (0x274DA), the pebbles (0x27840) and the patches (0x27872). A lying picture has no material: the road's
 * Strips alone decide it (K, 2026-10-25).
 */
const LYING: ReadonlySet<number> = new Set([0x2725a, 0x272fa, 0x274da, 0x27840, 0x27872]);
/** The objects on the road that rise from it, standing on their bottom: the grass and stones. */
const RISING_ON_ROAD = 0x27570;
const FAR = { sizes: 9, nearest: 8 };
/**
 * The far strip approaches at half the rate, so it stands still twice as far and twice as large as drawn, a pixel 4
 * road units: its edge 32 of its pixels from P as the original's is from the screen's middle, reaching away from it,
 * and its base point (2 × 151 + 72) road units up (twice its row above the eye, and the eye), as OUTRUN's clouds.
 */
const FAR_UNITS = 4;
const FAR_EDGE = 32;
const FAR_UP = 2 * 151 + 72;
/**
 * The routines drawing objects on the road: 0x08 (half scale: gravel, earth, snow, sand, puddles, pebbles; the grass and
 * stones) and the puddles that splash when hit (0x4C, 0x50). Each lies on the ground but the grass and stones.
 */
const ON_ROAD = 0x08;
const ON_ROAD_ROUTINES: readonly number[] = [ON_ROAD, 0x4c, 0x50];
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
const SIGN_NEARER = 0.1;
/** Collision classes 0, 1 and 3 stop or spin the car: the objects of those standing on the ground have a body. */
const SOLID = 3;
/**
 * Collision class 2 throws the car (its handler at 0x742A, in the decrypted program alone): here a dip across the
 * road, not an object. An object hits while its line is within 0x64 of the car's (0x6F20, in the decrypted program
 * alone): the hump's length is the road the car passes while it does.
 */
export const DIP = 2;
const HIT_LINES = 0x64;

/** Whether the scenery model's object `o` is a dip. */
export const isDip = (main: Uint8Array, o: StandingObject) => readKind(main, o.item.kind).collision === DIP;

/** A hump's length at `kmh`, positions: the road the car passes at that speed while its object's line hits. */
export const humpLength = (main: Uint8Array, kmh: number) => passedPositions(main, CAR_LINE - HIT_LINES, CAR_LINE, kmh);

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
  /** Objects of classes 11 to 17 (thrown or broken when hit), passed through: by class, how many. */
  readonly breakable: Readonly<Record<string, number>>;
  /** The strips' pieces and the far strips', and the items below the road (never seen). */
  readonly strips: number;
  readonly farStrips: number;
  /** What lies on the ground: by size list and material, how many. */
  readonly lying: Readonly<Record<string, number>>;
  readonly below: number;
}

/**
 * The objects on the course: `objects` from the scenery model, each stage's from its course position `start(stage)`,
 * by the road width `width` (units, by course position), which their laterals follow, and the original's
 * (`originalWidth`, straight between its points), by which the roads are apart for one as it comes out; with the start
 * figures of each leg and the runs' stops.
 */
export function turboOutrunPlacements(
  main: Uint8Array,
  inputs: {
    readonly objects: readonly StandingObject[];
    readonly runs: readonly StageRun[];
    readonly start: (stage: number) => number;
    readonly width: Quadratic;
    readonly originalWidth: Quadratic;
    /** GO's distance from the camera, positions. */
    readonly go: number;
    readonly kmh: number;
  },
): { placed: PlacedObject[]; report: PlacingReport } {
  const { width, kmh } = inputs;
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
  const holdingLead = standsFrom(main, ONE_TO_ONE, kmh);
  if (!Array.from({ length: GIRL_FRAME_COUNT }, (_, k) => long(main, GIRL_FRAMES + 8 * k)).includes(HOLDING))
    throw new RangeError("The girls' frames at 0x8FCE do not hold the READY board's picture");

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
    // Where it stands: a start object where it passes the car or looks as large as drawn at its line, the nearer; a
    // girl or her sign where an object drawn 1:1 stands after her leg's car stops; any other where it passes the car.
    let stage = o.stage,
      position = o.position;
    if (o.line !== null) {
      const sized = startDepth(o.line) - inputs.go;
      start[position <= sized ? 'passing' : 'sized']++;
      position = Math.min(position, sized);
    }
    const holding = kind.routine === GIRL || kind.routine === SIGN;
    if (holding) {
      stage = o.from.stage;
      position =
        inputs.runs.find((r) => r.stage === stage)!.end +
        holdingLead -
        (kind.routine === SIGN ? SIGN_NEARER / POSITION_METRES : 0);
      if (kind.routine === GIRL) girls++;
    }
    const g = inputs.start(stage) + position;
    // Across, units from P: a girl's and her sign's x × 32; an item marked by b7 from P; else left from road 0's centre,
    // right from road 1's, but from road 0's where the roads were wider apart than 280 as it came out.
    const w = width.at(g);
    const apart = inputs.originalWidth.at(inputs.start(o.from.stage) + o.from.position) > rightFromLeftWidth;
    const fromP = !(o.item.flags & 2) && o.item.b7 !== 0;
    const x = holding ? 32 * o.item.x : 16 * o.item.x + (fromP ? 0 : o.item.x < 0 || apart ? -w : w);
    const lies = LYING.has(sizes);
    if (ON_ROAD_ROUTINES.includes(kind.routine) && !lies && sizes !== RISING_ON_ROAD)
      throw new RangeError(`Object of size list 0x${sizes.toString(16)} on the road neither lies nor rises`);
    // A body where the original's hit stops or spins the car and the object stands on the ground, as wide as its hit
    // extents (a pixel 2 units, half scale 1).
    const hits =
      !lies &&
      kind.collision <= SOLID &&
      o.item.y === 0 &&
      !(kind.routine === ON_ROAD && half) &&
      kind.hit[1] > kind.hit[0];
    const aside = ((mirrored ? -1 : 1) * (kind.hit[0] + kind.hit[1]) * pixel) / 2;
    const use: PictureUse = {
      sizes,
      units: pixel,
      mirrored,
      palette: kind.palette,
      shadow: (kind.flags & 2) !== 0,
      shades: (kind.flags & 4) !== 0,
      anchor: lies ? 0 : 8,
      aside,
    };
    const body = hits ? units((kind.hit[1] - kind.hit[0]) * pixel) : null;
    if (body !== null) bodies++;
    if (kind.collision >= 11 && kind.collision <= 17) breakable[kind.collision] = (breakable[kind.collision] ?? 0) + 1;
    // What lies on the ground lies at its height 0.
    const height = lies ? 0 : holding ? 2 * o.item.y : half ? o.item.y / 2 : o.item.y;
    placed.push({
      g,
      x: units(x + aside),
      height: units(height) * PIXEL_ASPECT,
      use,
      body,
      ...(lies ? { lies: true as const } : {}),
    });
  }

  // The start figures: each leg's, at its first stage, where it passes the car or looks as large as drawn.
  let figures = 0;
  START_FIGURES.forEach((leg, l) => {
    const stage = 4 * l;
    for (const f of leg) {
      const sized = startDepth(f.line) - inputs.go;
      const position = Math.min(standsFrom(main, f.line, kmh), sized);
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
  });
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
 * mirrored on the left) or road 1's, at its y; the far strip's by P, its x unused. Each extends sideways away from the
 * road, a strip rising from the ground standing on its bottom, the waves and dunes lying on it by their middle.
 */
function stripPiece(
  o: StandingObject,
  kind: ReturnType<typeof readKind>,
  strip: typeof STRIP_A | typeof STRIP_B | undefined,
  inputs: { readonly start: (stage: number) => number; readonly width: Quadratic },
): PlacedObject {
  const mirrored = (o.item.flags & 1) !== 0;
  const g = inputs.start(o.stage) + o.position;
  const lies = LYING.has(kind.sizes);
  const use: PictureUse = {
    sizes: kind.sizes,
    units: strip ? 2 : FAR_UNITS,
    mirrored,
    palette: kind.palette,
    shadow: false,
    shades: (kind.flags & 4) !== 0,
    anchor: (lies ? 0 : 8) | (mirrored ? 2 : 1),
    aside: 0,
    strip: strip ?? FAR,
  };
  const w = inputs.width.at(g);
  const edge = strip ? 16 * o.item.x + (o.item.x < 0 ? -w : w) : (mirrored ? 1 : -1) * FAR_EDGE * FAR_UNITS;
  const height = lies ? 0 : (strip ? o.item.y : FAR_UP) * UNIT_METRES * PIXEL_ASPECT;
  return { g, x: edge * UNIT_METRES, height, use, body: null, ...(lies ? { lies: true as const } : {}) };
}
