/**
 * CISCO HEAT's skies ([CISCO HEAT road data](../../../docs/cisco-heat-road-data.md#its-skies)): the JALECO board's
 * (`jaleco/ms1-skies`), read where its programs hold them, each plane turning at one rate (K, 2026-11-12).
 */
import { instruction, long } from '../cpu/program-words.js';
import type { BoardSkies } from '../jaleco/ms1-skies.js';

/** The stages. */
export const STAGES = 5;

/**
 * The radius of the curves its roads turn through longest, positions: 40,000 (648 m), a fifth of all its stages'
 * curves' length on either road. Its planes turn by it at one rate.
 */
export const TURN_RADIUS = 40_000;

/**
 * The pixels each plane turns a turn, [back, front]: its program slides a plane only through a curve, by a rate of the
 * car's speed toward a limit of it (M 0xA454: its table from the `lea` at 0xA486, 8 bytes an index, the limit at +4, a
 * 16.16 number of pixels a frame; the index twice the speed's whole units, at most the `cmpi.w` at 0xA474's), each frame
 * the front by the limit's whole pixels and the back by half of them (M 0xA39C; 0xA7B4, its `asr.w #1` at 0xA7BA): 15
 * and 7 one way and 16 and 8 the other at the top speed (the `move.l` at M 0x31B8, 160 units), each plane taken at their
 * mean. A plane turns as many pixels a radian as it slides while the car turns one through a curve of `TURN_RADIUS`
 * at the top speed: its pixels a frame × the radius ÷ the speed.
 */
export function planeTurns(main: Uint8Array): readonly [number, number] {
  const [disp] = instruction(main, 0xa486, [0x43fa, null], "the planes' slide (lea pc)");
  const table = 0xa488 + ((disp << 16) >> 16);
  const [last] = instruction(main, 0xa474, [0x0c41, null], "the slide's last index (cmpi.w)");
  const [high, low] = instruction(main, 0x31b8, [0x243c, null, null], 'the top speed (move.l)');
  instruction(main, 0xa7ba, [0xe240], "the back's half (asr.w #1)");
  const top = (high * 0x10000 + low) / 0x10000;
  const limit = long(main, table + 8 * Math.min(Math.floor(2 * top), last) + 4) / 0x10000;
  const [ahead, back] = [Math.floor(limit), Math.floor(-limit)];
  const pixels = [(Math.floor(ahead / 2) - Math.floor(back / 2)) / 2, (ahead - back) / 2] as const;
  return [0, 1].map((plane) => (2 * Math.PI * pixels[plane]! * TURN_RADIUS) / top) as unknown as readonly [
    number,
    number,
  ];
}

/**
 * Where CISCO HEAT's programs read its skies: plane 0's scenes from M 0xA600 (their records' size at 0xA62E), plane 1's
 * from 0xA1A6 (0xA230); the planes' tile words at 0xA0000 and 0xA8000; each plane's turn (`planeTurns`); the sky's rows
 * from the second road CPU's table (R2 0x1B80, the first's the same).
 */
export const ciscoHeatSkies = (main: Uint8Array): BoardSkies =>
  Object.freeze({
    scenes: Object.freeze([0xa600, 0xa1a6] as const),
    sizes: Object.freeze([0xa62e, 0xa230] as const),
    planeRam: Object.freeze([0xa0000, 0xa8000] as const),
    turn: planeTurns(main),
    rows: 0x1b80,
  });
