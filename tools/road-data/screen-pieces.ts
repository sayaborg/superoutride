/**
 * The grades' pieces ([Original road data](../../docs/original-road-data.md#profile-from-the-originals-screen)), read
 * once from `screen-pieces.json`, which K's researcher solved: each piece the changes of grade over its stretch, metres
 * from the stretch's start, the grade 0 at both ends and within `GRADE_LIMIT`.
 */
import { readFileSync } from 'node:fs';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { cameraDistance } from '../../src/view/camera.js';
import { requireInput } from '../course/authoring-io.js';
import { GRADE_LIMIT } from './crossings.js';
import type { TableRun } from './hills.js';
import type { Change } from './road-profile.js';

/** A piece: its stretch, metres, and the changes of grade over it, stations from the stretch's start. */
export interface Piece {
  readonly stretch: number;
  readonly changes: readonly Change[];
}

/** OUTRUN's and TURBO OUTRUN's pieces: a height table's, by its number, and a held table's (kinds 1 and 3) at a speed. */
export interface OutrunPieces {
  /** A road position, metres. */
  readonly positionMetres: number;
  piece(table: number, kmh: number): Piece | undefined;
}

/** ENDURO RACER's pieces: the normal path's cycle and each hill's, by its number from 1, its stretch whole cycles. */
export interface EnduroRacerPieces {
  /** A road position, metres. */
  readonly positionMetres: number;
  readonly cycle: Piece;
  readonly hills: readonly (Piece & { readonly cycles: number })[];
}

/** Grades and stations nearer than this are one: the file writes stations to the micrometre and changes to 1e-9. */
const ONE = 1e-8;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * A piece's changes at `path`, admitted: each `[from, to, change]` within `[0, stretch]`, `from` before `to`; their sum
 * 0, so that the grade ends level; the grade, at the changes' ends where it is steepest, within `GRADE_LIMIT`.
 */
function admitPiece(value: unknown, path: string, stretch: number): Change[] {
  requireInput(Array.isArray(value), path, "A piece's changes are an array");
  const changes = value.map((c: unknown, i) => {
    requireInput(
      Array.isArray(c) && c.length === 3 && c.every(isNumber),
      `${path}/${i}`,
      'A change is [from, to, change]',
    );
    const [from, to, change] = c as number[];
    requireInput(0 <= from! && from! < to! && to! <= stretch, `${path}/${i}`, 'A change lies within its stretch');
    return Object.freeze({ from: from!, to: to!, change: change! });
  });
  requireInput(Math.abs(changes.reduce((sum, c) => sum + c.change, 0)) <= ONE, path, "A piece's grade ends at 0");
  const grade = (s: number) =>
    changes.reduce((g, c) => g + c.change * Math.min(1, Math.max(0, (s - c.from) / (c.to - c.from))), 0);
  for (const s of changes.flatMap((c) => [c.from, c.to]))
    requireInput(Math.abs(grade(s)) <= GRADE_LIMIT + ONE, path, `A piece's grade passes ±${GRADE_LIMIT}`);
  return changes;
}

