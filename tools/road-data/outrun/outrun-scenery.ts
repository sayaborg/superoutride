/**
 * Where OUTRUN's scenery stands along a road ([OUTRUN road data](../../../docs/outrun-road-data.md#placing-scenery)):
 * the objects its scenery points bring out and the objects at the game's start, each where the car passes it beside its
 * road, as the main CPU runs them tick by tick in the limit of a speed falling to 0.
 */
import { liesBelowGround } from '../shared/sprite-rules.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { boardName, liftedUse, standsByEdge, type BoardUse } from './outrun-boards.js';
import { paletteName } from '../shared/pixel-grid.js';
import { readStartWidth } from './outrun-cross-section.js';
import { readSceneryType } from './outrun-road.js';
import { type SceneryPoint } from '../out-run-hardware/road-tables.js';
import { farUp } from '../out-run-hardware/hills.js';
import { approached } from '../out-run-hardware/object-approach.js';
import { phaseUnit, type ProgramClock } from '../out-run-hardware/clock.js';
import { instruction, word } from '../sega-16/program-words.js';
import {
  APPROACH,
  hitExtents,
  OBJECT_ROUTINES,
  grantsTime,
  routineHits,
  keepsLeftWhenApart,
  objectAside,
  objectSize,
  type StartObject,
  sceneryRoutine,
  readDrawings,
} from './outrun-sprites.js';

/** A routine is searched this far for its approach. */
const ROUTINE_WORDS = 0x100;

/**
 * The scenery's words, their instructions checked. Where the road width exceeds the word at 0xE308 (280) as an object
 * appears (`cmp.w $E308.l, d0` at 0x3D7A), the roads are apart: some routines keep it by the left road. The scenery's
 * object slots are the word at 0xF204 (79, objects 3 to 81; `move.w $F204.l, d1` at 0x3CC2). An object appears at the
 * road's first line, the first of a tick's two turns a 1/64 line nearer (`move.l #$10400, d7` at 0x3C76 and
 * `move.l #$10000, d7` at 0x3CA2), and passes the car where its depth reaches the line each drawing's routine compares
 * (`cmpi.w #$200, d0` at 0x40C8, branching to 0x4648 as every one does). Each drawing's routine on the ground
 * (`readDrawings`) approaches by the step `move.l (a0, d0.w), d0` reads before its first `add.l d0, $24(a5)`, halved
 * where `asr.l #1, d0` comes between (`halved`, the clouds').
 */
export function sceneryWords(main: Uint8Array) {
  instruction(main, 0x3d7a, [0xb079, 0x0000, 0xe308], 'the roads apart');
  instruction(main, 0x3cc2, [0x3239, 0x0000, 0xf204], "the scenery's slots");
  const appears = [0x3c76, 0x3ca2].map((at) => {
    const [high, low] = instruction(main, at, [0x2e3c, null, null], "an object's first line (move.l #$10400, d7)");
    return high! * 0x10000 + low!;
  });
  const [passes] = instruction(main, 0x40c8, [0x0c40, null, 0x6c00, 0x4648 - 0x40ce], 'the passing line (cmpi.w)');
  const halved = new Set<number>();
  readDrawings(main).forEach(({ ground: routine }, drawing) => {
    let at = routine;
    while (at < routine + 2 * ROUTINE_WORDS && !(word(main, at) === 0xd1ad && word(main, at + 2) === 0x0024)) at += 2;
    const before = [word(main, at - 6), word(main, at - 4), word(main, at - 2)];
    if (before[0] === 0x2030 && before[1] === 0x0000 && before[2] === 0xe280) halved.add(drawing);
    else if (before[1] !== 0x2030 || before[2] !== 0x0000)
      throw romDiffers(`Drawing ${drawing}'s routine at 0x${routine.toString(16)} has no approach read`);
  });
  return {
    rightFromLeftWidth: word(main, 0xe308),
    slots: word(main, 0xf204),
    appears,
    passes: passes!,
    halved,
  };
}

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
  /** Whether it is drawn with shadows allowed, standing (`liftedUse`), its board's pen 10 shading. */
  readonly shades: boolean;
}

/** What a road's objects are run by (`roadObjects`). */
export interface RoadObjectsOptions {
  readonly go: number;
  readonly end: number;
  readonly resets: readonly number[];
  readonly width: (p: number) => number;
  readonly originalWidth: (p: number) => number;
  /** The centre of the road the grid stands on at GO, units from the middle (COCONUT BEACH's left road, −450). */
  readonly startRoad: number;
  readonly ahead: (line: number) => number;
  readonly starts: readonly StartObject[];
  readonly clock: ProgramClock;
}

/**
 * A run of a road's objects, which a stepping drives tick by tick: a stretch's end (`switchPast`, the stretches whose
 * reset `passed`), a tick's control at road position `road` (whether it took a point or turned a pattern), every
 * object's approach by an advance, and the road positions of the next point, pattern turn and reset.
 */
export interface RoadObjectsRun {
  readonly switchPast: (passed: (reset: number) => boolean) => void;
  readonly control: (road: number) => boolean;
  readonly approach: (road: number, advance: number) => void;
  readonly events: () => { readonly point: number; readonly turn: number; readonly reset: number };
}

