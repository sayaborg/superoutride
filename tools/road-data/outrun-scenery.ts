/**
 * Where OUTRUN's scenery stands along a road ([Original road data](../../docs/original-road-data.md#placing-scenery)):
 * the objects its scenery points bring out and the objects at the game's start, each where the car passes it at the top
 * speed, beside its road, as the main CPU runs them tick by tick.
 */
import { boardName, boardsAcross, standsByEdge, type SpriteUse } from './outrun-boards.js';
import { paletteName } from './pixel-grid.js';
import { readSceneryType } from './outrun-road.js';
import { type SceneryPoint } from './road-tables.js';
import { approached, STEP_PER_KMH, tickAdvance } from './object-approach.js';
import {
  APPROACH,
  hitExtents,
  OBJECT_ROUTINES,
  objectAside,
  objectSize,
  readStartObjects,
  sceneryRoutine,
} from './outrun-sprites.js';

/** Where the road width exceeds this as an object appears, the roads are apart: some routines keep it by the left road. */
const RIGHT_FROM_LEFT_WIDTH = 280;
/** An object appears at the road's first line; the first of a tick's two turns a 1/64 line nearer (0x3C76, 0x3CA2). */
const APPEARS = [0x10400, 0x10000];
/** An object vanishes, passing the car, where its depth reaches this line (0x4648). */
const PASSES = 0x200;
/** The scenery's object slots, 3 to 81 (the word at 0xF204). */
const SLOTS = 79;
/** Drawing 2 (the clouds) approaches at half the rate (0x4144). */
const HALF_RATE_DRAWING = 2;

/**
 * An object placed: the road position the car passes it at, its board's base point across from the two roads' middle
 * and its height (road units), its board.
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
 * The objects a road shows, to `end` (road positions), as the main CPU brings them out and approaches them at `kmh`
 * from GO (road position `go`), tick by tick:
 *
 * 0. Where the road position before the tick is past a stretch's end (`resets`), the next stretch begins: the scenery
 *    point being run ends, and only the new stretch's points are taken.
 * 1. The road position advances `kmh × 0x12F` (16.16).
 * 2. The tick's advance (`col`) is the phase's gain, three times km/h / 64 with its remainder shared, at most 15.
 * 3. A point is taken when the road position reaches it (one a tick), replacing the one before. While its count lasts
 *    and its cursor (from its position, one a tick) is not past the road position, its pattern turns left twice, each
 *    turn that carries out a 1 bringing out its next entry, from the last back, into a free slot of 79 (none free, none
 *    brought out): the first turn's at line 0x104, the second's at 0x100.
 * 4. Each object's depth gains the table's step at 0x28000 for its line and the advance (half for the clouds); where it
 *    reaches line 512 it passes the car, and stands at that tick's road position.
 *
 * The objects at the game's start fill slots from GO at their lines and stand where they pass the car or, nearer, where
 * they look as large as the original draws them at their line (`startDepth`, a road position). A point is taken by
 * its whole-road position, and its stretch is the one its position lies in. `width(p)` is the road width (units) at
 * road position p; the roads are apart for an object where it was wider than 280 as it appeared. The objects a point
 * marked `passable` brings out are not hit.
 */
