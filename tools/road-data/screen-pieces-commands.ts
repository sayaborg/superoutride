/**
 * The grades' pieces solved from the ROM zips ([Original road data](../../docs/original-road-data.md#profile-from-the-originals-screen),
 * The pieces kept): `screen-pieces` solves every piece the originals' courses run and writes `screen-pieces.json`, or
 * with `--check` compares what it solves with the file and writes nothing. Solving them all takes over half an hour.
 */
import { contractUnmet } from './shared/conversion-errors.js';
import { piecesCamera } from './shared/screen-pieces.js';
import { tableInputs } from './out-run-hardware/table-grades.js';
import { readFile } from 'node:fs/promises';
import { requireInput } from '../authoring/authoring-error.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { atomicWrite } from '../course/authoring-io.js';
import { positionMetres, type ProgramClock } from './out-run-hardware/clock.js';
import { assembleEnduroRacerPrograms, ENDURO_RACER_ROMS } from './enduro-racer/enduro-racer-rom.js';
import { positionMetres as enduroRacerPositionMetres } from './enduro-racer/enduro-racer-road.js';
import { CYCLE, readEnduroRacerScreen, type EnduroRacerScreen } from './enduro-racer/enduro-racer-screen.js';
import { assemblePrograms, type OutrunPrograms, OUTRUN_ROMS } from './outrun/outrun-rom.js';
import {
  lineDistances,
  readClock,
  readTopKmh,
  OUTRUN_HEIGHT_TABLES,
  outrunCourseTables,
} from './outrun/outrun-road.js';
import { readHeightTable, type HeightTable } from './out-run-hardware/road-tables.js';
import { command, readSource, zipOptions, type RoadDataCommands } from './road-data-commands.js';
import { cellPositionsOf, type PieceFrames } from './shared/screen-frames.js';
import { outrunFrames } from './out-run-hardware/screen-frames.js';
import {
  enduroRacerCycleFrames,
  enduroRacerHillFrames,
  enduroRacerInputs,
} from './enduro-racer/enduro-racer-screen-frames.js';
import { heightsOf, screenMeasure } from './shared/screen-measure.js';
import { choosePiece, LOOK_PLACES, round, solvePiece } from './shared/screen-solve.js';
import {
  assembleTurboOutrunPrograms,
  type TurboOutrunPrograms,
  TURBO_OUTRUN_ROMS,
} from './turbo-outrun/turbo-outrun-rom.js';
import {
  readConstants,
  lineDistances as turboLineDistances,
  readClock as readTurboClock,
  TURBO_OUTRUN_HEIGHT_TABLES,
  turboOutrunCourseTables,
} from './turbo-outrun/turbo-outrun-road.js';

const FILE = 'tools/road-data/shared/screen-pieces.json';
/** The file's places: stations to the micrometre, grade changes to 1e-9, heights to the millimetre, steepest to 0.01 %. */
const STATION_PLACES = 6;
const CHANGE_PLACES = 9;
const RISE_PLACES = 3;
const STEEPEST_PLACES = 2;
/**
 * The sensitivity search's shift of the original's rows, rows: far below their sixteenths, far above the solve's
 * rounding. A piece whose heights then move by more than `MOVES` metres, or whose vertical curves change in number, is
 * reported.
 */
const SHIFT = 1e-9;
const MOVES = 1e-3;
/** The written changes give back the piece's grades within this at every cell border. */
const WRITTEN = 1e-7;

/** A piece as the file writes it: its stretch, changes, looks, rise and steepest grade, %. */
export interface WrittenPiece {
  readonly stretch: number | null;
  readonly changes: readonly (readonly [number, number, number])[];
  readonly look: number | null;
  readonly levelLook: number | null;
  readonly rise: number;
  readonly steepest: number;
}