/**
 * The objects a road shows, to `end` (road positions), as the main CPU brings them out and approaches them from GO (road
 * position `go`), by its ticks in the limit of a speed falling to 0 ([Original road data](../../../docs/original-road-data.md#time-made-into-position)):
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
 * The objects at the game's start (`starts`) fill slots (but one of its own) from GO at their lines and stand where
 * they pass the car or, nearer, where they stand as the original projects them at their line (`ahead`, positions ahead
 * of the car at GO), across from the grid's road (`startRoad`) as from COCONUT BEACH's left road at the game's start's
 * width (450). A point is taken by its whole-road position, and its stretch is the one its position lies in. `width(p)`
 * is the road width (units) at road position p, which an object's lateral follows; `originalWidth(p)` the original's,
 * straight between its points, by which the roads are apart for an object, where it was wider than 280 as it appeared.
 */
export function roadObjects(main: Uint8Array, points: readonly SceneryPoint[], options: RoadObjectsOptions) {
  const unit = phaseUnit(options.clock);
  return runRoadObjects(
    main,
    points,
    ({ switchPast, control, approach, events }) => {
      // GO's ticks, then the road position's next event after `road`: its next unit of advance, the next point, or the
      // next turn or reset.
      while (control(options.go));
      for (let road = options.go, units = 1; ;) {
        const advances = options.go + units * unit;
        const { point, turn, reset } = events();
        road = Math.min(advances, ...[point, turn, reset].filter((p) => p > road));
        if (road > options.end) break;
        // A tick reaching `road`: its control, and where a unit of advance comes, every object's approach by it.
        switchPast((r) => r < road);
        control(road);
        if (road === advances) {
          units++;
          approach(road, 1);
        }
        // The ticks on from it, as the road position passes it.
        switchPast((r) => r <= road);
        while (control(road));
      }
    },
    options,
  );
}

/** The objects a road shows as `roadObjects` and its tick versions run them, whatever their `stepping`. */
export function runRoadObjects(
  main: Uint8Array,
  points: readonly SceneryPoint[],
  stepping: (run: RoadObjectsRun) => void,
  options: RoadObjectsOptions,
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
    if (grantsTime(main, use.routine)) checkpoints.push(position);
    if (position >= options.end) return;
    const size = objectSize(main, use);
    // What lies wholly below the ground is never seen: not placed.
    if (liesBelowGround(y, size.height * routine.pixelUnits)) return;
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
        : (x >= 0 && !(apart && keepsLeftWhenApart(main, use.routine)) ? road + x : x - road) +
          (standsByEdge(main, use)
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
      hit: routineHits(main, use.routine) && !y && right > left ? Math.min(width, right - left) : null,
      width,
      shades: liftedUse(use, lift).shadows,
    });
  };

  // What an object does when it passes the car.
  // An object of its own takes none of the scenery's slots.
  type Live = { depth: number; half: boolean; ownSlot?: boolean; stands: (position: number) => void };
  const live: Live[] = [];
  let dropped = 0;
  const ended = { objects: 0, solid: 0 };
  const start = { passing: 0, sized: 0 };
  for (const o of options.starts) {
    const use = {
      sprite: o.sprite,
      ...(o.frame !== undefined ? { frame: o.frame } : {}),
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
      ...(o.ownSlot ? { ownSlot: true } : {}),
      stands: (position) => {
        start[position <= sized ? 'passing' : 'sized']++;
        place(use, Math.min(position, sized), o.x, o.y, (o.flags & 4) !== 0, true);
      },
    });
  }

  // The points in their order, taken by the original's pointer (`movea.l $60A00.l, a0` at M 0x3C04).
  const taken = points;
  const stretchOf = (position: number) => options.resets.filter((r) => r <= position).length;
  const stretchStart = (k: number) => (k === 0 ? options.go : options.resets[k - 1]!);
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
      if (shown && routineHits(main, shown.routine) && !e.y && right > left) ended.solid++;
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
      for (const depth of appears) {
        const carry = (running.pattern & 0x8000) !== 0;
        running.pattern = ((running.pattern << 1) | (carry ? 1 : 0)) & 0xffff;
        if (!carry || running.count === 0) continue;
        running.count--;
        running.entry = running.entry - 8 < 0 ? running.entries.last : running.entry - 8;
        const e = running.entries.entries[running.entry / 8]!;
        if (live.filter((o) => !o.ownSlot).length >= slots) {
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
  // 4. Every object approaches by `advance`; one reaching line 512 passes the car at `road`.
  const approach = (road: number, advance: number) => {
    for (let i = live.length - 1; i >= 0; i--) {
      const o = live[i]!;
      o.depth = approached(main, APPROACH, o.depth, advance, o.half);
      if (o.depth >>> 16 < passes) continue;
      o.stands(road);
      live.splice(i, 1);
    }
  };
  stepping({
    switchPast,
    control,
    approach,
    events: () => ({
      point: taken[next]?.position ?? Infinity,
      turn: running && running.count > 0 ? stretchStart(stretch) + Math.ceil(running.cursor - 1e-9) : Infinity,
      reset: options.resets[stretch] ?? Infinity,
    }),
  });
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
