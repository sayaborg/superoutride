/**
 * The grades' pieces solved from the ROM zips ([Original road data](../../docs/original-road-data.md#profile-from-the-originals-screen),
 * The pieces kept): `screen-pieces` solves every piece the originals' courses run and writes `screen-pieces.json`, or
 * with `--check` compares what it solves with the file and writes nothing. Solving them all takes over two hours.
 */
import { contractUnmet } from './shared/conversion-errors.js';
import { piecesCamera } from './shared/screen-pieces.js';
import { heldKind, tableInputs } from './out-run-hardware/table-grades.js';
import { readFile } from 'node:fs/promises';
import { requireInput } from '../authoring/authoring-error.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { atomicWrite } from '../course/authoring-io.js';
import { positionMetres, type ProgramClock } from './out-run-hardware/clock.js';
import { assembleEnduroRacerPrograms, ENDURO_RACER_ROMS } from './enduro-racer/enduro-racer-rom.js';
import { positionMetres as enduroRacerPositionMetres, readStages } from './enduro-racer/enduro-racer-road.js';
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
import { cellPositionsOf, closedCellPositions, type PieceFrames } from './shared/screen-frames.js';
import { outrunFrames } from './out-run-hardware/screen-frames.js';
import {
  enduroRacerCycleFrames,
  enduroRacerHillFrames,
  enduroRacerInputs,
} from './enduro-racer/enduro-racer-screen-frames.js';
import { heightsOf, screenMeasure } from './shared/screen-measure.js';
import { choosePiece, round, solvePiece } from './shared/screen-solve.js';
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
import { LOOK_PLACES } from './shared/shared-constants.js';
import { assembleFinalLap2, FINAL_LAP_2_ROMS } from './final-lap-2/final-lap-2-rom.js';
import { intervalMetres, LAP_UNITS, readNames, readSlopeTables } from './final-lap-2/final-lap-2-road.js';
import { finalLap2Inputs, finalLap2LapFrames, readProjection } from './final-lap-2/final-lap-2-screen-frames.js';
import { assembleCiscoHeatMain, assembleCiscoHeatRoadCpu, CISCO_HEAT_ROMS } from './cisco-heat/cisco-heat-rom.js';
import { positionMetres as ciscoHeatPositionMetres } from './cisco-heat/cisco-heat-road.js';
import {
  ciscoHeatInputs,
  ciscoHeatRoadFrames,
  ciscoHeatStageRoads,
  readCiscoHeatScreen,
} from './cisco-heat/cisco-heat-screen-frames.js';

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

