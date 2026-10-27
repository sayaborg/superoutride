/**
 * The heights' procedure checked against the original's own code ([Original road data](../../docs/original-road-data.md#hills)):
 * `height-ticks` runs each table the courses name on each original's sub program (`Cpu68000`) and by `procedureTick`
 * side by side, tick by tick at the original's top speed, and compares every tick's 512 line words. It writes nothing.
 */
import { phaseGains, type BoardClock } from './board-clock.js';
import { Cpu68000 } from './cpu-68000.js';
import { level, procedureTick } from './height-procedure.js';
import { assemblePrograms } from './outrun-rom.js';
import { readClock } from './outrun-road.js';
import { readHeightTable, type HeightTable } from './road-tables.js';
import { oneZip, romDirectory, romSet, type RoadDataCommands } from './road-data-commands.js';
import { courseTables } from './screen-pieces-commands.js';
import { assembleTurboOutrunPrograms } from './turbo-outrun-rom.js';
import { readConstants, readClock as readTurboClock, TURBO_OUTRUN_HEIGHT_TABLES } from './turbo-outrun-road.js';

/** OUTRUN's top speed, km/h (its chapter's value). */
const OUTRUN_TOP_KMH = 293;
/** The sub CPU's work RAM: its start, A5 through the procedure, and its size. */
const RAM = 0x60000;
const RAM_BYTES = 0x10000;
/**
 * The words the procedure reads (offsets in the RAM): the window's buffer ($3C, its words at 0x1C00 + it − 1024, far to
 * near, the first $3A), the phase word and its last ($53C, $542), the state ($536), the point's table ($66) and the
 * bumps' and sway's words left at rest ($730, $736, $740, $74A), as the sub program's start leaves them (S 0x10B8); and
 * the horizon's base (the long $732), the level one the program reads (`readHeightCounts`).
 */
const AT_REST: readonly (readonly [number, number, 2])[] = [
  [0x3a, 0, 2],
  [0x3c, 0x800, 2],
  [0x730, 0, 2],
  [0x736, 1, 2],
  [0x740, 0, 2],
  [0x74a, 0, 2],
  [0x536, 0, 2],
  [0x66, 0, 2],
  [0x53c, 0, 2],
  [0x542, 0, 2],
];
const WINDOW = 0x1c00 - 1024;
/** Each run: the level road this many ticks, then the table's point reached; after the table, this many ticks more. */
const BEFORE = 8;
const AFTER = 30;
/** No run is longer than this many ticks. */
const MOST_TICKS = 200_000;

/** One original's procedure: its sub program, where its state's tick and its window begin, its tables and clock. */
interface Original {
  readonly name: string;
  readonly sub: Uint8Array;
  readonly tick: number;
  readonly window: number;
  readonly tables: (n: number) => HeightTable;
  readonly clock: BoardClock;
  readonly kmh: number;
  readonly named: readonly number[];
}

/** Table `table` run on the original's code and by the procedure: the ticks run, and the first tick and line unlike. */
function compare(o: Original, table: number, kmh: number) {
  const cpu = new Cpu68000(o.sub, new Uint8Array(RAM_BYTES), RAM);
  for (const [offset, value, size] of AT_REST) cpu.ramWrite(offset, size, value);
  cpu.ramWrite(0x732, 4, o.clock.heights.level);
  const s = level(o.clock.heights.level);
  const gains = phaseGains(o.clock, kmh);
  let phase = 0,
    after: number | null = null;
  for (let tick = 0; tick < MOST_TICKS; tick++) {
    const gain = gains.next().value as number;
    phase = (phase + gain) & 0xffff;
    cpu.ramWrite(0x53c, 2, phase);
    if (tick === BEFORE) {
      cpu.ramWrite(0x66, 2, table);
      s.pending = table;
    }
    cpu.call(o.tick);
    cpu.call(o.window);
    const words = procedureTick(s, gain, o.clock.heights, o.tables);
    const buffer = WINDOW + cpu.ramRead(0x3c, 2);
    for (let k = 0; k < words.length; k++) {
      const code = (cpu.ramRead(buffer + 2 * (words.length - 1 - k), 2) << 16) >> 16;
      if (code !== words[k])
        return { ticks: tick + 1, unlike: { tick: tick - BEFORE, line: k, code, model: words[k]! } };
    }
    if (tick > BEFORE && after === null && s.state === 1 && s.pending === 0) after = tick;
    if (after !== null && tick - after >= AFTER) return { ticks: tick + 1, unlike: null };
  }
  throw new Error(`Table ${table} of ${o.name} runs past ${MOST_TICKS} ticks`);
}

export const HEIGHT_TICKS_COMMANDS: RoadDataCommands = Object.freeze({
  'height-ticks': async (options) => {
    const zip = (original: string, option: string) => oneZip(options.get(option), romDirectory(original), option);
    const outrun = assemblePrograms(await romSet('outrun', [await zip('outrun', '--outrun-zip')]));
    const turbo = assembleTurboOutrunPrograms(await romSet('toutrun', [await zip('turbo-outrun', '--turbo-zip')]));
    const named = courseTables(outrun, turbo);
    const originals: Original[] = [
      {
        name: 'OUTRUN',
        sub: outrun.sub,
        tick: 0x1b12,
        window: 0x1f00,
        tables: (n) => readHeightTable(outrun.sub, n),
        clock: readClock(outrun),
        kmh: OUTRUN_TOP_KMH,
        named: named.outrun,
      },
      {
        name: 'TURBO OUTRUN',
        sub: turbo.sub,
        tick: 0x1a5e,
        window: 0x1e4c,
        tables: (n) => readHeightTable(turbo.sub, n, TURBO_OUTRUN_HEIGHT_TABLES),
        clock: readTurboClock(turbo),
        kmh: readConstants(turbo.main).topSpeed,
        named: named.turbo,
      },
    ];
    const only = options.get('--table'),
      kmh = options.get('--kmh');
    let runs = 0,
      ticks = 0;
    const unlike: unknown[] = [];
    for (const o of originals)
      for (const table of o.named) {
        if (only !== undefined && Number(only) !== table) continue;
        const run = compare(o, table, kmh === undefined ? o.kmh : Number(kmh));
        runs++;
        ticks += run.ticks;
        if (run.unlike) unlike.push({ original: o.name, table, ...run.unlike });
      }
    if (unlike.length)
      throw Object.assign(new Error("The heights' procedure differs from the original's code"), {
        diagnostics: unlike.map((u) => ({ kind: 'tool', code: 'unlike', path: '', message: JSON.stringify(u) })),
      });
    console.log(JSON.stringify({ ok: true, runs, ticks }));
  },
});
