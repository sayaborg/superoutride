/**
 * OUTRUN's heights' procedure as its sub program runs it ([Original road data](../../../docs/original-road-data.md#hills)),
 * in its own integers: each tick the tables' state (S 0x1B12 to 0x1EFE) and the window it builds, the road's 512 line
 * words (S 0x1F00 to 0x2208); TURBO OUTRUN's sub program holds the same procedure 0xB4 lower. A table run is driven in
 * the limit of a speed falling to 0, its holds at the original's top speed ([Time made into position](../../../docs/original-road-data.md#time-made-into-position)).
 * Addresses are OUTRUN's.
 */
import { romDiffers } from '../conversion-errors.js';
import { phaseGains, phaseSteps, phaseUnit, type BoardClock } from './clock.js';
import type { HeightTable } from './road-tables.js';

/** Every segment's slope but kind 4's is held at this, 16.16 rows a line (S 0x2044). */
const SLOPE_LIMIT = 0x10000;
/** A share's word: 0x100 + the share; at 0x1FF a value is done. */
const SHARE = 0x100;
const DONE = 0x1ff;
/** The segments a window has. */
const SEGMENTS = 7;
/** The end mark of a table's entries. */
const END = -1;

/** The procedure's words (`$` its offsets in the sub CPU's RAM), one table at a time. */
export interface State {
  /** $536: 2 kind 0 runs, 3 kinds 1 and 2, 4 kind 3, 5 kind 4; 1 a table is to start. */
  state: number;
  /** $66: the table a height point has asked for; 0 none. */
  pending: number;
  /** $722 the table running, its kind ($71A) and step ($726); kind 0's descent and ascent factors ($72C, $72E). */
  table: number;
  kind: number;
  step: number;
  descent: number;
  ascent: number;
  /** The table's entries (kind 4: its word) and the end mark: $71C points into them. */
  memory: readonly number[];
  pointer: number;
  /** $710 entries passed, $716 one just done, $720 the direction of the last value drawn (−1, 0, 1). */
  entered: number;
  finished: number;
  direction: number;
  /** $718 the share count, $530 the share's word, $72A the segments' split. */
  count: number;
  share: number;
  split: number;
  /** $724 the hold's wait and $728 whether it holds. */
  wait: number;
  holding: number;
  /** $732 the horizon's base (a long), $73A kind 4's move. */
  base: number;
  move: number;
}

/** The procedure's counts, read from the sub program (`readHeightCounts`). */
interface Counts {
  readonly gain: number;
  readonly end: number;
  readonly rampEnd: number;
  readonly slide: number;
  readonly slideEntries: number;
  readonly restart: number;
}

const word = (v: number) => (v << 16) >> 16;
/** An unsigned word divided by a word, the quotient's word (`divu.w`), checked not to overflow. */
function divu(n: number, d: number): number {
  const q = Math.floor((n >>> 0) / (d & 0xffff));
  if (q > 0xffff) throw romDiffers('The procedure divides past a word');
  return q;
}

/** A table started (S 0x1BCE): its state's words read from it. */
function start(s: State, table: HeightTable, counts: Counts) {
  s.entered = 0;
  s.finished = 0;
  s.direction = 0;
  s.count = counts.restart;
  s.table = s.pending;
  s.kind = table.kind;
  s.step = table.step;
  s.pointer = 0;
  switch (table.kind) {
    case 0:
      s.descent = table.descent;
      s.ascent = table.ascent;
      s.memory = [...table.entries, END];
      s.state = 2;
      break;
    case 1:
    case 2:
      s.wait = table.wait;
      s.memory = [...table.entries, END];
      s.holding = 1;
      s.split = SHARE;
      s.state = 3;
      break;
    case 3:
      s.wait = table.value;
      s.memory = [...table.entries, END];
      s.holding = 1;
      s.state = 4;
      break;
    case 4:
      s.memory = [table.horizon];
      s.move = word(table.horizon - s.base);
      s.state = 5;
  }
}

/** A value done: its share full, the count started again, the next entry entered next tick. */
function done(s: State, counts: Counts) {
  s.count = counts.restart;
  s.finished = 1;
  s.direction = 0;
}

