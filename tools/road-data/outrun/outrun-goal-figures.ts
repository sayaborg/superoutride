/**
 * The figures after OUTRUN's goals ([OUTRUN road data](../../../docs/outrun-road-data.md#the-figures-after-the-goals)):
 * who stands before the stopped camera at the last tick of each goal's scene, as the program at 0x5B42 runs them, and
 * where they stand on a road.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { instruction, long, word } from '../sega-16/program-words.js';
import { boardName, type SpriteUse } from './outrun-boards.js';
import type { ObjectPlacement } from './outrun-scenery.js';
import { frameShown, objectSize } from './outrun-sprites.js';
import { paletteName } from '../shared/pixel-grid.js';

/**
 * A goal stretch's road position the camera stops at: braking from 0x163 (0xA15E), it stops on reaching this
 * (`cmpi.w #$191, $260006` and `bge` at 0xA1C2).
 */
export function readGoalStop(main: Uint8Array): number {
  const [stop] = instruction(main, 0xa1c2, [0x0c79, null, 0x0026, 0x0006, 0x6c00], "the goal's stop (cmpi.w #$191)");
  return stop!;
}

/**
 * The scene's clock: each object's {word first tick, word last tick} by goal, at a table + 20 × object + 4g (`lea.l
 * table, a0` and its index's shifts and adds at 0x5CC4), and its length by goal, ticks, at a table + 2g (`lea.l table,
 * a4` and its index at 0x5D0A).
 */
function readSceneClock(main: Uint8Array) {
  const [timesHigh, timesLow] = instruction(
    main,
    TIMES,
    [0x41f9, null, null, 0x3839, 0x0006, 0x0be8, 0xe544],
    "the goal objects' ticks",
  );
  const index = [0x4241, 0x122d, 0x0006, 0xe541, 0x3001, 0xe541, 0xd240, 0xd244];
  instruction(main, TIMES + 14, index, "the goal objects' ticks' index");
  const [lengthsHigh, lengthsLow] = instruction(
    main,
    SCENE_LENGTHS,
    [0x3839, 0x0006, 0x0be8, 0xd844, 0x49f9, null, null, 0x3834, 0x4000],
    "the goal scene's lengths",
  );
  return { times: timesHigh! * 0x10000 + timesLow!, lengths: lengthsHigh! * 0x10000 + lengthsLow! };
}
const TIMES = 0x5cc4;
const SCENE_LENGTHS = 0x5d0a;

/**
 * The objects that become others at their last tick, from 0x5DB4: each `cmpi.b #object, $6(a5); bne.w next; move.b
 * #other, $6(a5)`, the goals' tests that set its byte 7 (`cmpi.w #goal, $60be8.l; beq.w`) and their `bra.w` to its
 * lists, `move.w $60be8.l, d4; asl.w #3, d4; lea.l table, a6`, as the figures' tables are indexed; the next object's
 * test at `next`, up to an instruction that is not one.
 */
function readSecondHalves(main: Uint8Array): ReadonlyMap<number, SecondHalf> {
  const halves = new Map<number, SecondHalf>();
  for (let at = SECOND_HALVES; word(main, at) === 0x0c2d;) {
    const [object, next, id] = instruction(
      main,
      at,
      [0x0c2d, null, 0x0006, 0x6600, null, 0x1b7c, null, 0x0006],
      'a second half',
    );
    const byte7 = new Map<number, number>();
    let test = at + 16;
    while (word(main, test) === 0x0c79) {
      const [goal, set] = instruction(main, test, [0x0c79, null, 0x0006, 0x0be8, 0x6700, null], "a second half's goal");
      const [value] = instruction(main, test + 10 + ((set! << 16) >> 16), [0x1b7c, null, 0x0007], 'its byte 7');
      byte7.set(goal!, value! & 0xff);
      test += 12;
    }
    const [skip] = instruction(main, test, [0x6000, null], "a second half's lists");
    const lists = test + 2 + ((skip! << 16) >> 16);
    const [high, low] = instruction(
      main,
      lists,
      [0x3839, 0x0006, 0x0be8, 0xe744, 0x4df9, null, null],
      "a second half's lists",
    );
    halves.set(object!, { id: id!, lists: high! * 0x10000 + low!, byte7 });
    at += 8 + ((next! << 16) >> 16);
  }
  return halves;
}
const SECOND_HALVES = 0x5db4;
/** An object's second half: its number, its lists' table and its byte 7 by the goals that set it. */
interface SecondHalf {
  readonly id: number;
  readonly lists: number;
  readonly byte7: ReadonlyMap<number, number>;
}

