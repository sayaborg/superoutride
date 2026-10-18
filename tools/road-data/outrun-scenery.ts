/**
 * Where OUTRUN's scenery stands along a stage ([Original road data](../../docs/original-road-data.md#placing-scenery)):
 * the objects its scenery points start and the objects at the game's start, each where the camera passes it at the top
 * speed, beside its road.
 */
import { boardName, paletteName, type SpriteUse } from './outrun-boards.js';
import { readSceneryType, type SceneryPoint } from './outrun-road.js';
import {
  approach,
  hitExtents,
  hitMiddle,
  OBJECT_ROUTINES,
  readStartObjects,
  sceneryRoutine,
  spriteSizes,
} from './outrun-sprites.js';
import { POSITION_PER_KMH } from './outrun-hills.js';

/** A right-side object is from the left road's centre where the road width exceeds this where it appears. */
const RIGHT_FROM_LEFT_WIDTH = 280;
/** Objects appear at the road's first line; the second of a tick's two slots a 1/64 line nearer. */
const HORIZON = 0x10000;
const NEARER = 0x10400;

/**
 * An object placed: the road position the camera passes it at, its board's base point across from the two roads'
 * middle and its height (road units), its board.
 */
export interface ObjectPlacement {
  readonly position: number;
  readonly x: number;
  readonly y: number;
  readonly image: string;
  readonly palette: string;
  /** Its hit width, road units, where the car hits it; null where it passes through (its extents empty too). */
  readonly hit: number | null;
  /** Its board's width, road units, which bounds the hit width. */
  readonly width: number;
}

/**
 * The objects a stage shows, to `end` (positions): its scenery points' and, at the game's first stage, the start's,
 * each standing where it looks as large as the original draws it at its line (`startDepth`), or nearer, where the camera
 * passes it as the original's would.
 * A point is taken when the road position reaches it, replacing the one before; then each tick its pattern turns twice,
 * each turn bringing out its next entry, from the last back, where a 1 leaves it, until its count is spent. At `kmh` a
 * tick advances the road `kmh × 0x12F / 65536` positions. An object appears at the horizon where it is brought out and
 * stands where the camera passes it (`approach`). `width(p)` is the road width (units) at position p.
 */
export function stageObjects(
  main: Uint8Array,
  points: readonly SceneryPoint[],
  options: {
    readonly end: number;
    readonly kmh: number;
    readonly start: boolean;
    readonly width: (p: number) => number;
    /** The road position (the camera's at GO 0) where an object at the start's depth `line` looks as large. */
    readonly startDepth: (line: number) => number;
  },
): { placements: ObjectPlacement[]; notConverted: Map<number, number> } {
  const placements: ObjectPlacement[] = [];
  const notConverted = new Map<number, number>();
  const step = options.kmh * POSITION_PER_KMH;
  const reach = [approach(main, HORIZON, options.kmh), approach(main, NEARER, options.kmh)];
  const place = (use: SpriteUse, at: number, x: number, y: number, rightFromLeft: boolean) => {
    const position = at;
    if (position >= options.end) return;
    const routine = OBJECT_ROUTINES.get(use.routine)!;
    const size = spriteSizes(main, use.sprite)[0]!;
    const width = size.width * routine.pixelUnits;
    // Across from the roads' middle: an object is from the left road's centre, a right-side one from the right's.
    // Its board stands on its hit extents' middle: one anchored by its left edge (1) stands half its width right, by its
    // right (2) left, and one hit off its middle that far.
    const across = use.anchor & 3;
    const road = options.width(position);
    const lateral =
      (x >= 0 && !rightFromLeft ? road + x : x - road) +
      (across === 1 ? width / 2 : across === 2 ? -width / 2 : 0) +
      hitMiddle(main, use.sprite, use.mirrored);
    const [left, right] = hitExtents(main, use.sprite);
    placements.push({
      position,
      x: lateral,
      y,
      image: boardName(use),
      palette: paletteName(use.palette),
      hit: routine.hits && !y && right > left ? Math.min(width, right - left) : null,
      width,
    });
  };
  if (options.start)
    for (const o of readStartObjects(main))
      place(
        {
          sprite: o.sprite,
          mirrored: (o.flags & 1) !== 0,
          anchor: o.anchor & 15,
          routine: o.routine,
          palette: o.palette,
          shadow: (o.flags & 0x10) !== 0,
        },
        Math.min(options.startDepth(o.line), approach(main, o.line << 16, options.kmh)),
        o.x,
        o.y,
        (o.flags & 4) !== 0,
      );
  const taken = [...points].sort((a, b) => a.position - b.position);
  taken.forEach((point, k) => {
    const next = taken[k + 1]?.position ?? Infinity;
    const type = readSceneryType(main, point.type);
    let pattern = type.frequency,
      count = point.count,
      entry = 0;
    for (let tick = 0; count > 0; tick++) {
      const road = point.position + tick * step;
      if (road >= next || road >= options.end) break;
      for (const slot of [1, 0]) {
        const carry = (pattern & 0x8000) !== 0;
        pattern = ((pattern << 1) | (carry ? 1 : 0)) & 0xffff;
        if (!carry || count === 0) continue;
        count--;
        entry = entry - 8 < 0 ? type.last : entry - 8;
        const e = type.entries[entry / 8]!;
        const shown = sceneryRoutine(e.flags, e.y);
        if (!shown) {
          notConverted.set(e.flags >> 4, (notConverted.get(e.flags >> 4) ?? 0) + 1);
          continue;
        }
        const use = {
          sprite: e.sprite,
          mirrored: (e.flags & 1) !== 0,
          palette: e.palette,
          shadow: (e.flags & 2) !== 0,
          ...shown,
        };
        place(use, road + reach[slot]!, 16 * e.x, e.y, options.width(road) > RIGHT_FROM_LEFT_WIDTH);
      }
    }
  });
  return { placements: placements.sort((a, b) => a.position - b.position || a.x - b.x), notConverted };
}