/** A piece solved from its frames and written: level where its original's screen shows no hill. */
export function solveWritten(frames: PieceFrames): WrittenPiece {
  const measure = screenMeasure(frames.frames, frames.camera, frames.cell);
  if (measure.hillFrames === 0)
    return { stretch: null, changes: [], look: null, levelLook: null, rise: 0, steepest: 0 };
  const levelLook = round(measure.look(new Float64Array(measure.edges + 1)).both, LOOK_PLACES);
  const { piece } = choosePiece(solvePiece(measure, frames.a, frames.b, frames.repeats));
  const { a, b, cell } = frames;
  const g = piece.grades;
  const changes = piece.elements
    .filter((e) => e.curve)
    .map(
      (e) =>
        [
          round((e.from - a) * cell, STATION_PLACES),
          round((e.to - a) * cell, STATION_PLACES),
          round(g[e.to]! - g[e.from]!, CHANGE_PLACES),
        ] as const,
    );
  for (let j = a; j <= b; j++) {
    const x = (j - a) * cell;
    const written = changes.reduce((s, [f, t, c]) => s + c * Math.min(1, Math.max(0, (x - f) / (t - f))), 0);
    if (Math.abs(written - g[j]!) > WRITTEN) throw contractUnmet(`A piece's written changes miss its grade at ${x} m`);
  }
  const stretch = g.subarray(a, b + 1);
  const h = heightsOf(stretch, cell);
  return {
    stretch: round((b - a) * cell, STATION_PLACES),
    changes,
    look: piece.look,
    levelLook,
    rise: round(h[h.length - 1]!, RISE_PLACES),
    steepest: round(100 * Math.max(...stretch.map(Math.abs)), STEEPEST_PLACES),
  };
}

/** `frames` with the original's rows each moved by `rows`. */
const shifted = (frames: PieceFrames, rows: number): PieceFrames => ({
  ...frames,
  frames: { ...frames.frames, rows: frames.frames.rows.map((r) => r.map((x) => x + rows)) },
});

/** Whether a piece solved again from its rows shifted either way by `SHIFT` moves: the most its heights move. */
function sensitivity(frames: PieceFrames, piece: WrittenPiece): { moved: boolean; metres: number } {
  let metres = 0,
    moved = false;
  for (const rows of [SHIFT, -SHIFT]) {
    const again = solveWritten(shifted(frames, rows));
    const by = heightDifference(again, piece);
    metres = Math.max(metres, by);
    moved ||= by > MOVES || again.changes.length !== piece.changes.length;
  }
  return { moved, metres: round(metres, 4) };
}

/** Where two pieces' heights along their stretches differ most, metres: their grades integrated in steps of `STEP`. */
const STEP = 0.05;
function heightDifference(a: WrittenPiece, b: WrittenPiece): number {
  const grade = (p: WrittenPiece, x: number) =>
    p.changes.reduce((g, [f, t, c]) => g + c * Math.min(1, Math.max(0, (x - f) / (t - f))), 0);
  const length = Math.max(a.stretch ?? 0, b.stretch ?? 0);
  let most = 0,
    difference = 0;
  for (let x = STEP; x <= length + STEP; x += STEP) {
    difference += (STEP * (grade(a, x - STEP) + grade(a, x) - grade(b, x - STEP) - grade(b, x))) / 2;
    most = Math.max(most, Math.abs(difference));
  }
  return most;
}

/** A table to solve: its number, the speed it holds at (held tables), and the program and clock it runs by. */
interface OutrunTask {
  readonly table: number;
  readonly kmh?: number;
  /** The tables of the program it runs by, and that program's clock. */
  readonly tables: (n: number) => HeightTable;
  readonly clock: ProgramClock;
  /** The program's lines' distances ahead of the car, positions (`lineDistances`). */
  readonly distances: Float64Array;
  readonly runAt: number;
}

/**
 * The tables the courses run (`outrunCourseTables`, `turboOutrunCourseTables`) to solve; kind 4's have no piece. A held table (kinds 1 to 3) is solved
 * at its original's top speed, the others once.
 */
