/**
 * Where OUTRUN's scenery stands along a road when the main CPU runs it tick by tick at one speed, the procedure the
 * conversion followed before [Time made into position](../../../docs/original-road-data.md#time-made-into-position): the
 * objects its scenery points bring out and the objects at the game's start, each where the car passes it at `kmh`. It
 * places nothing in a course; `positions-at-speed` compares it with `roadObjects`, the speed-0 limit.
 */
import { boardName, liftedUse, standsByEdge, type BoardUse } from './outrun-boards.js';
import { paletteName } from '../shared/pixel-grid.js';
import { readStartWidth } from './outrun-cross-section.js';
import { readSceneryType } from './outrun-road.js';
import { type SceneryPoint } from '../out-run-hardware/road-tables.js';
import { farUp } from '../out-run-hardware/hills.js';
import { approached } from '../out-run-hardware/object-approach.js';
import { tickAdvance, type BoardClock } from '../out-run-hardware/clock.js';
import { LOWEST, sceneryWords, type ObjectPlacement } from './outrun-scenery.js';
import {
  APPROACH,
  hitExtents,
  OBJECT_ROUTINES,
  objectAside,
  objectSize,
  type StartObject,
  sceneryRoutine,
} from './outrun-sprites.js';

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
 * The objects at the game's start (`starts`) fill slots from GO at their lines and stand where they pass the car or, nearer, where
 * they stand as the original projects them at their line (`ahead`, positions ahead of the car at GO), across from the grid's
 * road (`startRoad`) as from COCONUT BEACH's left road at the game's start's width (450). A point is taken by
 * its whole-road position, and its stretch is the one its position lies in. `width(p)` is the road width (units) at
 * road position p, which an object's lateral follows; `originalWidth(p)` the original's, straight between its points,
 * by which the roads are apart for an object, where it was wider than 280 as it appeared.
 */
export function roadObjectsAtSpeed(
  main: Uint8Array,
  points: readonly SceneryPoint[],
  options: {
    readonly go: number;
    readonly end: number;
    readonly resets: readonly number[];
    readonly kmh: number;
    readonly width: (p: number) => number;
    readonly originalWidth: (p: number) => number;
    /** The centre of the road the grid stands on at GO, units from the middle (COCONUT BEACH's left road, −450). */
    readonly startRoad: number;
    readonly ahead: (line: number) => number;
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
  const { rightFromLeftWidth, slots, appears, passes, halved } = sceneryWords(main);
  const startWidth = readStartWidth(main);
  const placements: ObjectPlacement[] = [];
  const checkpoints: number[] = [];
  const notConverted = new Map<number, number>();
  const unconverted: { drawing: number; position: number }[] = [];
  // The start's objects stand by the grid's road as COCONUT BEACH's by its left road, at the game's start's width.
  const startShift = options.startRoad + startWidth;
  const place = (use: BoardUse, position: number, x: number, y: number, apart: boolean, start = false) => {
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
    const road = start ? startWidth : options.width(position);
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
    const lift = fromMiddle ? farUp(options.clock) : y;
    placements.push({
      position,
      x: lateral,
      y: lift,
      image: boardName(use),
      palette: paletteName(use.palette),
      hit: routine.hits && !y && right > left ? Math.min(width, right - left) : null,
      width,
      shades: liftedUse(use, lift).shadows,
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
      shadows: o.shadows,
    };
    const sized = options.go + options.ahead(o.line);
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
  const step = options.kmh * options.clock.step;
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
        if (shown && OBJECT_ROUTINES.get(shown.routine)!.hits && !e.y && right > left) ended.solid++;
      }
      running = null;
    }
    // 1. The road position, 2. the tick's advance.
    const road = options.go + (tick * step) / 65536;
    let advance;
    ({ advance, remainder } = tickAdvance(options.clock, options.kmh, remainder));
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
      for (const depth of appears) {
        const carry = (running.pattern & 0x8000) !== 0;
        running.pattern = ((running.pattern << 1) | (carry ? 1 : 0)) & 0xffff;
        if (!carry || running.count === 0) continue;
        running.count--;
        running.entry = running.entry - 8 < 0 ? running.entries.last : running.entry - 8;
        const e = running.entries.entries[running.entry / 8]!;
        if (live.length >= slots) {
          dropped++;
          continue;
        }
        const drawing = e.flags >> 4;
        const shown = sceneryRoutine(main, e.flags, e.y);
        const apart = options.originalWidth(road) > rightFromLeftWidth;
        live.push({
          depth,
          half: halved.has(drawing),
          stands: shown
            ? (position) =>
                place(
                  {
                    sprite: e.sprite,
                    mirrored: (e.flags & 1) !== 0,
                    palette: e.palette,
                    shadow: (e.flags & 2) !== 0,
                    ...shown,
                    shadows: OBJECT_ROUTINES.get(shown.routine)!.shadows === true,
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
    }
    // 4. Every object approaches once; one reaching line 512 passes the car here.
    for (let i = live.length - 1; i >= 0; i--) {
      const o = live[i]!;
      o.depth = approached(main, APPROACH, o.depth, advance, o.half);
      if (o.depth >>> 16 < passes) continue;
      o.stands(road);
      live.splice(i, 1);
    }
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