/** A piece as the file writes it: its stretch, a lap's grade at its start, changes, looks, rise and steepest grade, %. */
export interface WrittenPiece {
  readonly stretch: number | null;
  readonly grade?: number;
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
  const levelLook = round(measure.look(new Float64Array(measure.edges + 1)), LOOK_PLACES);
  const { piece } = choosePiece(solvePiece(measure, frames.a, frames.b, frames.repeats, frames.closed));
  const { a, b, cell } = frames;
  const g = piece.grades;
  const start = frames.closed ? round(g[a]!, CHANGE_PLACES) : 0;
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
    const written = changes.reduce((s, [f, t, c]) => s + c * Math.min(1, Math.max(0, (x - f) / (t - f))), start);
    if (Math.abs(written - g[j]!) > WRITTEN) throw contractUnmet(`A piece's written changes miss its grade at ${x} m`);
  }
  const stretch = g.subarray(a, b + 1);
  const h = heightsOf(stretch, cell);
  return {
    stretch: round((b - a) * cell, STATION_PLACES),
    ...(frames.closed ? { grade: start } : {}),
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
    p.changes.reduce((g, [f, t, c]) => g + c * Math.min(1, Math.max(0, (x - f) / (t - f))), p.grade ?? 0);
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
 * The tables the courses run (`outrunCourseTables`, `turboOutrunCourseTables`) to solve, every kind alike. A held table (kinds 1 to 3) is solved
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
    // Kinds 1 to 3 hold, counted at the speed.
    const held = heldKind(kind);
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
  "start, as road-profile's Change [from, to, change]; the grade is 0 at both ends but on a lap, whose grade at its " +
  "start and end is its `grade`. Looks are rows of the original's " +
  "224, both ways, over the hill frames; levelLook the level road's.";
const OUTRUN_ABOUT =
  "OUTRUN's and TURBO OUTRUN's height tables (TURBO OUTRUN's are OUTRUN's 225), each run alone on a level road; a held " +
  "table (kinds 1 and 3) at a speed, km/h. A stretch starts at the camera's station when the car is where the table " +
  'starts (6 m before it). Table 0 shows no hill.';
const FINAL_LAP_2_ABOUT =
  "FINAL LAP 2's laps, each by its course's name: its screen round its second lap of three alike, read through its " +
  "level camera at this game's focal length. A stretch starts at the camera's station when the car is at its table's " +
  'start; the grade is 0 there and at its end, a lap later.';
const CISCO_HEAT_ABOUT =
  "CISCO HEAT's stages' roads in parts, each by its stage, road and part: its road CPU's rows over the part, read " +
  "through its camera tilting with the road at this game's focal length. A road is cut at both ends of each run of at " +
  "least 200 m of the car whose screen shows no hill; a stretch starts at the camera's station when the car is at its " +
  "part's start, the grade 0 there and at its end.";
const ENDURO_RACER_ABOUT =
  "ENDURO RACER's normal path's cycle (256 positions from P & 0xFF = 0) and each hill's stretch of whole cycles (from " +
  "the cycle start at or before the hill's start; its length in cycles), read through its level camera at this game's " +
  "focal length. A stretch starts at the camera's station when the road position is the stretch's first.";

/**
 * Which pieces: every one, or those `--table` (with `--kmh` for a held one), `--cycle`, `--hill`, `--laps` (FINAL LAP 2's
 * four), `--course`, `--stage` (CISCO HEAT's two roads of each stage it lists, by their numbers) and `--piece` (one by
 * its name) name.
 */
function chosen(options: ReadonlyMap<string, string>) {
  const table = options.get('--table'),
    hill = options.get('--hill'),
    course = options.get('--course'),
    stage = options.get('--stage'),
    piece = options.get('--piece');
  const some =
    table !== undefined ||
    hill !== undefined ||
    course !== undefined ||
    stage !== undefined ||
    piece !== undefined ||
    options.has('--cycle') ||
    options.has('--laps');
  const named = (name: string) => !some || piece === name;
  return {
    table: (n: number, name: string, kmh?: number) =>
      named(name) ||
      (table !== undefined && Number(table) === n && (kmh === undefined || options.get('--kmh') === String(kmh))),
    cycle: named('cycle') || options.has('--cycle'),
    hill: (k: number, name: string) => named(name) || (hill !== undefined && Number(hill) === k),
    course: (name: string) => named(name) || options.has('--laps') || course === name,
    stage: (n: number, name: string) =>
      named(name) || (stage !== undefined && stage.split(',').map(Number).includes(n)),
  };
}

/** A piece of the file's, by its name: solved where chosen, kept otherwise, when it is taken. */
interface NextPiece {
  readonly piece: string;
  readonly take: () => KeptPiece;
}

export const SCREEN_PIECES_COMMANDS: RoadDataCommands = Object.freeze({
  'screen-pieces': command(
    {
      '--check': 'flag',
      '--table': 'value',
      '--kmh': 'value',
      '--cycle': 'flag',
      '--hill': 'value',
      '--laps': 'flag',
      '--course': 'value',
      '--stage': 'value',
      '--piece': 'value',
      '--sensitivity': 'flag',
      ...zipOptions(OUTRUN_ROMS, TURBO_OUTRUN_ROMS, ENDURO_RACER_ROMS, FINAL_LAP_2_ROMS, CISCO_HEAT_ROMS),
    },
    async function* (options) {
      const check = options.has('--check');
      const which = chosen(options);
      const outrun = assemblePrograms((await readSource(OUTRUN_ROMS, options)).set);
      const turbo = assembleTurboOutrunPrograms((await readSource(TURBO_OUTRUN_ROMS, options)).set);
      const er = assembleEnduroRacerPrograms((await readSource(ENDURO_RACER_ROMS, options)).set);
      const screen: EnduroRacerScreen = readEnduroRacerScreen(er);
      const fl2 = assembleFinalLap2((await readSource(FINAL_LAP_2_ROMS, options)).set);
      const cisco = (await readSource(CISCO_HEAT_ROMS, options)).set;
      const kept = JSON.parse(await readFile(FILE, 'utf8')) as PiecesFile;
      const solved: string[] = [];
      const seconds: Record<string, number> = {};
      const cells: Record<string, number> = {};
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
        const began = performance.now();
        const piece: KeptPiece = { ...head, ...solveWritten(frames) };
        seconds[name] = round((performance.now() - began) / 1000, 1);
        cells[name] = frames.b - frames.a;
        solved.push(name);
        if (JSON.stringify(piece) !== JSON.stringify(old))
          differ.push({ piece: name, metres: old ? round(heightDifference(piece, old), 4) : Infinity });
        if (search) {
          const { moved: moves, metres } = sensitivity(frames, piece);
          if (moves) moved.push({ piece: name, metres });
        }
        return piece;
      };
      const outrunPieces = outrunTasks(outrun, turbo).map((t): NextPiece => {
        const name = `table ${t.table}${t.kmh !== undefined ? ` at ${t.kmh} km/h` : ''}`;
        return {
          piece: name,
          take: () => {
            if (!which.table(t.table, name, t.kmh)) return keptPiece('outrun', name);
            const inputs = tableInputs(t.tables(t.table), t.clock, t.distances, t.kmh);
            const frames = outrunFrames(t.tables, t.table, t.runAt, t.clock, t.distances);
            return take({ piece: name, inputs }, frames, kepts.get(`outrun/${name}`));
          },
        };
      });
      const metres = enduroRacerPositionMetres(er);
      const inputs = enduroRacerInputs(screen, metres);
      const cycle: NextPiece = {
        piece: 'cycle',
        take: () =>
          which.cycle
            ? take(
                { piece: 'cycle', inputs, cycles: 1 },
                enduroRacerCycleFrames(screen, metres),
                kepts.get('enduro-racer/cycle'),
              )
            : keptPiece('enduro-racer', 'cycle'),
      };
      const hills = screen.hills.map((_, i): NextPiece => {
        const name = `hill ${i + 1}`;
        return {
          piece: name,
          take: () => {
            if (!which.hill(i + 1, name)) return keptPiece('enduro-racer', name);
            const frames = enduroRacerHillFrames(screen, i + 1, metres, readStages(er).positions);
            const cycles = ((frames.b - frames.a) * frames.cellPositions) / CYCLE;
            return take({ piece: name, inputs, cycles }, frames, kepts.get(`enduro-racer/${name}`));
          },
        };
      });
      const projection = readProjection(fl2);
      const fl2Metres = intervalMetres(fl2).unit;
      const slopes = readSlopeTables(fl2);
      const laps = readNames(fl2).map((name, c): NextPiece => ({
        piece: name,
        take: () => {
          if (!which.course(name)) return keptPiece('final-lap-2', name);
          const lap = finalLap2LapFrames(projection, slopes[c]!, fl2Metres);
          const head = { piece: name, inputs: finalLap2Inputs(projection, slopes[c]!, fl2Metres), cycles: 1 };
          return take(head, lap, kepts.get(`final-lap-2/${name}`));
        },
      }));
      const ciscoMain = assembleCiscoHeatMain(cisco);
      const ciscoCpus = [assembleCiscoHeatRoadCpu(cisco, 0), assembleCiscoHeatRoadCpu(cisco, 1)] as const;
      const ciscoScreen = readCiscoHeatScreen(ciscoCpus[0]);
      const ciscoMetres = ciscoHeatPositionMetres(ciscoMain);
      // A stage's two roads read alike where their 3D roads are one (STAGES 1 to 3): solved once, the other taking it
      // whether chosen or not.
      const solvedFrom = new Map<string, KeptPiece>();
      const stageRoads = ciscoHeatStageRoads(ciscoMain, ciscoCpus, ciscoMetres).map((r): NextPiece => ({
        piece: r.piece,
        take: () => {
          const head = { piece: r.piece, inputs: ciscoHeatInputs(ciscoScreen, r.arcs, r.from, r.to, ciscoMetres) };
          const same = solvedFrom.get(head.inputs);
          if (same) {
            const piece = { ...same, piece: r.piece };
            const old = kepts.get(`cisco-heat/${r.piece}`);
            if (JSON.stringify(piece) !== JSON.stringify(old))
              differ.push({ piece: r.piece, metres: old ? round(heightDifference(piece, old), 4) : Infinity });
            return piece;
          }
          if (!which.stage(r.stage + 1, r.piece)) return keptPiece('cisco-heat', r.piece);
          const frames = ciscoHeatRoadFrames(ciscoScreen, r.arcs, r.from, r.to, ciscoMetres);
          const piece = take(head, frames, kepts.get(`cisco-heat/${r.piece}`));
          solvedFrom.set(head.inputs, piece);
          return piece;
        },
      }));
      const outrunClock = readClock(outrun);
      const originals = [
        {
          original: 'outrun',
          about: OUTRUN_ABOUT,
          positionMetres: positionMetres(outrunClock),
          cellPositions: cellPositionsOf(positionMetres(outrunClock)),
          pieces: outrunPieces,
        },
        {
          original: 'enduro-racer',
          about: ENDURO_RACER_ABOUT,
          positionMetres: metres,
          cellPositions: cellPositionsOf(metres),
          pieces: [cycle, ...hills],
        },
        {
          original: 'final-lap-2',
          about: FINAL_LAP_2_ABOUT,
          positionMetres: fl2Metres,
          cellPositions: closedCellPositions(fl2Metres, LAP_UNITS),
          pieces: laps,
        },
        {
          original: 'cisco-heat',
          about: CISCO_HEAT_ABOUT,
          positionMetres: ciscoMetres,
          cellPositions: cellPositionsOf(ciscoMetres),
          pieces: stageRoads,
        },
      ];
      // The file as its pieces stand: each one taken so far, the others as kept, those with none kept and an original
      // with none left out.
      const taken = new Map<string, KeptPiece>();
      const fileNow = (): PiecesFile => ({
        about: ABOUT,
        camera: piecesCamera(),
        originals: originals
          .map(({ pieces, ...o }) => ({
            ...o,
            pieces: pieces.flatMap((p) => {
              const key = `${o.original}/${p.piece}`;
              return taken.get(key) ?? kepts.get(key) ?? [];
            }),
          }))
          .filter((o) => o.pieces.length > 0),
      });
      for (const { original, pieces } of originals)
        for (const next of pieces) {
          const count = solved.length;
          taken.set(`${original}/${next.piece}`, next.take());
          if (solved.length === count) continue;
          // Written as each piece is solved, so that a solve stopped keeps the pieces it has solved.
          if (!check) await atomicWrite(FILE, formatSavedJson(fileNow()));
          yield { piece: next.piece, cells: cells[next.piece], seconds: seconds[next.piece] };
        }
      if (check)
        requireInput(
          differ.length === 0,
          `/${FILE}`,
          `${differ.map((d) => `${d.piece} (${d.metres} m)`).join(', ')} differ from the pieces kept` +
            (search ? `; ${moved.map((d) => `${d.piece} (${d.metres} m)`).join(', ') || 'none'} move` : ''),
        );
      else await atomicWrite(FILE, formatSavedJson(fileNow()));
      yield { ok: true, checked: check, solved: solved.length, seconds, cells, differ, ...(search ? { moved } : {}) };
    },
    [OUTRUN_ROMS, TURBO_OUTRUN_ROMS, ENDURO_RACER_ROMS, FINAL_LAP_2_ROMS, CISCO_HEAT_ROMS],
  ),
});
