/**
 * RACING HERO's objects as its courses place them ([Original road data](../../docs/original-road-data.md#racing-heros-objects)):
 * each scenery object, chevron sign and standing part of a surface type, at its position, its lateral from the road's
 * line and its picture's place, and the objects left out.
 */
import type { PlacedObject } from './racing-hero-road.js';
import { PART_MIRRORED, pixelUnits, readDefinition, readPicture, SURFACE_ROUTINES } from './racing-hero-sprites.js';

/** The type of the water and its shore, a Strip, never a board. */
export const WATER_TYPE = 0x0ec;
/** The chevron signs: the one type of the surface tables that stands as scenery does. */
export const CHEVRON_TYPE = 0x254;
/**
 * The objects' lateral, units from the road's line (positive left): X = sign × (w + 4 |lateral|), 0 where the word is,
 * w the road type's edge as the sub CPU writes it: 624 for three lanes (type 4), 224 for two (3), 0 for the goal's run
 * out (7).
 */
const ROAD_EDGES: ReadonlyMap<number, number> = new Map([
  [4, 624],
  [3, 224],
  [7, 0],
]);

/** An object's X, units from the road's line, positive left, on a road of type `roadType`. */
export function objectX(lateral: number, roadType: number): number {
  const w = ROAD_EDGES.get(roadType);
  if (w === undefined) throw new RangeError(`Road type ${roadType} has no edge`);
  return lateral === 0 ? 0 : Math.sign(lateral) * (w + 4 * Math.abs(lateral));
}

/** A part as drawn: its picture, palette and box from the object's point in the largest size's pixels, x right. */
export interface DrawnPart {
  readonly picture: number;
  readonly palette: number;
  readonly mirrored: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Type `t`'s largest size's parts, the first on top, as an object mirrored or not draws them: a part is mirrored where
 * the object's flag or the part's own flag (one of them) mirrors it, at −(x + width) then.
 */
export function drawnParts(main: Uint8Array, t: number, mirrored: boolean): DrawnPart[] {
  return readDefinition(main, t).parts[0]!.map((p) => {
    const { width, height } = readPicture(main, p.picture);
    const flip = ((p.flags & PART_MIRRORED) !== 0) !== mirrored;
    return {
      picture: p.picture,
      palette: p.palette,
      mirrored: flip,
      x: flip ? -(p.x + width) : p.x,
      y: p.y,
      width,
      height,
    };
  });
}

/** A sprite to stand: its course position, its X (units, positive left) and the parts that make its picture. */
export interface Spot {
  readonly position: number;
  readonly x: number;
  readonly type: number;
  readonly mirrored: boolean;
  readonly parts: readonly DrawnPart[];
  /** A largest size's pixel, lateral units across. */
  readonly pixel: number;
  readonly height: number;
  readonly what: 'scenery' | 'chevron' | 'standing';
}

/** A section's objects: its course position's start, road length, road type at a position and object tables. */
export interface SectionObjects {
  readonly start: number;
  readonly length: number;
  readonly roadType: (position: number) => number;
  readonly scenery: readonly PlacedObject[];
  readonly surface: readonly PlacedObject[];
  /** The scenery left out over these positions (from, to inclusive): the goal's section's figures on the road. */
  readonly hidden: readonly (readonly [number, number])[];
}

/** The sprites a section's tables stand, by the rules but those that need the plane, and those its tables leave. */
export function sectionSpots(main: Uint8Array, section: SectionObjects, isEmpty: (t: number) => boolean) {
  const spots: Spot[] = [];
  const left: { position: number; type: number; why: string }[] = [];
  const at = (o: PlacedObject) => section.start + o.position;
  for (const o of section.scenery) {
    if (isEmpty(o.type) || o.type === WATER_TYPE) continue;
    if (o.position >= section.length) left.push({ position: at(o), type: o.type, why: "past its section's road" });
    else if (section.hidden.some(([a, b]) => o.position >= a && o.position <= b))
      left.push({ position: at(o), type: o.type, why: 'on the road after the goal' });
    else spots.push(spot(main, o, at(o), section.roadType(o.position), 'scenery'));
  }
  for (const o of section.surface) {
    if (o.position >= section.length) {
      left.push({ position: at(o), type: o.type, why: "past its section's road" });
      continue;
    }
    if (o.type === CHEVRON_TYPE) {
      spots.push(spot(main, o, at(o), section.roadType(o.position), 'chevron'));
      continue;
    }
    // A surface type's standing parts (y ≠ 0), each its own sprite at the object's point.
    const { routine } = readDefinition(main, o.type);
    if (!SURFACE_ROUTINES.has(routine)) throw new RangeError(`Type 0x${o.type.toString(16)} is not a surface type`);
    const x = objectX(o.lateral, section.roadType(o.position));
    for (const part of drawnParts(main, o.type, (o.flags & PART_MIRRORED) !== 0).filter((p) => p.y !== 0))
      spots.push({
        position: at(o),
        x,
        type: o.type,
        mirrored: (o.flags & PART_MIRRORED) !== 0,
        parts: [part],
        pixel: pixelUnits(routine),
        height: o.height,
        what: 'standing',
      });
  }
  return { spots, left };
}

function spot(main: Uint8Array, o: PlacedObject, position: number, roadType: number, what: Spot['what']): Spot {
  const mirrored = (o.flags & PART_MIRRORED) !== 0;
  return {
    position,
    x: objectX(o.lateral, roadType),
    type: o.type,
    mirrored,
    parts: drawnParts(main, o.type, mirrored),
    pixel: pixelUnits(readDefinition(main, o.type).routine),
    height: o.height,
    what,
  };
}

/** A spot's picture's box from the object's point, largest size's pixels, x right: its parts' together. */
export function spotBox(spot: Spot) {
  const left = Math.min(...spot.parts.map((p) => p.x)),
    right = Math.max(...spot.parts.map((p) => p.x + p.width));
  const top = Math.min(...spot.parts.map((p) => p.y)),
    bottom = Math.max(...spot.parts.map((p) => p.y + p.height));
  return { left, right, top, bottom };
}

/** Where a spot's picture's base point stands, units from the road's line, positive right: its box's middle. */
export const spotLateralUnits = (spot: Spot) => {
  const { left, right } = spotBox(spot);
  return -spot.x + ((left + right) / 2) * spot.pixel;
};
