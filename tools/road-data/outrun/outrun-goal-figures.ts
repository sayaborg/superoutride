/**
 * The figures after OUTRUN's goals ([OUTRUN road data](../../../docs/outrun-road-data.md#the-figures-after-the-goals)):
 * who stands before the stopped camera at the last tick of each goal's scene, as the program at 0x5B42 runs them, and
 * where they stand on a road.
 */
import { instruction, long, word } from '../sega-16/program-words.js';
import { boardName, type SpriteUse } from './outrun-boards.js';
import type { ObjectPlacement } from './outrun-scenery.js';
import { objectSize, spriteOfFrame } from './outrun-sprites.js';
import { paletteName } from '../shared/pixel-grid.js';

/**
 * A goal stretch's road position the camera stops at: braking from 0x163 (0xA15E), it stops on reaching this
 * (`cmpi.w #$191, $260006` and `bge` at 0xA1C2).
 */
export function readGoalStop(main: Uint8Array): number {
  const [stop] = instruction(main, 0xa1c2, [0x0c79, null, 0x0026, 0x0006, 0x6c00], "the goal's stop (cmpi.w #$191)");
  return stop!;
}

/** The figures' routine: each a frame on its bottom middle, a pixel 1 road unit, casting its shadow object's. */
const FIGURES = 0x5b42;

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
function readSecondHalves(main: Uint8Array): ReadonlyMap<number, { readonly id: number; readonly lists: number }> {
  const halves = new Map<number, { id: number; lists: number }>();
  for (let at = SECOND_HALVES; word(main, at) === 0x0c2d;) {
    const [object, next, id] = instruction(
      main,
      at,
      [0x0c2d, null, 0x0006, 0x6600, null, 0x1b7c, null, 0x0006],
      'a second half',
    );
    let test = at + 16;
    while (word(main, test) === 0x0c79) {
      instruction(main, test, [0x0c79, null, 0x0006, 0x0be8, 0x6700, null], "a second half's goal");
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
    halves.set(object!, { id: id!, lists: high! * 0x10000 + low! });
    at += 8 + ((next! << 16) >> 16);
  }
  return halves;
}
const SECOND_HALVES = 0x5db4;

/**
 * Each figure's animation by goal, two longs at its table + 8g (its lists now and next), by object: the man (4), the
 * woman (6), the third's first half (8) and the effect's (10); at goal 4 a ninth figure (9), else the third's shadow.
 * The car, its door and its inside (0x124B0, 0x124D8, 0x12500) are not figures; the second halves' are their own.
 */
const LISTS: ReadonlyMap<number, number> = new Map([
  [4, 0x12528],
  [6, 0x12550],
  [8, 0x12578],
  [9, 0x12618],
  [10, 0x125a0],
]);
/** The goal whose ninth object is a figure (0x5A62); elsewhere it is the third's shadow. */
const NINTH_FIGURE_GOAL = 4;
/** Each figure's shadow, its own object (0x5C48) after it: the man's 5, the woman's 7, the third's 9. */
const SHADOWS: ReadonlyMap<number, number> = new Map([
  [4, 5],
  [6, 7],
  [11, 9],
]);

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
  /** Whether it casts the figures' shadow: its shadow's object runs at the last tick (none for goal 4's third). */
  readonly shadow: boolean;
}

/**
 * Goal `g`'s figures at its scene's last tick. Each object runs from its first tick to its last: at its first it takes
 * its list's first block; each tick it shows its block, counting down the block's ticks, and then takes the next block,
 * or the next list's first after its list's last. At its last tick objects 8 and 10 become 11 and 12, taking their own
 * lists from their own first ticks. An 8-byte block is {u8 palette, u8 bit 7 x negative and bits 0–3 the frame's high
 * bits, word the frame's low bits, u8 x, s8 y, u8 depth, u8 bit 7 the list's last, bit 6 mirrored, bits 0–5 ticks}.
 */
export function goalFigures(main: Uint8Array, g: number): GoalFigure[] {
  const clock = readSceneClock(main);
  const halves = readSecondHalves(main);
  const length = word(main, clock.lengths + 2 * g);
  const table = (id: number) => [...halves.values()].find((half) => half.id === id)?.lists ?? LISTS.get(id)!;
  const lists = (id: number) => ({ list: long(main, table(id) + 8 * g), next: long(main, table(id) + 8 * g + 4) });
  const times = (id: number) =>
    [word(main, clock.times + 20 * id + 4 * g), word(main, clock.times + 20 * id + 4 * g + 2)] as const;
  const objects = [4, 6, 8, ...(g === NINTH_FIGURE_GOAL ? [9] : []), 10].map((id) => ({
    id,
    ...lists(id),
    block: 0,
    left: 0,
  }));
  const shadowed = (id: number, tick: number) => {
    const shadow = SHADOWS.get(id);
    if (shadow === undefined || (shadow === 9 && g === NINTH_FIGURE_GOAL)) return false;
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
        Object.assign(o, { id: second.id, ...lists(second.id), block: 0 });
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
          shadow: shadowed(o.id, tick),
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
  const sprite = spriteOfFrame(main, figure.frame);
  return {
    sprite: sprite ?? -1,
    ...(sprite === null ? { frame: figure.frame } : {}),
    mirrored: figure.mirrored,
    anchor: 8,
    routine: FIGURES,
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
        image: boardName(use),
        palette: paletteName(figure.palette),
        hit: null,
        width: objectSize(main, use).width,
        shades: false,
      };
    });
  });
}
