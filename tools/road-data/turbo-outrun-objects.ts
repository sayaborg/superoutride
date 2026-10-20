/**
 * Where TURBO OUTRUN's objects stand on its course and what they show
 * ([Original road data](../../docs/original-road-data.md#turbo-outruns-objects)): each object the scenery model stands
 * (`turboOutrunObjects`), the start objects where they look as large as the original draws them, the start figures, and
 * the girls who hold up STAGE UP! and GOAL!, each across from P by the rule its routine follows, with its picture, its
 * height and, where the original tests a hit and it stands on the ground, a body.
 */
import { long } from './program-words.js';
import type { Quadratic } from './offset-plan.js';
import { POSITION_METRES } from './offset-plan.js';
import { startDepth } from './object-approach.js';
import { PIXEL_ASPECT, UNIT_METRES } from './pixel-grid.js';
import { type Foot, type PictureUse } from './turbo-outrun-boards.js';
import { readConstants, readKind } from './turbo-outrun-road.js';
import { standsFrom, type StageRun, type StandingObject } from './turbo-outrun-scenery.js';
import { START_FIGURES } from './turbo-outrun-start.js';

/** The routines that draw the strips beside the road (0x0C to 0x20) and the far strip (0x24): placed with TO-3b2. */
const STRIPS = [0x0c, 0x24] as const;
/**
 * The routines drawing objects lying on the road: 0x08 (half scale: gravel, earth, snow, sand, puddles) and the puddles
 * that splash when hit (0x4C, 0x50), their base point their middle, as OUTRUN's patches'.
 */
const ON_ROAD = 0x08;
const LYING: readonly number[] = [ON_ROAD, 0x4c, 0x50];
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
/** Collision classes 0 to 3 stop or spin the car: the objects of those standing on the ground have a body. */
const SOLID = 3;

/**
 * An object placed on the course: its course position, metres right of P, metres up, its picture, and its body's width
 * by its hit extents (at most its picture's, which the course takes).
 */
export interface PlacedObject {
  readonly g: number;
  readonly x: number;
  readonly height: number;
  readonly use: PictureUse;
  readonly body: number | null;
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
  /** The strips and far strips left for TO-3b2, and the items below the road (never seen). */
  readonly strips: number;
  readonly below: number;
}

/**
 * The objects on the course: `objects` from the scenery model, each stage's from its course position `start(stage)`,
 * by the road width `width` (units, by course position), with the start figures of each leg and the runs' stops.
 */
export function turboOutrunPlacements(
  main: Uint8Array,
  inputs: {
    readonly objects: readonly StandingObject[];
    readonly runs: readonly StageRun[];
    readonly start: (stage: number) => number;
    readonly width: Quadratic;
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
    below = 0,
    girls = 0,
    bodies = 0;
  const units = (u: number) => u * UNIT_METRES;
  const holdingLead = standsFrom(main, ONE_TO_ONE, kmh);
  if (!Array.from({ length: GIRL_FRAME_COUNT }, (_, k) => long(main, GIRL_FRAMES + 8 * k)).includes(HOLDING))
    throw new RangeError("The girls' frames at 0x8FCE do not hold the READY board's picture");

  for (const o of inputs.objects) {
    const kind = readKind(main, o.item.kind);
    if (kind.routine >= STRIPS[0] && kind.routine <= STRIPS[1]) {
      strips++;
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
    const apart = width.at(inputs.start(o.from.stage) + o.from.position) > rightFromLeftWidth;
    const fromP = !(o.item.flags & 2) && o.item.b7 !== 0;
    const x = holding ? 32 * o.item.x : 16 * o.item.x + (fromP ? 0 : o.item.x < 0 || apart ? -w : w);
    // A body where the original's hit stops or spins the car and the object stands on the ground, as wide as its hit
    // extents (a pixel 2 units, half scale 1).
    const hits =
      kind.collision <= SOLID && o.item.y === 0 && !(kind.routine === ON_ROAD && half) && kind.hit[1] > kind.hit[0];
    const aside = ((mirrored ? -1 : 1) * (kind.hit[0] + kind.hit[1]) * pixel) / 2;
    const use: PictureUse = {
      sizes,
      units: pixel,
      mirrored,
      palette: kind.palette,
      shadow: (kind.flags & 2) !== 0,
      foot: (LYING.includes(kind.routine) ? 0 : 8) as Foot,
      aside,
    };
    const body = hits ? units((kind.hit[1] - kind.hit[0]) * pixel) : null;
    if (body !== null) bodies++;
    if (kind.collision >= 11 && kind.collision <= 17) breakable[kind.collision] = (breakable[kind.collision] ?? 0) + 1;
    const height = holding ? 2 * o.item.y : half ? o.item.y / 2 : o.item.y;
    placed.push({ g, x: units(x + aside), height: units(height) * PIXEL_ASPECT, use, body });
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
          foot: 8,
          aside: 0,
        },
        body: null,
      });
      figures++;
    }
  });
  return {
    placed,
    report: { placed: placed.length, start, figures, girls, bodies, breakable, strips, below },
  };
}
