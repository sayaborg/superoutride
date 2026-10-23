/**
 * Where ENDURO RACER's objects stand ([ENDURO RACER road data](../../docs/enduro-racer-road-data.md#enduro-racers-objects)): the
 * scenery table's items, the start's templates and the jumps, each at its road position, its lateral from P, its
 * picture, its height above the road and whether the original's hit mark gives it a body.
 */
import { PIXEL_ASPECT } from './pixel-grid.js';
import { PIXEL_UNITS, pictureName, type MoundUse, type PictureUse } from './enduro-racer-boards.js';
import {
  readJumpKind,
  readJumps,
  readScaledX,
  readScenery,
  readSceneryType,
  readStartTemplates,
  takesScaledX,
} from './enduro-racer-scenery.js';

/** A scenery item's x is in 8 lateral units. */
const X_UNITS = 8;
/** The type's flags: mirrored, and the hit mark. */
const MIRRORED = 0x01;
const HIT = 0x08;
/**
 * The original marks an item within 30 of the road's centre (its x, in 8 units) as on the road, but for types
 * 0x48–0x4E: only those can hit the original's bike, which keeps on the road.
 */
const ON_ROAD = 30;
/** Every object the course places stands by its bottom middle (placement 4). */
const BOTTOM_MIDDLE = 4;
/** Kinds 0 and 2 show one picture in two palettes. */
const moundName = (kind: number) => `enduror-mound-${kind === 2 ? 0 : kind}`;

/** An object to place: its road position, lateral units right of P, picture, height in metres and hit mark. */
export interface ObjectSpot {
  readonly position: number;
  readonly x: number;
  readonly image: string;
  readonly palette: number;
  readonly height: number;
  readonly hit: boolean;
  /** Whether the original marks it as on the road. */
  readonly onRoad: boolean;
  /** What the object is, for the report: its scenery type, `start` or `jump`. */
  readonly what: string;
}

/**
 * The objects at `unit` metres a lateral unit, and the pictures and jumps' boards they show: the scenery table's items
 * (a scaled item of types 0x48–0x4E its x from the scaled types' x, its height its own), the start's templates at their
 * position, and each jump as one board at P.
 */
export function enduroRacerObjects(main: Uint8Array, unit: number) {
  const spots: ObjectSpot[] = [];
  const uses: PictureUse[] = [];
  const mounds: MoundUse[] = [];
  const lift = (pixels: number) => pixels * PIXEL_UNITS * PIXEL_ASPECT * unit;
  const show = (use: PictureUse) => {
    uses.push(use);
    return pictureName(use);
  };
  const scaledX = readScaledX(main);
  for (const item of readScenery(main)) {
    if (item.anchor !== undefined && item.anchor !== BOTTOM_MIDDLE)
      throw new RangeError(`The scenery item at ${item.position} stands by placement ${item.anchor}`);
    const type = readSceneryType(main, item.type);
    const scaled = item.height !== undefined && takesScaledX(item.type);
    spots.push({
      position: item.position,
      x: scaled ? scaledX[item.type - 0x48]! : item.x * X_UNITS,
      image: show({
        sizes: type.sizes,
        mirrored: (type.flags & MIRRORED) !== 0,
        palette: type.palette,
        raised: (item.height ?? 0) !== 0,
      }),
      palette: type.palette,
      height: lift(item.height ?? 0),
      hit: (type.flags & HIT) !== 0,
      onRoad: Math.abs(item.x) <= ON_ROAD && !takesScaledX(item.type),
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
        raised: template.height !== 0,
      }),
      palette: template.palette,
      height: lift(template.height),
      hit: (template.flags & HIT) !== 0,
      onRoad: false,
      what: 'start',
    });
  }
  for (const jump of readJumps(main).jumps) {
    const kind = readJumpKind(main, jump.kind);
    const mound = {
      name: moundName(jump.kind),
      sizes: kind.sizes,
      left: 2 * jump.left,
      right: 2 * jump.right,
      palette: kind.palette,
    };
    const same = mounds.find((m) => m.name === mound.name);
    if (same && (same.sizes !== mound.sizes || same.left !== mound.left || same.right !== mound.right))
      throw new RangeError(`The jumps shown as ${mound.name} differ in their halves`);
    mounds.push(mound);
    spots.push({
      position: jump.position,
      x: 0,
      image: mound.name,
      palette: kind.palette,
      height: 0,
      hit: false,
      onRoad: false,
      what: 'jump',
    });
  }
  return { spots, uses, mounds };
}