/** An object the goal's scene sets up, as its slot's object at `offset`. */
interface SceneObject {
  readonly id: number;
  readonly slot: number;
  readonly offset: number;
  readonly routine: number;
  readonly anchor: number;
  /** Its animation's table: two longs at + 8g, its lists now and next. */
  readonly lists?: number;
  /** Whether it is a shadow, its setup naming its frame (`move.l #frame, $18`). */
  readonly shadow: boolean;
  /** The goal it is set up only at, or at every other. */
  readonly goal?: { readonly number: number; readonly only: boolean };
}

/**
 * The objects the goal's scene sets up (0x588A, `move.w $60be8.l, d4; asl.w #3, d4`, d4 8g), up to setting its own
 * routine (`move.l #routine, $2(a5)`): each slot's objects (`movea.l #$61800, a6; move.w slot.l, d0; asl.w #6, d0;
 * adda.w d0, a6`, 64 bytes each) made (`bset.b #7`) with their routine (`move.l #routine, $2`), number (`move.b #id,
 * $6`), anchor (`move.b #anchor, $9`), shadow's frame (`move.l #frame, $18`) and lists (`lea.l table, a4; move.l
 * (a4, d4.w), $1e; move.l $4(a4, d4.w), $22`); a goal's test (`cmpi.w #goal, $60be8.l; bne.w`) sets up the objects
 * before its `bra.w` at that goal only, and those after up to the branch's end at the others. Its own object's lists
 * (`move.l (a4, d4.w), $1e(a5)`), its other bytes and what it clears are not read.
 */
