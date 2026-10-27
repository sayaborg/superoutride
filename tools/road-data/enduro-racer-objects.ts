/**
 * Where ENDURO RACER's objects stand ([ENDURO RACER road data](../../docs/enduro-racer-road-data.md#enduro-racers-objects)): the
 * scenery table's items and the start's templates, each at its road position, its lateral from P, its
 * picture, its height above the road and whether the original's hit mark gives it a body.
 */
import { PIXEL_ASPECT } from './pixel-grid.js';
import { pictureName, type PictureUse } from './enduro-racer-boards.js';
import { PIXEL_UNITS } from './enduro-racer-constants.js';
import {
  itemRules,
  readScaledX,
  readScenery,
  readSceneryType,
  readStartTemplates,
  takesScaledX,
} from './enduro-racer-scenery.js';
import type { EnduroRacerPrograms } from './enduro-racer-rom.js';
import { floats } from './sprite-rules.js';

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
export function enduroRacerObjects({ main, mainInstructions }: EnduroRacerPrograms, unit: number) {
  const spots: ObjectSpot[] = [];
  const uses: PictureUse[] = [];
  const lift = (pixels: number) => pixels * PIXEL_UNITS * PIXEL_ASPECT * unit;
  const show = (use: PictureUse) => {
    uses.push(use);
    return pictureName(use);
  };
  const rules = itemRules(mainInstructions);
  const scaledX = readScaledX(main, rules.scaled);
  for (const item of readScenery(main)) {
    if (item.anchor !== undefined && item.anchor !== BOTTOM_MIDDLE)
      throw new RangeError(`The scenery item at ${item.position} stands by placement ${item.anchor}`);
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
    if (template.anchor !== BOTTOM_MIDDLE)
      throw new RangeError(`A start template stands by placement ${template.anchor}`);
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
