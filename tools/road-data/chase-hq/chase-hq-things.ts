/**
 * CHASE H.Q.'s things as its main program draws them ([CHASE H.Q. road data](../../../docs/chase-hq-road-data.md),
 * [research notes](../../../docs/research/chase-hq.md#things)): a thing of kind k is the list its kind table names
 * (0x4A602, a long a kind), drawn by the composer its kind's class picks (k >> 6, the jump table at M 0x40EDA): a header
 * of four words (its x offset's row, its flips, its height's row, its first sprite's sprite), with some composers that
 * first sprite at the header's place, then the count less one of its pieces, each its y and x offsets' rows, its sprite
 * and, by its composer, a control word (its zoom fixed across where bit 0 is clear, down where bit 1 is, and its high
 * twelve bits an x offset in pixels), its color and its flips. An offset's row is the value at a zoom by the program's
 * tables (words at 0x62494, a row's word at zoom z at the row's index plus 2z; bytes at 0x5C414, at the row plus z);
 * at zoom 0x7F a sprite is drawn at its full size. Each sprite is 128 × 128 pixels at its full size, its top at the
 * thing's point on the ground less 128 pixels and its height's value, its left at the point less its x offset's.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';

/** The zoom at which a sprite is drawn at its full size, and the pixels a sprite spans then. */
const FULL = 0x7f;
const SPRITE = 128;

/** A piece of a thing at its full size: its sprite, its top left (pixels from the thing's point on the ground, down positive), its palette line, its flips and the axes its zoom is fixed on. */
export interface ChaseHqPiece {
  readonly sprite: number;
  readonly x: number;
  readonly y: number;
  readonly line: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly fixedAcross: boolean;
  readonly fixedDown: boolean;
}

/** How a composer reads a thing's pieces: its piece's bytes and the offsets of its fields, and whether it draws the header's sprite. */
interface Composer {
  readonly at: number;
  readonly loop: number;
  readonly bytes: number;
  readonly first: boolean;
  readonly control?: number;
  readonly color?: number;
  readonly flips?: number;
}

/** The composers CHASE H.Q.'s placed things use, by their entry: each its piece loop's step (`lea.l $n(a3), a3`). */
const COMPOSERS: readonly Composer[] = Object.freeze([
  { at: 0x440ec, loop: 0x4439e, bytes: 6, first: true },
  { at: 0x443aa, loop: 0x44634, bytes: 8, first: false, flips: 6 },
  { at: 0x44640, loop: 0x44918, bytes: 8, first: true, color: 6 },
  { at: 0x44924, loop: 0x44c92, bytes: 8, first: true, control: 6 },
  { at: 0x44f8a, loop: 0x4518c, bytes: 6, first: true },
  { at: 0x45198, loop: 0x45520, bytes: 10, first: false, control: 6, flips: 8 },
  { at: 0x4552c, loop: 0x45824, bytes: 8, first: true, control: 6 },
  { at: 0x45830, loop: 0x45b48, bytes: 10, first: false, control: 6, color: 8 },
  { at: 0x45ea4, loop: 0x46164, bytes: 12, first: false, control: 6, color: 8, flips: 10 },
]);

const long = (p: Uint8Array, a: number) => word(p, a) * 0x10000 + word(p, a + 2);
const s16 = (v: number) => (v << 16) >> 16;
const s8 = (v: number) => (v << 24) >> 24;

/** The main program's tables for its things, each found by the instruction that reads it. */
function tables(main: Uint8Array) {
  const [dispatchHigh, dispatchLow] = instruction(
    main,
    0x40eca,
    [0x4df9, null, null],
    "the composers' jump table (lea)",
  );
  instruction(main, 0x40ed0, [0x0241, 0x07c0, 0xe849, 0x4ef6, 0x1000], "a kind's composer (andi.w, lsr.w, jmp)");
  const operand = (at: number, opcode: number, what: string) => {
    const [high, low] = instruction(main, at, [opcode, null, null], what);
    return high * 0x10000 + low;
  };
  const kinds = operand(0x4598a, 0x4df9, "the things' lists (lea)");
  const words = operand(0x45a22, 0x4df9, "the offsets' words by zoom (lea)");
  const bytes = operand(0x459bc, 0x4df9, "the offsets' bytes by zoom (lea)");
  const attributes = operand(0x8f34, 0x287c, "the kinds' attributes (movea.l)");
  for (const c of COMPOSERS) instruction(main, c.loop, [0x47eb, c.bytes], "a composer's piece (lea.l $n(a3), a3)");
  const dispatch = dispatchHigh * 0x10000 + dispatchLow;
  /** The composer kind `kind`'s class branches to (bra.w), by its entry. */
  const composerOf = (kind: number) => {
    const at = dispatch + 4 * ((kind & 0x7c0) >> 6);
    const [displacement] = instruction(main, at, [0x6000, null], "a class's composer (bra.w)");
    const entry = at + 2 + s16(displacement);
    const composer = COMPOSERS.find((c) => c.at === entry);
    if (!composer) throw romDiffers(`Kind 0x${kind.toString(16)}'s composer 0x${entry.toString(16)} is not read`);
    return composer;
  };
  return { kinds, words, bytes, attributes, composerOf };
}

/**
 * The things of kinds `kinds` at their full size: each kind's pieces in the order its composer draws them (the first
 * drawn last in the sprite list, over those after it), its first sprite where its composer draws one.
 */
export function chaseHqThings(main: Uint8Array) {
  const t = tables(main);
  const wordAt = (row: number) => s16(word(main, t.words + s16((row + 2 * FULL) & 0xffff)));
  const byteAt = (row: number) => s8(main[t.bytes + ((row + FULL) & 0xffff)]!);
  return (kind: number): readonly ChaseHqPiece[] => {
    const c = t.composerOf(kind);
    const at = long(main, t.kinds + 4 * kind) & 0xffffff;
    const [xRow, flips, heightRow, first] = [0, 1, 2, 3].map((k) => word(main, at + 2 * k)) as [
      number,
      number,
      number,
      number,
    ];
    const [left, top] = [-byteAt(xRow), -SPRITE + (heightRow ? byteAt(heightRow) : 0)];
    const attribute = word(main, t.attributes + 2 * kind);
    const lineOf = (color: number) => (color >> 7) & 0xff;
    const piece = (sprite: number, x: number, y: number, color: number, flip: number, control: number | null) => ({
      sprite: sprite & 0x7ff,
      x,
      y,
      line: lineOf(color),
      flipX: (flip & 0x4000) !== 0,
      flipY: (flip & 0x8000) !== 0,
      fixedAcross: control !== null && !(control & 1),
      fixedDown: control !== null && !(control & 2),
    });
    const out: ChaseHqPiece[] = [];
    if (c.first) out.push(piece(first, left, top, attribute, flips, null));
    const count = s16(word(main, at + 8));
    for (let n = 0; n <= count; n++) {
      const p = at + 10 + c.bytes * n;
      const control = c.control === undefined ? null : word(main, p + c.control);
      out.push(
        piece(
          word(main, p + 4),
          left + wordAt(word(main, p + 2)) + (control === null ? 0 : s16(control & 0xfff0)),
          top + wordAt(word(main, p)),
          c.color === undefined ? attribute : word(main, p + c.color),
          c.flips === undefined ? flips : word(main, p + c.flips),
          control,
        ),
      );
    }
    return out;
  };
}
