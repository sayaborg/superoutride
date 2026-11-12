import { DEBRIS_PIECES, DEBRIS_WORDS, type ExplosionScript } from '../content/contact-explosion-pictures.js';
import { mix } from '../race/seed-mix.js';

/** A 16-bit word as signed. */
const signed = (v: number) => (v << 16) >> 16;

/** A piece of debris on a frame: its index and its place in units, across (right), along (forward) and up. */
export interface DebrisPiece {
  piece: number;
  across: number;
  along: number;
  up: number;
}

/** An explosion's random words from its 32-bit word `seed`: each piece's three, x, y and z, by a fixed draw. */
export function debrisWords(seed: number): Uint16Array {
  const words = new Uint16Array(DEBRIS_PIECES * DEBRIS_WORDS);
  for (let k = 0; k < words.length; k++) words[k] = mix(seed ^ Math.imul(k + 1, 0x9e3779b9)) >>> 16;
  return words;
}

/**
 * An explosion's debris on frame `frame` from its words (`debrisWords`), by its script's rule in the original's 16-bit
 * integers: the kth throw throws pieces k and k + 4, each from its three words; each piece thrown moves once a frame
 * after it, until the frame it is cleared at. Writes the live pieces into `out` and returns how many.
 */
export function debrisAt(script: ExplosionScript, words: Uint16Array, frame: number, out: DebrisPiece[]): number {
  const { thrown, cleared, rule } = script.debris;
  if (frame >= cleared) return 0;
  let count = 0;
  thrown.forEach((at, k) => {
    if (frame < at) return;
    for (const piece of [k, k + DEBRIS_PIECES / 2]) {
      const w = (axis: number) => words[piece * DEBRIS_WORDS + axis]!;
      const second = piece >= DEBRIS_PIECES / 2;
      // x either way, arithmetically; y away logically, the second piece's bit 15 set first, towards; z up.
      let vx = signed(signed(w(0)) >> rule.speed);
      let vy = second ? signed(signed(w(1) | 0x8000) >> rule.speed) : signed(w(1) >>> rule.speed);
      let vz = signed((w(2) >>> rule.speed) + rule.lift);
      let x = signed(vx >> rule.place);
      let y = second ? signed(vy >> rule.place) : signed((vy & 0xffff) >>> rule.place);
      let z = signed((vz & 0xffff) >>> rule.upPlace);
      for (let n = at; n < frame; n++) {
        let d = vx >> rule.step;
        x = signed(x + d);
        vx = signed(vx - (d >> rule.drag));
        d = vy >> rule.step;
        y = signed(y + d);
        vy = signed(vy - (d >> rule.drag));
        d = vz >> rule.step;
        z = signed(z + d);
        vz = signed(vz - (d >> rule.drag) - rule.gravity);
        if (z < 0) {
          z = signed(-z);
          if (rule.damped.includes(piece)) vz >>= rule.bounce;
          if (vz < 0) vz = signed(-vz);
        }
      }
      const slot = (out[count] ??= { piece: 0, across: 0, along: 0, up: 0 });
      slot.piece = piece;
      slot.across = x >> rule.unit;
      slot.along = y >> rule.unit;
      slot.up = z >> rule.unit;
      count++;
    }
  });
  return count;
}
