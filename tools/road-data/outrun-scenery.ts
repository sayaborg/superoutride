/**
 * Where OUTRUN's scenery stands along a road ([OUTRUN road data](../../docs/outrun-road-data.md#placing-scenery)):
 * the objects its scenery points bring out and the objects at the game's start, each where the car passes it beside its
 * road, as the main CPU runs them tick by tick in the limit of a speed falling to 0.
 */
import { boardName, standsByEdge, type SpriteUse } from './outrun-boards.js';
import { paletteName } from './pixel-grid.js';
import { START_WIDTH } from './outrun-cross-section.js';
import { readSceneryType } from './outrun-road.js';
import { type SceneryPoint } from './road-tables.js';
import { farUp } from './hills.js';
import { approached } from './object-approach.js';
import { phaseUnit, type BoardClock } from './board-clock.js';
import {
  APPROACH,
  hitExtents,
  OBJECT_ROUTINES,
  objectAside,
  objectSize,
  type StartObject,
  sceneryRoutine,
} from './outrun-sprites.js';

/** The original's lowest height, a signed word. */
const LOWEST = -32768;

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
 * The objects a road shows, to `end` (road positions), as the main CPU brings them out and approaches them from GO (road
 * position `go`), by its ticks in the limit of a speed falling to 0 ([Original road data](../../docs/original-road-data.md#time-made-into-position)):
 * the road position passes each place, each tick's advance is 0 or 1, and a unit of advance comes once a `phaseUnit`
 * from GO.
 *
 * 0. Where the road position is past a stretch's end (`resets`), the next stretch begins: the scenery point being run
 *    ends, and only the new stretch's points are taken.
 * 1. A point is taken when the road position reaches it (one a tick), replacing the one before. While its count lasts
 *    and its cursor (from its position, one a tick) is not past the road position, its pattern turns left twice, each
 *    turn that carries out a 1 bringing out its next entry, from the last back, into a free slot of 79 (none free, none
 *    brought out): the first turn's at line 0x104, the second's at 0x100.
 * 2. Where a unit of advance comes, each object's depth gains the table's step at 0x28000 for its line and an advance
 *    of 1 (half for the clouds), after that tick's control; where it reaches line 512 it passes the car, and stands
 *    there.
 *
 * The objects at the game's start (`starts`) fill slots from GO at their lines and stand where they pass the car or, nearer, where
 * they look as large as the original draws them at their line (`startDepth`, a road position), across from the grid's
 * road (`startRoad`) as from COCONUT BEACH's left road at the game's start's width (450). A point is taken by
 * its whole-road position, and its stretch is the one its position lies in. `width(p)` is the road width (units) at
 * road position p, which an object's lateral follows; `originalWidth(p)` the original's, straight between its points,
 * by which the roads are apart for an object, where it was wider than 280 as it appeared.
 */
export function roadObjects(
  main: Uint8Array,
  points: readonly SceneryPoint[],
  options: {
    readonly go: number;
    readonly end: number;
    readonly resets: readonly number[];
    readonly width: (p: number) => number;
    readonly originalWidth: (p: number) => number;
    /** The centre of the road the grid stands on at GO, units from the middle (COCONUT BEACH's left road, −450). */
    readonly startRoad: number;
    readonly startDepth: (line: number) => number;
    readonly starts: readonly StartObject[];
    readonly clock: BoardClock;
  },
): {
  placements: ObjectPlacement[];
  /** Where an object that grants the checkpoint's time passes the car. */
  checkpoints: number[];
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
  const checkpoints: number[] = [];
  const notConverted = new Map<number, number>();
  const unconverted: { drawing: number; position: number }[] = [];
  // The start's objects stand by the grid's road as COCONUT BEACH's by its left road, at the game's start's width.
  const startShift = options.startRoad + START_WIDTH;
  const place = (use: SpriteUse, position: number, x: number, y: number, apart: boolean, start = false) => {
    const routine = OBJECT_ROUTINES.get(use.routine)!;
    if (routine.grantsTime) checkpoints.push(position);
    // At the original's lowest height (ALPS's grass strip, 894 m below the road), never seen: not placed.
    if (position >= options.end || y === LOWEST) return;
    const size = objectSize(main, use);
    const width = size.width * routine.pixelUnits;
    // Across from the roads' middle: an object is from the left road's centre, a right-side one from the right's
    // unless its routine keeps it by the left where the roads were apart; a cloud by the middle, whatever its x.
    // One standing by its edge has its board's base point there. Any other's board stands on its hit extents' middle:
    // one anchored by its left edge (1) stands half its width right, by its right (2) left, and one hit off its middle
    // that far.
    const across = use.anchor & 3;
    const road = start ? START_WIDTH : options.width(position);
    const { fromMiddle } = routine;
    const lateral =
      (start ? startShift : 0) +
      (fromMiddle
        ? (across === 1 ? -1 : 1) * fromMiddle.edge * routine.pixelUnits
        : (x >= 0 && !(apart && routine.keepsLeftWhenApart) ? road + x : x - road) +
          (standsByEdge(use)
            ? 0
            : (across === 1 ? width / 2 : across === 2 ? -width / 2 : 0) + objectAside(main, use)));
    const [left, right] = hitExtents(main, use.sprite);
    placements.push({
      position,
      x: lateral,
      y: fromMiddle ? farUp(options.clock.lines) : y,
      image: boardName(use),
      palette: paletteName(use.palette),
      hit: routine.hits && !y && right > left ? Math.min(width, right - left) : null,
      width,
    });
  };

  // What an object does when it passes the car.
  type Live = { depth: number; half: boolean; stands: (position: number) => void };
  const live: Live[] = [];
  let dropped = 0;
  const ended = { objects: 0, solid: 0 };
  const start = { passing: 0, sized: 0 };
  for (const o of options.starts) {
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
        place(use, Math.min(position, sized), o.x, o.y, (o.flags & 4) !== 0, true);
      },
    });
  }

  const taken = [...points].sort((a, b) => a.position - b.position);
  const stretchOf = (position: number) => options.resets.filter((r) => r <= position).length;
  const stretchStart = (k: number) => (k === 0 ? options.go : options.resets[k - 1]!);
  const unit = phaseUnit(options.clock);
  let stretch = 0,
    next = 0;
  // The point being run, written by the control (so not narrowed to none where the loop reads it).
  type Running = {
    point: (typeof taken)[number];
    cursor: number;
    count: number;
    pattern: number;
    entry: number;
    entries: ReturnType<typeof readSceneryType>;
  };
  let running = null as Running | null;
  // 0. The stretches the road is past (`passed(r)`) end: the point being run ends with its own.
  const switchPast = (passed: (reset: number) => boolean) => {
    while (stretch < options.resets.length && passed(options.resets[stretch]!)) stretch++;
    if (!running || stretchOf(running.point.position) === stretch) return;
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
      if (shown && OBJECT_ROUTINES.get(shown.routine)!.hits && !e.y && right > left) ended.solid++;
    }
    running = null;
  };
  // 3. A tick's control at road position `road`: a point taken, then its pattern turned. Whether it did either.
  const control = (road: number) => {
    let acted = false;
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
      acted = true;
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
        const apart = options.originalWidth(road) > RIGHT_FROM_LEFT_WIDTH;
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
                )
            : (position) => {
                notConverted.set(drawing, (notConverted.get(drawing) ?? 0) + 1);
                unconverted.push({ drawing, position });
              },
        });
      }
      running.cursor++;
      acted = true;
    }
    return acted;
  };
  // GO's ticks, then the road position's next event after `road`: its next unit of advance, the next point, or the
  // next turn or reset.
  while (control(options.go));
  for (let road = options.go, units = 1; ;) {
    const advances = options.go + units * unit;
    const point = taken[next]?.position;
    const turn = running && running.count > 0 ? stretchStart(stretch) + Math.ceil(running.cursor - 1e-9) : Infinity;
    const reset = options.resets[stretch] ?? Infinity;
    road = Math.min(advances, ...[point ?? Infinity, turn, reset].filter((p) => p > road));
    if (road > options.end) break;
    // A tick reaching `road`: its control, and where a unit of advance comes, every object's approach by it; one
    // reaching line 512 passes the car here.
    switchPast((r) => r < road);
    control(road);
    if (road === advances) {
      units++;
      for (let i = live.length - 1; i >= 0; i--) {
        const o = live[i]!;
        o.depth = approached(main, APPROACH, o.depth, 1, o.half);
        if (o.depth >>> 16 < PASSES) continue;
        o.stands(road);
        live.splice(i, 1);
      }
    }
    // The ticks on from it, as the road position passes it.
    switchPast((r) => r <= road);
    while (control(road));
  }
  return {
    placements: placements.sort((a, b) => a.position - b.position || a.x - b.x),
    checkpoints,
    notConverted,
    unconverted,
    dropped,
    ended,
    start,
  };
}
