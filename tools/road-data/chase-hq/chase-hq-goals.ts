/**
 * CHASE H.Q.'s goals, run on its code ([Rules of the originals](../../../docs/original-road-data.md#rules-of-the-originals)):
 * where the original's time runs out, the criminal's position when both of the player's times are spent, the player flat
 * out without turbo on the road the stage's arrow names. The main program's own routines run tick by tick on
 * `cpu-68000`: the player's speed and advance, the camera that streams the chase road, the criminal's speed and
 * advance, its sighting and the time; this module sets only the stage's start and the inputs.
 */
import { Cpu68000 } from '../cpu/cpu-68000.js';

/** The goals the run gives, metres from each stage's start, stages 1 to 5. */
export const CHASE_HQ_GOALS: readonly number[] = Object.freeze([9767, 9990, 10013, 10025, 9990]);
/** The player's top speed flat out on level road, and the tick its speed last rises from a standing start. */
export const TOP_SPEED = 494;
export const TOP_SPEED_TICK = 1847;

/** A position unit, metres: the shown km/h (speed × 166/256) at 60.056 ticks a second. */
export const UNIT_METRES = 166 / (3.6 * 256 * 60.056);

/** The main CPU's work RAM and the RAM it shares with the sub CPU, where A5 points. */
const RAM = 0x100000;
const SHARED = 0x108000;
/** The player's car, the camera, the criminal's car (A3), and the player's control block (A4). */
const PLAYER = 0x10a040;
const CAMERA = 0x10a000;
const CRIMINAL = 0x10a080;
const CONTROL = 0x100300;
/** The player's speed routines in a tick, in order: target, grade, revolutions, off the road, speed, store, advance. */
const SPEED = [0x84e8, 0x8592, 0x85d8, 0x85f4, 0x86b4, 0x8700, 0x8a76, 0x8ab8];
/** The routines the run skips, for hardware it does not need: the sound, the voice and the time's display. */
const SKIP = new Set([0xa786, 0x5430, 0x2116]);
/** The player's lateral on the right road and on the left, held each tick so that it takes that branch at a fork. */
const RIGHT = 0x8250;
const LEFT = 0x7db0;

/** The main program running with its RAMs, read and written by address. */
function machine(main: Uint8Array) {
  const [ram, shared] = [new Uint8Array(0x8000), new Uint8Array(0x4000)];
  const cpu = new Cpu68000(main, ram, RAM, [{ start: SHARED, bytes: shared }]);
  const at = (address: number): [Uint8Array, number] =>
    address >= SHARED ? [shared, address - SHARED] : [ram, address - RAM];
  const write = (address: number, size: number, value: number) => {
    const [bytes, o] = at(address);
    for (let i = 0; i < size; i++) bytes[o + i] = (value >>> (8 * (size - 1 - i))) & 0xff;
  };
  const read = (address: number, size: number) => {
    const [bytes, o] = at(address);
    let value = 0;
    for (let i = 0; i < size; i++) value = value * 256 + bytes[o + i]!;
    return value;
  };
  const call = (routine: number, a3?: number) => {
    if (a3 !== undefined) cpu.a[3] = a3;
    cpu.a[4] = CONTROL;
    cpu.call(routine, { a5: SHARED, skip: SKIP });
  };
  // The speed tables as the stage's start copies them (0x7B58), the pedal full in high gear, the steering centred, and
  // the last input word unlike it, with no gear change.
  main.subarray(0xaece, 0xaece + 0xf0).forEach((b, i) => write(0x100310 + i, 1, b));
  write(CONTROL, 4, 0x3e00);
  write(CONTROL + 6, 2, 0x2000);
  return { write, read, call, shared };
}

/** The player's top speed on level road and the tick its speed last rises, its speed routines alone run. */
export function topSpeed(main: Uint8Array) {
  const m = machine(main);
  m.write(0x100200, 1, 0x60); // the time running
  m.write(PLAYER + 4, 2, 0x8000); // the car at the road's centre,
  m.write(PLAYER + 0x1c, 4, 0x74708b90); // on mask 0x7E's road, the record under it level (all 0)
  let [top, rise] = [-1, 0];
  for (let t = 1; t <= 2 * TOP_SPEED_TICK; t++) {
    for (const routine of SPEED) m.call(routine, PLAYER);
    const speed = m.read(PLAYER + 0x10, 2);
    if (speed > top) [top, rise] = [speed, t];
  }
  return { top, rise };
}