export function roadObjects(
  main: Uint8Array,
  points: readonly (SceneryPoint & { readonly passable?: boolean })[],
  options: {
    readonly go: number;
    readonly end: number;
    readonly resets: readonly number[];
    readonly kmh: number;
    readonly width: (p: number) => number;
    readonly startDepth: (line: number) => number;
  },
): {
  placements: ObjectPlacement[];
  notConverted: Map<number, number>;
  /** Where each entry not converted stands, by its drawing. */
  unconverted: { drawing: number; position: number }[];
  /** The objects brought out while every slot was taken, which the original never shows. */
  dropped: number;
  /** The objects the points a stretch's end ended had still to bring out (and how many of them solid). */
  ended: { objects: number; solid: number };
  /** How many of the start's objects stand where they pass the car, and how many where they look as large. */
  start: { passing: number; sized: number };
} {
  const placements: ObjectPlacement[] = [];
  const notConverted = new Map<number, number>();
  const unconverted: { drawing: number; position: number }[] = [];
  const place = (use: SpriteUse, position: number, x: number, y: number, apart: boolean, solid = true) => {
    if (position >= options.end) return;
    const routine = OBJECT_ROUTINES.get(use.routine)!;
    const size = objectSize(main, use);
    const width = size.width * routine.pixelUnits;
    // Across from the roads' middle: an object is from the left road's centre, a right-side one from the right's
    // unless its routine keeps it by the left where the roads were apart; a cloud by the middle, whatever its x.
    // One standing by its edge has its board's base point there. Any other's board stands on its hit extents' middle:
    // one anchored by its left edge (1) stands half its width right, by its right (2) left, and one hit off its middle
    // that far.
    const across = use.anchor & 3;
    const road = options.width(position);
    const { fromMiddle } = routine;
    const lateral = fromMiddle
      ? (across === 1 ? -1 : 1) * fromMiddle.edge * routine.pixelUnits
      : (x >= 0 && !(apart && routine.keepsLeftWhenApart) ? road + x : x - road) +
        (standsByEdge(use) ? 0 : (across === 1 ? width / 2 : across === 2 ? -width / 2 : 0) + objectAside(main, use));
    const [left, right] = hitExtents(main, use.sprite);
    // Its boards side by side, reaching outward from its edge.
    const boards = boardsAcross(main, routine);
    for (let k = 0; k < boards.count; k++)
      placements.push({
        position,
        x: lateral + (across === 1 ? 1 : -1) * k * boards.units,
        y: fromMiddle?.up ?? y,
        image: boardName(use),
        palette: paletteName(use.palette),
        hit: solid && routine.hits && !y && right > left ? Math.min(width, right - left) : null,
        width,
      });
  };

  // What an object does when it passes the car.
  type Live = { depth: number; half: boolean; stands: (position: number) => void };
  const live: Live[] = [];
  let dropped = 0;
  const ended = { objects: 0, solid: 0 };
  const start = { passing: 0, sized: 0 };
  for (const o of readStartObjects(main)) {
    const use = {
      sprite: o.sprite,
      mirrored: (o.flags & 1) !== 0,
      anchor: o.anchor & 15,
      routine: o.routine,
      palette: o.palette,
      shadow: (o.flags & 0x10) !== 0,
    };
    const sized = options.startDepth(o.line);
    live.push({
      depth: o.line << 16,
      half: false,
      stands: (position) => {
        start[position <= sized ? 'passing' : 'sized']++;
        place(use, Math.min(position, sized), o.x, o.y, (o.flags & 4) !== 0);
      },
    });
  }

  const taken = [...points].sort((a, b) => a.position - b.position);
  const stretchOf = (position: number) => options.resets.filter((r) => r <= position).length;
  const stretchStart = (k: number) => (k === 0 ? options.go : options.resets[k - 1]!);
  const step = options.kmh * STEP_PER_KMH;
  let stretch = 0,
    next = 0,
    remainder = 0;
  let running: {
    point: (typeof taken)[number];
    cursor: number;
    count: number;
    pattern: number;
    entry: number;
    entries: ReturnType<typeof readSceneryType>;
  } | null = null;
  for (let tick = 1; ; tick++) {
    const before = options.go + ((tick - 1) * step) / 65536;
    if (before >= options.end) break;
    // 0. A stretch ends: the point being run ends with it.
    while (stretch < options.resets.length && before > options.resets[stretch]!) stretch++;
    if (running && stretchOf(running.point.position) !== stretch) {
      // What it had still to bring out, which the original never shows.
      for (let { count, pattern, entry } = running; count > 0;) {
        const carry = (pattern & 0x8000) !== 0;
        pattern = ((pattern << 1) | (carry ? 1 : 0)) & 0xffff;
        if (!carry) continue;
        count--;
        entry = entry - 8 < 0 ? running.entries.last : entry - 8;
        const e = running.entries.entries[entry / 8]!;
        const shown = sceneryRoutine(main, e.flags, e.y);
        const [left, right] = hitExtents(main, e.sprite);
        ended.objects++;
        if (shown && OBJECT_ROUTINES.get(shown.routine)!.hits && !e.y && right > left && !running.point.passable)
          ended.solid++;
      }
      running = null;
    }
    // 1. The road position, 2. the tick's advance.
    const road = options.go + (tick * step) / 65536;
    let advance;
    ({ advance, remainder } = tickAdvance(options.kmh, remainder));
    // 3. The control: a point taken, then its pattern turned.
    while (next < taken.length && stretchOf(taken[next]!.position) < stretch) next++;
    const point = taken[next];
    if (point && stretchOf(point.position) === stretch && point.position <= road) {
      const entries = readSceneryType(main, point.type);
      running = {
        point,
        cursor: point.position - stretchStart(stretch),
        count: point.count,
        pattern: entries.frequency,
        entry: 0,
        entries,
      };
      next++;
    }
    if (running && running.count > 0 && running.cursor <= Math.floor(road - stretchStart(stretch) + 1e-9)) {
      for (const depth of APPEARS) {
        const carry = (running.pattern & 0x8000) !== 0;
        running.pattern = ((running.pattern << 1) | (carry ? 1 : 0)) & 0xffff;
        if (!carry || running.count === 0) continue;
        running.count--;
        running.entry = running.entry - 8 < 0 ? running.entries.last : running.entry - 8;
        const e = running.entries.entries[running.entry / 8]!;
        if (live.length >= SLOTS) {
          dropped++;
          continue;
        }
        const drawing = e.flags >> 4;
        const shown = sceneryRoutine(main, e.flags, e.y);
        const apart = options.width(road) > RIGHT_FROM_LEFT_WIDTH;
        const solid = !running.point.passable;
        live.push({
          depth,
          half: drawing === HALF_RATE_DRAWING,
          stands: shown
            ? (position) =>
                place(
                  {
                    sprite: e.sprite,
                    mirrored: (e.flags & 1) !== 0,
                    palette: e.palette,
                    shadow: (e.flags & 2) !== 0,
                    ...shown,
                  },
                  position,
                  16 * e.x,
                  e.y,
                  apart,
                  solid,
                )
            : (position) => {
                notConverted.set(drawing, (notConverted.get(drawing) ?? 0) + 1);
                unconverted.push({ drawing, position });
              },
        });
      }
      running.cursor++;
    }
    // 4. Every object approaches once; one reaching line 512 passes the car here.
    for (let i = live.length - 1; i >= 0; i--) {
      const o = live[i]!;
      o.depth = approached(main, APPROACH, o.depth, advance, o.half);
      if (o.depth >>> 16 < PASSES) continue;
      o.stands(road);
      live.splice(i, 1);
    }
  }
  return {
    placements: placements.sort((a, b) => a.position - b.position || a.x - b.x),
    notConverted,
    unconverted,
    dropped,
    ended,
    start,
  };
}
