/**
 * Where ENDURO RACER's objects stand ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-objects)): the
 * scenery table's items and the start's templates, each at its road position, its lateral from P, its
 * picture, its height above the road and whether the original's hit mark gives it a body.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { instruction } from '../sega-16/program-words.js';
import { pictureName, type PictureUse } from './enduro-racer-boards.js';
import { ZOOM_UNIT } from './enduro-racer-constants.js';
import {
  itemRules,
  readScaledX,
  readScenery,
  readSceneryType,
  readStartTemplates,
  takesScaledX,
} from './enduro-racer-road.js';
import type { EnduroRacerPrograms } from './enduro-racer-rom.js';
import { floats } from '../shared/sprite-rules.js';
import { PIXEL_ASPECT } from '../sega-16/display.js';

/** The type's flags: mirrored, and the hit mark. */
const MIRRORED = 0x01;
const HIT = 0x08;
/** Every object the course places stands by its bottom middle (placement 4). */
const BOTTOM_MIDDLE = 4;

/** An object to place: its road position, lateral units right of P, picture, height in metres and hit mark. */
export interface ObjectSpot {
  readonly position: number;
  readonly x: number;
  readonly image: string;
  readonly palette: number;
  readonly height: number;
  readonly hit: boolean;
  /** Whether the original marks it as on the road (`itemRules`), a scaled type's never: only those can hit its bike. */
  readonly onRoad: boolean;
  /** What the object is, for the report: its scenery type or `start`. */
  readonly what: string;
}

/**
 * The objects at `unit` metres a lateral unit, and the pictures they show: the scenery table's items (a scaled item of
 * types 0x48–0x4E its x from the scaled types' x, its height its own) and the start's templates at their position.
 */
/**
 * How the program zooms an object by its depth number d: d + 5, at most 0x7F (`move.b $6(a5), d0; addq.b #5, d0; bpl.b;
 * moveq #$7F, d0` at M 0x8B92 to 0x8B9C). By the hardware's scale (`ZOOM_UNIT`) a pixel of an unscaled picture, drawn at
 * the cap, spans `pixelUnits` lateral units, and each depth number nearer a unit spans 1 / `unitsALine` pixel more.
 */
export function objectZoom({ mainInstructions }: EnduroRacerPrograms) {
  const [cap] = instruction(mainInstructions, 0x8b92, [0x102d, 0x0006, 0x5a00, 0x6a02, null], "an object's zoom");
  if (cap! >> 8 !== 0x70) throw romDiffers("The program at 0x8B9A does not cap an object's zoom");
  return { pixelUnits: ZOOM_UNIT.scale / ((cap! & 0xff) - ZOOM_UNIT.offset), unitsALine: ZOOM_UNIT.scale };
}

export function enduroRacerObjects(programs: EnduroRacerPrograms, unit: number) {
  const { main, mainInstructions } = programs;
  const { pixelUnits } = objectZoom(programs);
  const spots: ObjectSpot[] = [];
  const uses: PictureUse[] = [];
  const lift = (pixels: number) => pixels * pixelUnits * PIXEL_ASPECT * unit;
  const show = (use: PictureUse) => {
    uses.push(use);
    return pictureName(use);
  };
  const rules = itemRules(mainInstructions);
  const scaledX = readScaledX(main, rules.scaled);
  for (const item of readScenery(main)) {
    if (item.anchor !== undefined && item.anchor !== BOTTOM_MIDDLE)
      throw romDiffers(`The scenery item at ${item.position} stands by placement ${item.anchor}`);
    const type = readSceneryType(main, item.type);
    const scaled = item.height !== undefined && takesScaledX(rules.scaled, item.type);
    spots.push({
      position: item.position,
      x: scaled ? scaledX[item.type - rules.scaled.from]! : item.x * rules.xUnits,
      image: show({
        sizes: type.sizes,
        mirrored: (type.flags & MIRRORED) !== 0,
        palette: type.palette,
        // Its height in unscaled pixels: it stands below one.
        shades: !floats(item.height ?? 0, 1),
      }),
      palette: type.palette,
      height: lift(item.height ?? 0),
      hit: (type.flags & HIT) !== 0,
      onRoad: rules.onRoad(item.x * rules.xUnits) && !takesScaledX(rules.scaled, item.type),
      what: item.type.toString(16),
    });
  }
  for (const template of readStartTemplates(main)) {
    if (template.anchor !== BOTTOM_MIDDLE) throw romDiffers(`A start template stands by placement ${template.anchor}`);
    spots.push({
      position: template.position,
      x: template.x,
      image: show({
        sizes: template.sizes,
        mirrored: (template.flags & MIRRORED) !== 0,
        palette: template.palette,
        shades: !floats(template.height, 1),
      }),
      palette: template.palette,
      height: lift(template.height),
      hit: (template.flags & HIT) !== 0,
      onRoad: false,
      what: 'start',
    });
  }
  return { spots, uses };
}