const metres = (units: number) => Math.round(units * UNIT_METRES);
/** The criminal's lead below which it is caught: its close band, where its speed follows the player's (0x4C86). */
const CLOSE = 0x300;

/** No stage's time runs out later than this tick. */
const MOST_TICKS = 12000;

/**
 * The goal of stage `stage` (0 to 4): the criminal's position, metres, when the second time runs out, the player on the
 * arrow's road, the right branch in stage 1 and the left in the others (path 0 where the arrow falls at random); with
 * where the player sights the criminal and where it catches it (metres). Within a tick the player's routines run before
 * the criminal's, which of the two the program's scheduler runs first being inferred.
 */
export function goal(main: Uint8Array, stage: number) {
  const m = machine(main);
  const lateral = stage === 0 ? RIGHT : LEFT;
  // The stage's start as the program leaves it (0x7ACC, 0x4776): its approach's plan in the shared RAM, the switches
  // as the factory sets them (Medium, 60 s), the stage, the camera's distance, the player at its start.
  m.shared.set(main.subarray(0x20030 + stage * 0x1000, 0x20030 + (stage + 1) * 0x1000), 0x1000);
  m.write(0x100141, 1, 0xff);
  m.write(0x10012c, 2, stage);
  m.write(0x10012e, 2, 0);
  m.write(0x10800a, 4, 0x80);
  m.write(CAMERA + 0x19, 1, stage);
  m.write(PLAYER + 0x19, 1, stage);
  m.write(PLAYER, 4, 0x80);
  m.write(PLAYER + 4, 2, lateral);
  m.write(PLAYER + 8, 1, 1);
  m.write(CAMERA + 4, 2, lateral);
  m.call(0x7a90); // the time
  m.write(0x10019e, 2, 0xffff); // the time running
  m.call(0x500c, CRIMINAL); // the criminal's start
  m.call(0x8124, PLAYER); // the lane edges
  m.call(0x8124, CAMERA);
  let [sighted, reached]: (number | null)[] = [null, null];
  for (let t = 1; t <= MOST_TICKS; t++) {
    // The frame counters the interrupt steps, the criminal's routines on odd frames.
    m.write(0x108004, 4, (m.read(0x108004, 4) - 1) >>> 0);
    m.write(0x108000, 4, (m.read(0x108000, 4) + 1) >>> 0);
    for (const routine of SPEED) m.call(routine, PLAYER);
    m.call(0x29c6, PLAYER); // the advance along the road and its records
    m.call(0x8124, PLAYER);
    m.write(PLAYER + 4, 2, lateral);
    m.call(0x7e70); // the camera, streaming the chase road
    m.call(0x4eec); // the criminal's speed and advance
    m.call(0x4e62, CRIMINAL);
    if (m.read(0x108007, 1) & 1) {
      if (m.read(0x1002b8, 2))
        m.call(0x4bf6, CRIMINAL); // keeping the player's pace
      else {
        m.call(0x4c36, CRIMINAL);
        m.call(0x4cc6, CRIMINAL);
      }
    }
    m.call(0x4a44, CRIMINAL); // its sighting, which gives the time again
    m.call(0x1abe); // the time
    const lead = m.read(CRIMINAL, 4) - m.read(PLAYER, 4);
    if (sighted === null && m.read(0x1002d2, 2)) sighted = m.read(PLAYER, 4);
    if (reached === null && lead < CLOSE) reached = m.read(PLAYER, 4);
    if (m.read(0x10020a, 2) === 0xffff)
      return { goal: metres(m.read(CRIMINAL, 4)), sighted: metres(sighted!), reached: metres(reached!) };
  }
  throw new Error(`Stage ${stage + 1}'s time runs past ${MOST_TICKS} ticks`);
}