/** A stretch at `path`: metres, positive. */
function admitStretch(value: unknown, path: string): number {
  requireInput(isNumber(value) && value > 0, path, 'A stretch is a positive length');
  return value;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

let read: { outrun: OutrunPieces; enduroRacer: EnduroRacerPieces } | undefined;

/** The pieces' file, admitted once: its shape, and each piece's changes by `admitPiece`. */
export function screenPieces(): { outrun: OutrunPieces; enduroRacer: EnduroRacerPieces } {
  if (read) return read;
  const file = '/tools/road-data/screen-pieces.json';
  const document: unknown = JSON.parse(readFileSync(new URL('screen-pieces.json', import.meta.url), 'utf8'));
  requireInput(isRecord(document) && isRecord(document.outrun) && isRecord(document.enduroRacer), file, 'Its shape');
  const { outrun, enduroRacer } = document;

  requireInput(isNumber(outrun.positionMetres) && Array.isArray(outrun.pieces), `${file}/outrun`, 'Its shape');
  const tables = new Map<string, Piece>();
  outrun.pieces.forEach((p: unknown, i) => {
    const path = `${file}/outrun/pieces/${i}`;
    requireInput(isRecord(p) && Number.isInteger(p.table), path, 'A piece names its table');
    requireInput(p.kmh === undefined || isNumber(p.kmh), `${path}/kmh`, 'A held piece names its speed');
    const key = `${p.table}${p.kmh === undefined ? '' : `@${p.kmh}`}`;
    requireInput(!tables.has(key), path, 'One piece a table and speed');
    // A table whose screen shows no hill is level: no stretch, no changes.
    const stretch = p.stretch === null ? 0 : admitStretch(p.stretch, `${path}/stretch`);
    const changes = admitPiece(p.changes, `${path}/changes`, stretch);
    requireInput(stretch > 0 || changes.length === 0, path, 'A level piece has no changes');
    tables.set(key, Object.freeze({ stretch, changes: Object.freeze(changes) }));
  });

  const ER = `${file}/enduroRacer`;
  requireInput(
    isNumber(enduroRacer.positionMetres) && isRecord(enduroRacer.cycle) && Array.isArray(enduroRacer.hills),
    ER,
    'Its shape',
  );
  const cycled = (p: unknown, path: string) => {
    requireInput(isRecord(p) && Number.isInteger(p.cycles) && (p.cycles as number) > 0, path, 'Whole cycles');
    const stretch = admitStretch(p.stretch, `${path}/stretch`);
    return {
      cycles: p.cycles as number,
      stretch,
      changes: Object.freeze(admitPiece(p.changes, `${path}/changes`, stretch)),
    };
  };
  const { stretch, changes } = cycled(enduroRacer.cycle, `${ER}/cycle`);
  const hills = enduroRacer.hills.map((p: unknown, i) => {
    requireInput(isRecord(p) && p.hill === i + 1, `${ER}/hills/${i}`, 'The hills in order from 1');
    return Object.freeze(cycled(p, `${ER}/hills/${i}`));
  });

  read = Object.freeze({
    outrun: Object.freeze({
      positionMetres: outrun.positionMetres,
      piece: (table: number, kmh: number) => tables.get(`${table}@${kmh}`) ?? tables.get(`${table}`),
    }),
    enduroRacer: Object.freeze({
      positionMetres: enduroRacer.positionMetres,
      cycle: Object.freeze({ stretch, changes }),
      hills: Object.freeze(hills),
    }),
  });
  return read;
}

/** Where a piece's stretch lies on a road, stations. */
export interface Stretch {
  readonly from: number;
  readonly to: number;
}

/** `piece`'s changes, its stretch from station `start`, cut where the road `[0, end]` ends, their curvatures kept. */
export function placedChanges(piece: Piece, start: number, end: number): Change[] {
  return piece.changes.flatMap((c) => {
    const [from, to] = [Math.max(0, c.from + start), Math.min(end, c.to + start)];
    return to > from ? [{ from, to, change: (c.change * (to - from)) / (c.to - c.from) }] : [];
  });
}

/**
 * The grades of OUTRUN's or TURBO OUTRUN's table runs over a stretch the original runs on without a stop (a road, a
 * leg): each run's piece whole, its table's and, held, at `kmh`, its stretch from this game's camera's place when the
 * table starts, its distance before the car's station there (`station(position)`), on the road to `end`; their grades
 * add where the pieces overlap. Kind 4's tables have none; a run whose piece the file lacks stops the conversion. With
 * the stretches placed.
 */
export function tableGrades(
  runs: readonly TableRun[],
  kmh: number,
  station: (position: number) => number,
  end: number,
): { changes: Change[]; stretches: Stretch[] } {
  const { outrun } = screenPieces();
  const camera = cameraDistance(CAMERA_DEFINITION);
  const stretches: Stretch[] = [];
  const changes = runs.flatMap((run) => {
    if (run.table.kind === 4) return [];
    const piece = outrun.piece(run.number, kmh);
    if (!piece) throw new RangeError(`Height table ${run.number} has no piece at ${kmh} km/h`);
    const start = station(run.start) - camera;
    if (piece.stretch > 0) stretches.push({ from: start, to: start + piece.stretch });
    return placedChanges(piece, start, end);
  });
  return { changes, stretches };
}

/** How many of `stretches` begin within one before them, and the metres they overlap. */
export function overlaps(stretches: readonly Stretch[]): { count: number; metres: number } {
  let count = 0,
    metres = 0,
    reach = -Infinity;
  for (const s of [...stretches].sort((a, b) => a.from - b.from)) {
    if (s.from < reach) {
      count++;
      metres += Math.min(reach, s.to) - s.from;
    }
    reach = Math.max(reach, s.to);
  }
  return { count, metres };
}