/** One tick of the tables' state (S 0x1B12), the phase word having gained `advance` (`$544`). */
function tick(s: State, advance: number, counts: Counts, tables: (n: number) => HeightTable) {
  const gained = counts.gain * advance;
  if (s.state === 0) s.pending = 0;
  if (s.state <= 1) start(s, tables(s.pending), counts);
  switch (s.state) {
    case 2: {
      // Kind 0 (S 0x1C44): the share over step × the factor the last value's direction selects.
      s.count = (s.count + gained) & 0xffff;
      const divisor = s.step * (s.direction < 0 ? s.descent : s.direction > 0 ? s.ascent : 1);
      s.share = SHARE + Math.min(counts.end, divu(s.count, divisor));
      s.split = s.share;
      s.entered += s.finished;
      s.finished = 0;
      if (s.share === DONE) {
        s.split = DONE;
        done(s, counts);
      } else if (s.pending !== 0 && s.table === 0) s.state = 1;
      return;
    }
    case 3: {
      // Kinds 1 and 2 (S 0x1D04): rise, hold, return.
      s.entered += s.finished;
      s.finished = 0;
      if (s.entered !== 0 && s.holding) {
        s.wait = word(s.wait - divu(gained, s.step));
        s.share = DONE;
        if (s.wait < 0) s.holding = 0;
        return;
      }
      // Its share's end done (S 0x1D76), the rise still draws the share reached; the return draws 0.
      s.count = (s.count + gained) & 0xffff;
      const share = Math.min(counts.end, divu(s.count, s.step));
      const full = share >= counts.rampEnd;
      if (full) done(s, counts);
      s.share = SHARE + (s.entered !== 0 ? counts.end - (full ? counts.end : share) : share);
      return;
    }
    case 4: {
      // Kind 3 (S 0x1DC6): its first entries slid in, then held and returned as kind 1.
      s.entered += s.finished;
      s.finished = 0;
      if (s.entered < counts.slideEntries) {
        s.count = (s.count + gained) & 0xffff;
        s.share = SHARE + Math.min(counts.end, divu(s.count, counts.slide));
        s.split = s.share;
        if (s.share >= DONE) {
          s.share = DONE;
          s.split = DONE;
          done(s, counts);
        }
        return;
      }
      if (s.holding) {
        s.wait = word(s.wait - divu(gained, s.step));
        s.share = DONE;
        s.split = SHARE;
        if (s.wait < 0) {
          s.pointer += counts.slideEntries;
          s.holding = 0;
        }
        return;
      }
      s.count = (s.count + gained) & 0xffff;
      s.share = DONE - Math.min(counts.end, divu(s.count, s.step));
      if (s.share === SHARE) done(s, counts);
      return;
    }
    case 5: {
      // Kind 4 (S 0x1ECE): the base moved by the share.
      s.count = (s.count + gained) & 0xffff;
      s.share = SHARE + Math.min(counts.end, divu(s.count, s.step));
      s.split = s.share;
    }
  }
}

/** The window's line words, nearest first, ÷ 16 rows above the bottom row (S 0x1F00); the table's end found there. */
function window(s: State, counts: Counts): Int16Array {
  const words = new Int16Array(512);
  let line = 0,
    sum = 0;
  const lay = (slope: number, lines: number) => {
    for (let n = 0; n < lines; n++) {
      sum += slope;
      words[line++] = word(Math.floor((sum * 16) / 65536));
    }
  };
  const shared = s.share - SHARE;
  if (s.kind === 4) {
    // One slope, not held (S 0x219E).
    lay(s.base * 16 + Math.floor((s.move * shared) / 16), 512);
    if (s.share === DONE) {
      s.base = s.memory[s.pointer]!;
      finish(s);
    }
    return words;
  }
  // The segments (S 0x1F22): s0 = 0x1FF − split, s1 = split ÷ 2, the rest halved in turn, each half its floor.
  const lengths = [DONE - s.split, s.split >> 1];
  let rest = 512 - lengths[0]! - lengths[1]!;
  for (let k = 2; k < SEGMENTS - 1; k++) {
    lengths.push(rest >> 1);
    rest -= rest >> 1;
  }
  lengths.push(rest);
  let at = s.pointer + s.entered;
  const fade = Math.floor((s.memory[at]! * shared) / 16);
  const level = s.base * 16;
  const slid = s.kind === 0 || (s.kind === 3 && s.entered < counts.slideEntries);
  let slope = level + (s.kind === 2 ? fade : 0);
  for (let k = 0; k < SEGMENTS; k++) {
    if (k > 0) {
      if (slid) {
        slope += s.memory[at++]! * 16;
        if (k === 1) {
          slope -= fade;
          if (slope !== level) s.direction = slope > level ? 1 : -1;
        }
      } else if (s.kind !== 2) slope += fade;
    }
    slope = Math.min(slope, SLOPE_LIMIT);
    lay(slope, lengths[k]!);
  }
  if (s.memory[at] === END) finish(s);
  return words;
}

/** The level road's line words at base `base`: every line's slope the base × 16. */
export function levelWords(base: number): Int16Array {
  const words = new Int16Array(512);
  for (let n = 0; n < 512; n++) words[n] = word(Math.floor((base * 16 * (n + 1) * 16) / 65536));
  return words;
}

/** A table done: the next starts the next tick, the point's table no longer pending. */
function finish(s: State) {
  if (s.pending === s.table) s.pending = 0;
  s.state = 1;
}