function outrunTasks(outrun: OutrunPrograms, turbo: TurboOutrunPrograms): OutrunTask[] {
  const [outrunNamed, turboNamed] = [outrunCourseTables(outrun), turboOutrunCourseTables(turbo)];
  const outrunClock = readClock(outrun),
    turboClock = readTurboClock(turbo);
  const outrunDistances = lineDistances(outrun, outrunClock),
    turboDistances = turboLineDistances(turbo, turboClock);
  const outrunKmh = readTopKmh(outrun),
    turboKmh = readConstants(turbo.main).topSpeed;
  const tasks = new Map<string, OutrunTask>();
  const add = (
    table: number,
    tables: (n: number) => HeightTable,
    clock: ProgramClock,
    distances: Float64Array,
    top: number,
  ) => {
    const { kind } = tables(table);
    if (kind === 4) return;
    // Kinds 1 to 3 hold, counted at the speed.
    const held = kind !== 0;
    const key = held ? `${table}@${top}` : `${table}`;
    if (!tasks.has(key)) tasks.set(key, { table, ...(held ? { kmh: top } : {}), tables, clock, distances, runAt: top });
  };
  const outrunTables = (n: number) => readHeightTable(outrun.sub, n, OUTRUN_HEIGHT_TABLES);
  const turboTables = (n: number) => readHeightTable(turbo.sub, n, TURBO_OUTRUN_HEIGHT_TABLES);
  for (const n of outrunNamed) add(n, outrunTables, outrunClock, outrunDistances, outrunKmh);
  for (const n of turboNamed) add(n, turboTables, turboClock, turboDistances, turboKmh);
  return [...tasks.values()].sort((x, y) => x.table - y.table || (x.kmh ?? 0) - (y.kmh ?? 0));
}

/** A piece as the file keeps it: its name, what it was solved from and, whole cycles, how many (`OriginalPieces`). */
type KeptPiece = { readonly piece: string; readonly inputs: string; readonly cycles?: number } & WrittenPiece;

/** The pieces' file: each original's, OUTRUN's (and TURBO OUTRUN's) and ENDURO RACER's. */
interface PiecesFile {
  readonly about: string;
  /** This game's camera's values the pieces were solved for (`piecesCamera`). */
  readonly camera: ReturnType<typeof piecesCamera>;
  readonly originals: readonly {
    readonly original: string;
    readonly about: string;
    readonly positionMetres: number;
    readonly cellPositions: number;
    readonly pieces: readonly KeptPiece[];
  }[];
}

const ABOUT =
  "The pieces of the grades' rule (Original road data, Profile from the original's screen), solved from the ROM zips by " +
  "`npm run road-data -- screen-pieces`. Each piece is the changes of grade over its stretch, metres from the stretch's " +
  "start, as road-profile's Change [from, to, change]; the grade is 0 at both ends. Looks are rows of the original's " +
  "224, both ways, over the hill frames; levelLook the level road's.";
const OUTRUN_ABOUT =
  "OUTRUN's and TURBO OUTRUN's height tables (TURBO OUTRUN's are OUTRUN's 225), each run alone on a level road; a held " +
  "table (kinds 1 and 3) at a speed, km/h. A stretch starts at the camera's station when the car is where the table " +
  'starts (6 m before it). Tables of kind 4 have no piece; table 0 shows no hill.';
const ENDURO_RACER_ABOUT =
  "ENDURO RACER's normal path's cycle (256 positions from P & 0xFF = 0) and each hill's stretch of whole cycles (from " +
  "the cycle start at or before the hill's start; its length in cycles), read through its level camera at this game's " +
  "focal length. A stretch starts at the camera's station when the road position is the stretch's first.";

/** Which pieces: every one, or those `--table` (with `--kmh` for a held one), `--cycle` and `--hill` name. */
function chosen(options: ReadonlyMap<string, string>) {
  const table = options.get('--table'),
    hill = options.get('--hill');
  const some = table !== undefined || hill !== undefined || options.has('--cycle');
  return {
    table: (n: number, kmh?: number) =>
      !some ||
      (table !== undefined && Number(table) === n && (kmh === undefined || options.get('--kmh') === String(kmh))),
    cycle: !some || options.has('--cycle'),
    hill: (k: number) => !some || (hill !== undefined && Number(hill) === k),
  };
}

