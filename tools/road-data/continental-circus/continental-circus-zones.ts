/**
 * CONTINENTAL CIRCUS's zones ([CONTINENTAL CIRCUS road data](../../../docs/continental-circus-road-data.md#its-zones)):
 * each lap's zones as the stream task keeps them, and the attribute words a zone's kind gives a line's parts, each found
 * by the instructions that read it.
 */
import { instruction, s8, sword, word } from '../cpu/program-words.js';
import { contractUnmet, romDiffers } from '../shared/conversion-errors.js';
import { COMMAND, type ContinentalCircusLap } from './continental-circus-road.js';
import { GROUP } from './continental-circus-road-colors.js';

/** A line's parts: its left edge, its body and its right edge. */
export type LinePart = 'left' | 'body' | 'right';

/**
 * A part's attribute word as the TC0150ROD reads it (MAME's description of the chip): its group, bits 11 and 12, and
 * whether its edge draws the ground beyond it, bit 15.
 */
export interface Attribute {
  readonly group: number;
  readonly ground: boolean;
}

const attributeOf = (w: number): Attribute => ({ group: (w >> 11) & 3, ground: (w & 0x8000) !== 0 });

/**
 * The sub program's attribute words of a line, by their offsets in its line buffer, as the main program ORs them into
 * road A's words (M 0x4E5C, 0x4E80, 0x4E84): 0x1800 its left edge's (word 0), 0x1802 its body's (word 2) and 0x1804 its
 * right edge's (word 1).
 */
const PARTS: Readonly<Record<number, LinePart>> = { 0x1800: 'left', 0x1802: 'body', 0x1804: 'right' };

/** The table of the zones' kinds' handlers (S 0x3092) and the end of each, the next line (S 0x30EE). */
const [KINDS_TABLE, NEXT_LINE] = [0x3092, 0x30ee];
/** The kinds the table holds, 0 to 7. */
const KINDS = 8;

/**
 * A zone's attributes by its kind: open road's words (S 0x26EE to 0x26FA, its edges' and its body's groups `GROUP`'s),
 * each part a kind's handler sets in its line buffer (S 0x3092 to 0x30EE) taking its word, `move.w #word` or `clr.w`
 * (word 0), the rest kept. The handler is the table's word at S 0x3092 + twice the kind, from S 0x3092 (S 0x3088 to
 * 0x308E), the kind doubled as a word so that its bit 15 (0x8003, 0x8007) drops.
 */
export function zoneAttributes(main: Uint8Array, sub: Uint8Array) {
  instruction(main, 0x4e5c, [0x8468, 0x1802], "road A's body word's attributes (or.w)");
  instruction(main, 0x4e80, [0x8068, 0x1800, 0x8c68, 0x1804], "road A's edge words' attributes (or.w)");
  const [right, left, body] = instruction(
    sub,
    0x26ee,
    [0x317c, null, 0x1804, 0x317c, null, 0x1800, 0x317c, null, 0x1802],
    "open road's attribute words (move.w)",
  );
  const open = { left: attributeOf(left), body: attributeOf(body), right: attributeOf(right) };
  if (open.left.group !== GROUP.edge || open.right.group !== GROUP.edge || open.body.group !== GROUP.body)
    throw romDiffers("Open road's attribute words do not give its edges' and its body's groups");
  instruction(sub, 0x3082, [0xe74b, 0x49f1, 0x3000], "a zone's line's words, 8 bytes a line (lsl.w #3, lea)");
  instruction(sub, 0x3088, [0xd844, 0x383b, 0x4006, 0x4efb, 0x4002], "a zone's kind's handler (add.w, move.w, jmp)");
  instruction(sub, NEXT_LINE, [0x508c, 0x51ca], "a zone's next line (addq.l #8, dbra)");
  const kinds = Array.from({ length: KINDS }, (_, kind) => {
    const words = { ...open };
    let a = KINDS_TABLE + sword(sub, KINDS_TABLE + 2 * kind);
    while (a !== NEXT_LINE) {
      const op = word(sub, a);
      const [value, offset, size] =
        op === 0x397c ? [word(sub, a + 2), word(sub, a + 4), 6] : op === 0x426c ? [0, word(sub, a + 2), 4] : [];
      if (size !== undefined && PARTS[offset!] !== undefined) {
        words[PARTS[offset!]!] = attributeOf(value!);
        a += size;
      } else if ((op & 0xff00) === 0x6000 && a + 2 + s8(sub, a + 1) === NEXT_LINE) break;
      else throw romDiffers(`Zone kind ${kind}'s handler at 0x${a.toString(16)} is not a part's word`);
    }
    return Object.freeze(words);
  });
  return {
    open: Object.freeze(open),
    of: (kind: number) => {
      const k = kind & 0x7fff;
      if (k >= KINDS) throw romDiffers(`Zone kind 0x${kind.toString(16)} lies beyond its table`);
      return kinds[k]!;
    },
  };
}

/** A zone of a lap: from and to positions from the lap's line, and its kind. */
export interface Zone {
  readonly from: number;
  readonly to: number;
  readonly kind: number;
}

/**
 * A lap's zones (`continentalCircusLap`), as the zone handler keeps them (S 0xC28A to 0xC2C4): each zone record's kind,
 * its argument's high word, from its record's place (its running position + 0x7FFF, as a thing's), its argument's low
 * word long; one that starts within the last one, by its end, extends that one to its own end, the last one's kind
 * kept (S 0xC29E to 0xC2A8). Each lies within its lap.
 */
export function lapZones(sub: Uint8Array, lap: ContinentalCircusLap): Zone[] {
  instruction(sub, 0xc28e, [0x2c03, 0x0686, 0x0000, 0x7fff], "a zone's place (move.l, addi.l)");
  instruction(sub, 0xc29e, [0xbcb2, 0x00f6, 0x6e06, 0x0440, 0x0010], 'a zone extending the last (cmp.l, bgt, subi.w)');
  instruction(sub, 0xc2b2, [0x35a8, 0x0004, 0x0000], "a zone's kind, its argument's high word (move.w)");
  instruction(sub, 0xc2ba, [0x3428, 0x0006, 0xdc82, 0x2586, 0x0006], "a zone's end, its length on (move.w, add.l)");
  const zones: { from: number; to: number; kind: number }[] = [];
  for (const r of lap.records.filter((x) => x.command === COMMAND.zone)) {
    const [kind, length] = [r.argument >>> 16, r.argument & 0xffff];
    const last = zones.at(-1);
    if (last && r.at <= last.to) last.to = r.at + length;
    else zones.push({ from: r.at, to: r.at + length, kind });
  }
  if (zones.some((z) => z.to > lap.length)) throw contractUnmet("A zone runs past its lap's line");
  return zones.map((z) => Object.freeze(z));
}
