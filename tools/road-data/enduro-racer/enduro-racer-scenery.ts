/**
 * Where ENDURO RACER's objects stand ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-objects)): the
 * scenery table's items and the start's templates, each at its road position, its lateral from P, its
 * picture, its height above the road and whether the original's hit mark gives it a body.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { instruction, long } from '../cpu/program-words.js';
import { type PictureUse } from './enduro-racer-boards.js';
import { ZOOM_UNIT } from './enduro-racer-constants.js';
import {
  itemRules,
  readObjectTemplates,
  readScaledX,
  readScenery,
  readSceneryType,
  readStartTemplates,
  takesScaledX,
} from './enduro-racer-road.js';
import type { EnduroRacerPrograms } from './enduro-racer-rom.js';
import { floats } from '../shared/sprite-rules.js';
import { PIXEL_ASPECT } from '../sega-16/display.js';
import { bottomMiddle, SPACE_HARRIER_SPRITES } from '../sega-16/sprite-pixels.js';

/** The type's flags: mirrored, and the hit mark. */
const MIRRORED = 0x01;
const HIT = 0x08;
/** Every object the course places stands by its bottom middle, Space Harrier's hardware's placement 4. */
const BOTTOM_MIDDLE = bottomMiddle(SPACE_HARRIER_SPRITES);

/**
 * An object to place: its road position, lateral units right of P, picture, palette (its name), height in metres and
 * hit mark; a thing of several pieces its pieces' bodies as parts instead (`parts`, metres).
 */
export interface ObjectSpot {
  readonly position: number;
  readonly x: number;
  readonly image: string;
  readonly palette: string;
  readonly height: number;
  readonly hit: boolean;
  readonly parts?: readonly { readonly across: number; readonly width: number }[];
  /** Whether the original marks it as on the road (`itemRules`), a scaled type's never: only those can hit its bike. */
  readonly onRoad: boolean;
  /** What the object is, for the report: its scenery type or `start`. */
  readonly what: string;
}

/**
 * An object as the original brings it out, before its picture is named: its use, its bottom's height above the road
 * (unscaled pixels), the object that shows it (`sceneryObjects`) and what it comes out with (`start`, or the scenery
 * items at its position).
 */
export interface ObjectPiece extends Omit<ObjectSpot, 'image' | 'palette'> {
  readonly use: PictureUse;
  readonly palette: number;
  readonly rows: number;
  readonly object: number;
  readonly unit: string;
}

/** The objects' run, a scenery object's passing, its taking the next item and the start's objects turning to it. */
const OBJECTS_RUN = 0x1228;
const PASSING = 0xcb92;
const NEXT_ITEM = 0xcc16;
const START_ROUTINE = 0xcb5c;
/** The draw list's insertion (an object before the first as near or nearer) and its reading from its end. */
const DRAW_INSERT = 0x90e6;
const DRAW_READ = 0x907e;

/**
 * Which object shows each scenery item, in the table's order, and each start template's object
 * ([ENDURO RACER's objects](../../../docs/enduro-racer-road-data.md#enduro-racers-objects)). The program runs its 48
 * objects in order each tick (0x1228); those whose template's routine is the scenery's (0xCB92) or the start's (0xCB5C,
 * which turns to the scenery's) each, once the road position reaches its own (`bls` at 0xCB9E), take the table's next
 * item (0xCC16), the scenery's at position 0 the first items at the first tick. The road position gains less than a
 * position a tick, so they pass a position at a time, those at one position in their order.
 */
export function sceneryObjects({ main, mainInstructions: code }: EnduroRacerPrograms) {
  instruction(
    code,
    OBJECTS_RUN,
    [0x4bf9, 0x0004, 0x0800, 0x4a55, 0x6a00, 0x0008, 0x206d, 0x0002, 0x4e90, 0x4bed, 0x0080],
    "the objects' run",
  );
  instruction(
    code,
    PASSING,
    [0x2a2d, 0x0010, 0x2039, 0x0012, 0x6184, 0x9a80, 0x6300, NEXT_ITEM - (PASSING + 14)],
    'a scenery object passing',
  );
  instruction(code, NEXT_ITEM, [0x3abc, 0x8004, 0x2b7c, 0, PASSING], "a scenery object's next item");
  instruction(code, START_ROUTINE, [0x2b7c, 0, PASSING], "the start's objects turning to scenery");
  instruction(code, DRAW_INSERT, [0xbe90, 0x6f08], "the draw list's insertion");
  instruction(code, DRAW_READ, [0x2a60], "the draw list's reading");
  const starts = readStartTemplates(main).map((t) => t.address);
  const held = readObjectTemplates(main).flatMap((template, object) => {
    const routine = long(main, template + 2);
    if (starts.includes(template) && routine !== START_ROUTINE)
      throw romDiffers(`The start's template at 0x${template.toString(16)} does not run the start's routine`);
    return routine === PASSING || routine === START_ROUTINE
      ? [{ object, template, at: long(main, template + 0x10) }]
      : [];
  });
  const items = readScenery(main);
  const shows: number[] = [];
  for (let road = 0; road < Infinity; road = Math.min(...held.map((o) => o.at))) {
    for (let passing = held.filter((o) => o.at <= road); passing.length; passing = held.filter((o) => o.at <= road))
      for (const o of passing) {
        const item = items[shows.length];
        o.at = item ? 256 * item.position : Infinity;
        if (item) shows.push(o.object);
      }
  }
  return {
    items: shows,
    start: (template: number) => held.find((o) => o.template === template)!.object,
  };
}