/** The procedure at rest: table 0 asked to start ($536 = 0), the horizon's base `base`. */
export function level(base: number): State {
  return {
    state: 0,
    pending: 0,
    table: 0,
    kind: 0,
    step: 1,
    descent: 1,
    ascent: 1,
    memory: [END],
    pointer: 0,
    entered: 0,
    finished: 0,
    direction: 0,
    count: 0,
    share: SHARE,
    split: SHARE,
    wait: 0,
    holding: 0,
    base,
    move: 0,
  };
}

/** One tick of the procedure as the sub program's main loop runs it (S 0x1050, 0x1054): the state, then the window. */
export function procedureTick(
  s: State,
  advance: number,
  counts: Counts,
  tables: (n: number) => HeightTable,
): Int16Array {
  tick(s, advance, counts, tables);
  return window(s, counts);
}

/** The zero-gain ticks a state needs at most to settle: a start, an end, the next table's start. */
const MOST_SETTLING = 16;

/** Whether the state holds: a hold's wait counted down, not moved by a tick that gains nothing. */
const holds = (s: State, counts: Counts) =>
  s.holding === 1 &&
  ((s.state === 3 && s.entered + s.finished !== 0) || (s.state === 4 && s.entered + s.finished >= counts.slideEntries));

/** A table's run alone, from where its point is reached: its windows at the positions asked, and where it ends. */
export interface DrivenRun {
  /** Positions from the run's start: where its hold begins and ends (kinds 1 to 3; else its end), and its end. */
  readonly holdStart: number;
  readonly holdEnd: number;
  readonly end: number;
  /** The window at each position asked (from the run's start, ascending): its 512 line words, nearest first. */
  readonly windows: readonly Int16Array[];
  /** The horizon's base after the run (kind 4 moves it). */
  readonly base: number;
}

/**
 * Table `number` run alone from its point, its base `base`, in the limit of a speed falling to 0: between one phase
 * unit and the next the state settles, its ticks gaining nothing; then a tick gains 1 (a `phaseUnit` of road). A hold
 * is counted at `kmh`, the phase word's whole gains tick by tick from a carry of 0 (`phaseGains`), each tick a `kmh ×
 * step / 65536` of road. Each table counts its units from its start. Ends when the procedure starts table 0 again.
 */
export function driveTable(
  number: number,
  tables: (n: number) => HeightTable,
  clock: BoardClock,
  kmh: (position: number) => number,
  base: number,
  positions: readonly number[] = [],
): DrivenRun {
  // Table 0, the level one the procedure runs between tables, is asked for by no point: $66 = 0 asks for nothing.
  if (number === 0) {
    const flat = levelWords(base);
    return { holdStart: 0, holdEnd: 0, end: 0, windows: positions.map(() => flat), base };
  }
  // Positions as whole numbers of 1 / (65536 × phaseSteps): a phase unit and a hold's tick are whole there.
  const scale = 65536 * phaseSteps(clock);
  const unit = Math.round(phaseUnit(clock) * scale);
  const counts = clock.heights;
  const s: State = { ...level(base), state: 1, pending: number };
  const windows: Int16Array[] = [];
  let asked = 0,
    at = 0,
    holdStart: number | null = null,
    holdEnd: number | null = null;
  // The windows asked before `to` are the last one's.
  const sample = (w: Int16Array, to: number) => {
    while (asked < positions.length && positions[asked]! * scale < to) {
      windows.push(w);
      asked++;
    }
  };
  // A run ends at the tick it asks for no next table: the level table 0 then runs, which both originals hold level.
  const ended = () => s.state === 1 && s.pending === 0;
  const result = () => {
    sample(levelWords(s.base), Infinity);
    return {
      holdStart: (holdStart ?? at) / scale,
      holdEnd: (holdEnd ?? at) / scale,
      end: at / scale,
      windows,
      base: s.base,
    };
  };
  for (;;) {
    let w: Int16Array;
    for (let n = 0; ; n++) {
      const before = JSON.stringify(s);
      tick(s, 0, counts, tables);
      w = window(s, counts);
      if (ended()) return result();
      if (JSON.stringify(s) === before) break;
      if (n >= MOST_SETTLING) throw romDiffers(`Height table ${number}'s procedure does not settle`);
    }
    if (holds(s, counts)) {
      holdStart = at;
      const speed = kmh(at / scale),
        holdTick = speed * clock.step * phaseSteps(clock);
      const gains = phaseGains(clock, speed);
      while (holds(s, counts)) {
        tick(s, gains.next().value, counts, tables);
        window(s, counts);
        sample(w, at + holdTick);
        at += holdTick;
      }
      holdEnd = at;
      continue;
    }
    sample(w, at + unit);
    tick(s, 1, counts, tables);
    window(s, counts);
    at += unit;
    if (ended()) return result();
  }
}