export const SCREEN_PIECES_COMMANDS: RoadDataCommands = Object.freeze({
  'screen-pieces': command(
    {
      '--check': 'flag',
      '--table': 'value',
      '--kmh': 'value',
      '--cycle': 'flag',
      '--hill': 'value',
      '--sensitivity': 'flag',
      ...zipOptions(OUTRUN_ROMS, TURBO_OUTRUN_ROMS, ENDURO_RACER_ROMS),
    },
    async function* (options) {
      const check = options.has('--check');
      const which = chosen(options);
      const outrun = assemblePrograms((await readSource(OUTRUN_ROMS, options)).set);
      const turbo = assembleTurboOutrunPrograms((await readSource(TURBO_OUTRUN_ROMS, options)).set);
      const er = assembleEnduroRacerPrograms((await readSource(ENDURO_RACER_ROMS, options)).set);
      const screen: EnduroRacerScreen = readEnduroRacerScreen(er);
      const kept = JSON.parse(await readFile(FILE, 'utf8')) as PiecesFile;
      const solved: string[] = [];
      const differ: { piece: string; metres: number }[] = [];
      const moved: { piece: string; metres: number }[] = [];
      const search = options.has('--sensitivity');
      // A piece solved from its frames, compared with the one kept, and with `--sensitivity` solved again from them shifted.
      const kepts = new Map(kept.originals.flatMap((o) => o.pieces.map((p) => [`${o.original}/${p.piece}`, p])));
      const keptPiece = (original: string, name: string) => {
        const old = kepts.get(`${original}/${name}`);
        requireInput(old, `/${FILE}`, `${name} has no piece kept`);
        return old;
      };
      const take = (head: Omit<KeptPiece, keyof WrittenPiece>, frames: PieceFrames, old: KeptPiece | undefined) => {
        const name = head.piece;
        const piece: KeptPiece = { ...head, ...solveWritten(frames) };
        solved.push(name);
        if (JSON.stringify(piece) !== JSON.stringify(old))
          differ.push({ piece: name, metres: old ? round(heightDifference(piece, old), 4) : Infinity });
        if (search) {
          const { moved: moves, metres } = sensitivity(frames, piece);
          if (moves) moved.push({ piece: name, metres });
        }
        return piece;
      };
      const tasks = outrunTasks(outrun, turbo);
      const pieces = tasks.map((t) => {
        const name = `table ${t.table}${t.kmh !== undefined ? ` at ${t.kmh} km/h` : ''}`;
        if (!which.table(t.table, t.kmh)) return keptPiece('outrun', name);
        const inputs = tableInputs(t.tables(t.table), t.clock, t.distances, t.kmh);
        const frames = outrunFrames(t.tables, t.table, t.runAt, t.clock, t.distances);
        return take({ piece: name, inputs }, frames, kepts.get(`outrun/${name}`));
      });
      const metres = enduroRacerPositionMetres(er);
      const inputs = enduroRacerInputs(screen, metres);
      const cycle = which.cycle
        ? take(
            { piece: 'cycle', inputs, cycles: 1 },
            enduroRacerCycleFrames(screen, metres),
            kepts.get('enduro-racer/cycle'),
          )
        : keptPiece('enduro-racer', 'cycle');
      const hills = screen.hills.map((_, i) => {
        const name = `hill ${i + 1}`;
        if (!which.hill(i + 1)) return keptPiece('enduro-racer', name);
        const frames = enduroRacerHillFrames(screen, i + 1, metres);
        const cycles = ((frames.b - frames.a) * frames.cellPositions) / CYCLE;
        return take({ piece: name, inputs, cycles }, frames, kepts.get(`enduro-racer/${name}`));
      });
      const outrunClock = readClock(outrun);
      const file: PiecesFile = {
        about: ABOUT,
        camera: piecesCamera(),
        originals: [
          {
            original: 'outrun',
            about: OUTRUN_ABOUT,
            positionMetres: positionMetres(outrunClock),
            cellPositions: cellPositionsOf(positionMetres(outrunClock)),
            pieces,
          },
          {
            original: 'enduro-racer',
            about: ENDURO_RACER_ABOUT,
            positionMetres: metres,
            cellPositions: cellPositionsOf(metres),
            pieces: [cycle, ...hills],
          },
        ],
      };
      if (check)
        requireInput(
          differ.length === 0,
          `/${FILE}`,
          `${differ.map((d) => `${d.piece} (${d.metres} m)`).join(', ')} differ from the pieces kept` +
            (search ? `; ${moved.map((d) => `${d.piece} (${d.metres} m)`).join(', ') || 'none'} move` : ''),
        );
      else await atomicWrite(FILE, formatSavedJson(file));
      yield { ok: true, checked: check, solved: solved.length, differ, ...(search ? { moved } : {}) };
    },
    [OUTRUN_ROMS, TURBO_OUTRUN_ROMS, ENDURO_RACER_ROMS],
  ),
});