function readSceneObjects(main: Uint8Array): SceneObject[] {
  type Made = { -readonly [K in keyof SceneObject]: SceneObject[K] };
  const objects: Made[] = [];
  const made = new Map<number, Made>();
  const fail = (displacement: number): never => {
    throw romDiffers(`The goal's scene sets up no object at 0x${displacement.toString(16)} of its slot`);
  };
  const at = (displacement: number) => made.get(displacement & ~63) ?? fail(displacement);
  let slot = 0;
  let table = 0;
  let goal: { number: number; only: boolean; end: number } | undefined;
  instruction(main, SCENE_SETUP, [0x3839, 0x0006, 0x0be8, 0xe744], "the goal's scene's set-up");
  for (let p = SCENE_SETUP + 8; ;) {
    if (p === goal?.end) goal = undefined;
    const op = word(main, p);
    const operands = (expected: (number | null)[], what: string) => instruction(main, p, expected, what);
    if (op === 0x2c7c) {
      slot = operands([0x2c7c, 0x0006, 0x1800, 0x3039, 0x0000, null, 0xed40, 0xdcc0], 'a goal slot')[0]!;
      made.clear();
      p += 16;
    } else if (op === 0x08d6 || op === 0x08ee) {
      const [offset = 0] = operands(op === 0x08d6 ? [0x08d6, 0x0007] : [0x08ee, 0x0007, null], 'a goal object');
      const object: Made = { id: -1, slot, offset, routine: 0, anchor: 0, shadow: false };
      if (goal !== undefined) object.goal = { number: goal.number, only: goal.only };
      objects.push(object);
      made.set(offset, object);
      p += op === 0x08d6 ? 4 : 6;
    } else if (op === 0x2d7c) {
      const [high, low, displacement] = operands([0x2d7c, null, null, null], "a goal object's long");
      if (displacement! % 64 === 2) at(displacement!).routine = high! * 0x10000 + low!;
      else if (displacement! % 64 === 0x18) at(displacement!).shadow = true;
      else fail(displacement!);
      p += 8;
    } else if (op === 0x1d7c) {
      const [value, displacement] = operands([0x1d7c, null, null], "a goal object's byte");
      if (displacement! % 64 === 6) at(displacement!).id = value! & 0xff;
      if (displacement! % 64 === 9) at(displacement!).anchor = value! & 0xff;
      p += 6;
    } else if (op === 0x426e || op === 0x422e) p += 4;
    else if (op === 0x49f9) {
      const [high, low] = operands([0x49f9, null, null], "a goal object's lists");
      table = high! * 0x10000 + low!;
      p += 6;
    } else if (op === 0x2d74) {
      const [displacement, next] = operands([0x2d74, 0x4000, null, 0x2d74, 0x4004, null], "a goal object's lists");
      if (displacement! % 64 !== 0x1e || next !== displacement! + 4) fail(displacement!);
      at(displacement!).lists = table;
      p += 12;
    } else if (op === 0x2b74) {
      operands([0x2b74, 0x4000, 0x001e, 0x2b74, 0x4004, 0x0022], "the goal's scene's own lists");
      p += 12;
    } else if (op === 0x0c79) {
      const [number, skip] = operands([0x0c79, null, 0x0006, 0x0be8, 0x6600, null], "a goal's test");
      goal = { number: number!, only: true, end: p + 10 + ((skip! << 16) >> 16) };
      p += 12;
    } else if (op === 0x6000 && goal?.only === true) {
      const [skip] = operands([0x6000, null], "a goal's test's end");
      if (p + 4 !== goal.end) throw romDiffers(`The goal's test's branch at 0x${p.toString(16)} is not its end`);
      goal = { number: goal.number, only: false, end: p + 2 + ((skip! << 16) >> 16) };
      p += 4;
    } else {
      operands([0x2b7c, null, null, 0x0002], "the goal's scene's set-up");
      for (const o of objects) if (o.id < 0 || o.routine === 0) fail(o.offset);
      return objects;
    }
  }
}
const SCENE_SETUP = 0x588a;

/** A figure as the scene's last tick shows it. */
export interface GoalFigure {
  /** Its frame: the address of its size, 10 bytes as a size list's. */
  readonly frame: number;
  readonly palette: number;
  readonly mirrored: boolean;
  /** Road units right of the camera, and up. */
  readonly x: number;
  readonly y: number;
  /** Its line, 2 × its block's depth: drawn a pixel a road unit at a quarter of its scale. */
  readonly line: number;
  /** Its object's routine and anchor. */
  readonly routine: number;
  readonly anchor: number;
  /** Whether it casts the figures' shadow: its shadow's object runs at the last tick (none for goal 4's third). */
  readonly shadow: boolean;
  /**
   * Whether it is drawn with shadows allowed: its object's byte 7's bit 2, which the scene's set-up leaves clear and a
   * second half's goal test sets (7, 0x5DEC and 0x5E4C at goals 2 to 4).
   */
  readonly shadows: boolean;
}

/**
 * Goal `g`'s figures at its scene's last tick. Each object runs from its first tick to its last: at its first it takes
 * its list's first block; each tick it shows its block, counting down the block's ticks, and then takes the next block,
 * or the next list's first after its list's last. At its last tick objects 8 and 10 become 11 and 12, taking their own
 * lists from their own first ticks and, at the goals that set it, their byte 7. An 8-byte block is {u8 palette, u8 bit 7 x negative and bits 0–3 the frame's high
 * bits, word the frame's low bits, u8 x, s8 y, u8 depth, u8 bit 7 the list's last, bit 6 mirrored, bits 0–5 ticks}.
 */