/**
 * How the program zooms an object by its depth number d: d + 5, at most 0x7F (`move.b $6(a5), d0; addq.b #5, d0; bpl.b;
 * moveq #$7F, d0` at M 0x8B92 to 0x8B9C). By the hardware's scale (`ZOOM_UNIT`) a pixel of an unscaled picture, drawn at
 * the cap, spans `pixelUnits` lateral units, and each depth number nearer a unit spans 1 / `unitsALine` pixel more.
 */
export function objectZoom({ mainInstructions }: EnduroRacerPrograms) {
  const [cap] = instruction(mainInstructions, 0x8b92, [0x102d, 0x0006, 0x5a00, 0x6a02, null], "an object's zoom");
  if (cap! >> 8 !== 0x70) throw romDiffers("The program at 0x8B9A does not cap an object's zoom");
  return {
    pixelUnits: ZOOM_UNIT.scale / ((cap! & 0xff) - ZOOM_UNIT.offset),
    unitsALine: ZOOM_UNIT.scale,
    /** The first depth number drawn at the cap, 1:1. */
    capped: (cap! & 0xff) - ZOOM_DEPTH,
  };
}

/** What an object's depth number gains to its zoom (`addq.b #5, d0` at 0x8B96). */
const ZOOM_DEPTH = 5;
/** An object's x on the screen: made positive (0x8BAC), scaled by its depth (0x8BB6, and 0x8BD2 for a positive x). */
const ACROSS_SIGN = 0x8bac;
const ACROSS = [0x8bb6, 0x8bd2];

/**
 * Where the program draws an object across where its picture is first drawn 1:1, pixels right of the screen's middle,
 * by its x in lateral units: x × w / 16384, cut toward 0 (its x made positive, scaled, its sign put back: 0x8BAC to
 * 0x8BE8), w the word at $6(a5), its depth number high, halved, plus 0x180 and masked by 0x7F80 (`lsr.w #1, d4; addi.w
 * #$180, d4; andi.w #$7F80, d4; mulu.w d4, d0`, the product doubled twice and swapped). There a pixel is `pixelUnits`
 * units, as the hardware's scale draws one: a check of the two.
 */
export function acrossPixels(programs: EnduroRacerPrograms) {
  const code = programs.mainInstructions;
  instruction(code, ACROSS_SIGN, [0x302d, 0x0014, 0x6a00, 0x0020, 0x4440], "an object's x made positive");
  const [add, mask] = ACROSS.map((at) =>
    instruction(
      code,
      at,
      [0x382d, 0x0006, 0xe24c, 0x0644, null, 0x0244, null, 0xc0c4, 0xd080, 0xd080, 0x4840],
      "an object's x on the screen",
    ),
  ).reduce((a, b) => {
    if (a.some((v, k) => v !== b[k])) throw romDiffers("An object's x is scaled otherwise left and right");
    return a;
  });
  const { capped, pixelUnits } = objectZoom(programs);
  const scale = (low: number) => ((((capped << 8) | low) >> 1) + add!) & mask!;
  if (scale(0) !== scale(0xff) || Math.abs(16384 / scale(0) - pixelUnits) > 1e-9)
    throw romDiffers("An object's x where it is first drawn 1:1 is not a pixel of the hardware's scale");
  return (x: number) => Math.sign(x) * Math.trunc((Math.abs(x) * scale(0)) / 16384);
}

/**
 * The objects at `unit` metres a lateral unit as they come out, their pictures not yet named: the scenery table's items
 * (a scaled item of types 0x48–0x4E its x from the scaled types' x, its height its own) and the start's templates at
 * their position, each with the object that shows it (`sceneryObjects`).
 */
export function enduroRacerObjects(programs: EnduroRacerPrograms, unit: number): ObjectPiece[] {
  const { main, mainInstructions } = programs;
  const { pixelUnits } = objectZoom(programs);
  const objects = sceneryObjects(programs);
  const pieces: ObjectPiece[] = [];
  const lift = (pixels: number) => pixels * pixelUnits * PIXEL_ASPECT * unit;
  const rules = itemRules(mainInstructions);
  const scaledX = readScaledX(main, rules.scaled);
  readScenery(main).forEach((item, k) => {
    if (item.anchor !== undefined && item.anchor !== BOTTOM_MIDDLE)
      throw romDiffers(`The scenery item at ${item.position} stands by placement ${item.anchor}`);
    const type = readSceneryType(main, item.type);
    const scaled = item.height !== undefined && takesScaledX(rules.scaled, item.type);
    pieces.push({
      position: item.position,
      x: scaled ? scaledX[item.type - rules.scaled.from]! : item.x * rules.xUnits,
      use: {
        sizes: type.sizes,
        mirrored: (type.flags & MIRRORED) !== 0,
        palette: type.palette,
        // Its height in unscaled pixels: it stands below one.
        shades: !floats(item.height ?? 0, 1),
      },
      palette: type.palette,
      rows: item.height ?? 0,
      height: lift(item.height ?? 0),
      hit: (type.flags & HIT) !== 0,
      onRoad: rules.onRoad(item.x * rules.xUnits) && !takesScaledX(rules.scaled, item.type),
      what: item.type.toString(16),
      object: objects.items[k]!,
      unit: `items at ${item.position}`,
    });
  });
  for (const template of readStartTemplates(main)) {
    if (template.anchor !== BOTTOM_MIDDLE) throw romDiffers(`A start template stands by placement ${template.anchor}`);
    pieces.push({
      position: template.position,
      x: template.x,
      use: {
        sizes: template.sizes,
        mirrored: (template.flags & MIRRORED) !== 0,
        palette: template.palette,
        shades: !floats(template.height, 1),
      },
      palette: template.palette,
      rows: template.height,
      height: lift(template.height),
      hit: (template.flags & HIT) !== 0,
      onRoad: false,
      what: 'start',
      object: objects.start(template.address),
      unit: 'start',
    });
  }
  return pieces;
}