export function goalFigures(main: Uint8Array, g: number): GoalFigure[] {
  const clock = readSceneClock(main);
  const halves = readSecondHalves(main);
  const length = word(main, clock.lengths + 2 * g);
  const setUp = readSceneObjects(main).filter(({ goal }) => goal === undefined || (goal.number === g) === goal.only);
  const lists = (table: number) => ({ list: long(main, table + 8 * g), next: long(main, table + 8 * g + 4) });
  const times = (id: number) =>
    [word(main, clock.times + 20 * id + 4 * g), word(main, clock.times + 20 * id + 4 * g + 2)] as const;
  const shadowOf = (o: SceneObject) =>
    setUp.find(({ shadow, slot, offset }) => shadow && slot === o.slot && offset === o.offset + 64)?.id;
  const objects = setUp
    .filter((o) => o.lists !== undefined && o.slot !== setUp[0]!.slot)
    .map((o) => ({ ...o, ...lists(o.lists!), shadowId: shadowOf(o), byte7: 0, block: 0, left: 0 }));
  const shadowed = (shadow: number | undefined, tick: number) => {
    if (shadow === undefined) return false;
    const [first, last] = times(shadow);
    return first <= tick && tick <= last;
  };
  const figures: GoalFigure[] = [];
  for (let tick = 0; tick < length; tick++)
    for (const o of objects) {
      const [first, last] = times(o.id);
      if (tick < first || tick > last) continue;
      if (tick === first) o.left = main[o.list + 7]! & 63;
      const second = halves.get(o.id);
      if (tick === last && second !== undefined) {
        Object.assign(o, { id: second.id, ...lists(second.lists), byte7: second.byte7.get(g) ?? o.byte7, block: 0 });
        continue;
      }
      const b = o.list + 8 * o.block;
      if (tick === length - 1)
        figures.push({
          frame: ((main[b + 1]! & 15) << 16) | word(main, b + 2),
          palette: main[b]!,
          mirrored: (main[b + 7]! & 0x40) !== 0,
          x: (main[b + 1]! & 0x80 ? -1 : 1) * main[b + 4]!,
          y: (main[b + 5]! << 24) >> 24,
          line: 2 * main[b + 6]!,
          routine: o.routine,
          anchor: o.anchor,
          shadow: shadowed(o.shadowId, tick),
          shadows: (o.byte7 & 4) !== 0,
        });
      if (--o.left > 0) continue;
      if (main[b + 7]! & 0x80) Object.assign(o, { list: o.next, block: 0 });
      else o.block++;
      o.left = main[o.list + 8 * o.block + 7]! & 63;
    }
  return figures;
}

/** How a figure shows its frame: as the sprite whose size list it starts, or as a frame of its own. */
export function figureUse(main: Uint8Array, figure: GoalFigure): SpriteUse {
  return {
    ...frameShown(main, figure.frame),
    mirrored: figure.mirrored,
    anchor: figure.anchor,
    routine: figure.routine,
    palette: figure.palette,
    shadow: figure.shadow,
  };
}

/**
 * The figures standing on a road after its goals, each goal `number`'s scene where its stretch begins at road position
 * `position`: where the car stops (`readGoalStop`), as far on as the original projects it at its line (`ahead`), across from the left road's centre there (the goal's driver keeps to the road
 * taken's centre on the straight) by its x and up by its y, with no body.
 */
export function goalFigurePlacements(
  main: Uint8Array,
  goals: readonly { readonly position: number; readonly number: number }[],
  road: {
    readonly go: number;
    readonly width: (position: number) => number;
    readonly ahead: (line: number) => number;
  },
): ObjectPlacement[] {
  const stop = readGoalStop(main);
  return goals.flatMap(({ position, number }) => {
    const camera = position + stop - road.go;
    const centre = -road.width(camera);
    return goalFigures(main, number).map((figure) => {
      const use = figureUse(main, figure);
      return {
        position: camera + road.go + road.ahead(figure.line),
        x: centre + figure.x,
        y: figure.y,
        image: boardName(main, use),
        palette: paletteName(figure.palette),
        hit: null,
        width: objectSize(main, use).width,
        shades: false,
      };
    });
  });
}
