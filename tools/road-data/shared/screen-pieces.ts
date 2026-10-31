/**
 * The grades' rule ([Original road data](../../../docs/original-road-data.md#profile-from-the-originals-screen)): a 3D
 * road's factor, and the pieces of a screen read back, read once from `screen-pieces.json`, which K's researcher
 * solved: each piece the changes of grade over its stretch, metres from the stretch's start, the grade 0 at both ends
 * and within `GRADE_LIMIT`.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { inputError, requireInput } from '../../authoring/authoring-error.js';
import { GRADE_LIMIT } from './shared-constants.js';
import type { Change, Profile } from './road-profile.js';

/** A piece: its stretch, metres, and the changes of grade over it, stations from the stretch's start. */
export interface Piece {
  readonly stretch: number;
  readonly changes: readonly Change[];
}

/**
 * This game's camera's values the pieces are solved for ([Rules of the
 * originals](../../../docs/original-road-data.md#rules-of-the-originals), the canon's inputs): its focal length, horizon
 * row and height. The pieces' file records those it was solved for.
 */
export const piecesCamera = () => ({
  focalLength: CAMERA_DEFINITION.focalLength,
  horizonRow: CAMERA_DEFINITION.horizonRow,
  height: CAMERA_DEFINITION.height,
});

/** The SHA-256 of what a piece is solved from, as the pieces' file records it. */
export const piecesDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * An original's pieces: its road position's metres, and each piece by its name (a height table's `table <n>`, held at a
 * speed `table <n> at <kmh> km/h`; ENDURO RACER's `cycle` and `hill <k>`), with what it was solved from (`inputs`) and,
 * where its stretch is whole cycles, how many.
 */
export interface OriginalPieces {
  /** A road position, metres. */
  readonly positionMetres: number;
  piece(name: string): (Piece & { readonly inputs: string; readonly cycles?: number }) | undefined;
}

/** Grades and stations nearer than this are one: the file writes stations to the micrometre and changes to 1e-9. */
const SAME_IN_FILE = 1e-8;

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
  requireInput(
    Math.abs(changes.reduce((sum, c) => sum + c.change, 0)) <= SAME_IN_FILE,
    path,
    "A piece's grade ends at 0",
  );
  const grade = (s: number) =>
    changes.reduce((g, c) => g + c.change * Math.min(1, Math.max(0, (s - c.from) / (c.to - c.from))), 0);
  for (const s of changes.flatMap((c) => [c.from, c.to]))
    requireInput(Math.abs(grade(s)) <= GRADE_LIMIT + SAME_IN_FILE, path, `A piece's grade passes ±${GRADE_LIMIT}`);
  return changes;
}

/** A stretch at `path`: metres, positive. */
function admitStretch(value: unknown, path: string): number {
  requireInput(isNumber(value) && value > 0, path, 'A stretch is a positive length');
  return value;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

let read: ReadonlyMap<string, OriginalPieces> | undefined;

/**
 * Original `original`'s pieces from the pieces' file, which is admitted once: its shape, the camera it was solved for,
 * one entry an original and one piece a name, and each piece's changes by `admitPiece`.
 */
export function screenPieces(original: string): OriginalPieces {
  read ??= readPieces();
  const pieces = read.get(original);
  if (!pieces) throw inputError(PIECES_FILE, `The pieces' file holds no pieces of ${original}`);
  return pieces;
}

const PIECES_FILE = '/tools/road-data/shared/screen-pieces.json';

function readPieces(): ReadonlyMap<string, OriginalPieces> {
  const file = PIECES_FILE;
  const document: unknown = JSON.parse(readFileSync(new URL('./screen-pieces.json', import.meta.url), 'utf8'));
  requireInput(isRecord(document) && Array.isArray(document.originals), file, 'Its shape');
  // The pieces hold for the camera they were solved for alone.
  const camera = JSON.stringify(piecesCamera());
  requireInput(
    JSON.stringify(document.camera) === camera,
    `${file}/camera`,
    `The pieces were solved for the camera ${JSON.stringify(document.camera)}, not this game's ${camera}: solve them again (screen-pieces)`,
  );
  const originals = new Map<string, OriginalPieces>();
  document.originals.forEach((o: unknown, k) => {
    const at = `${file}/originals/${k}`;
    requireInput(
      isRecord(o) && typeof o.original === 'string' && isNumber(o.positionMetres) && Array.isArray(o.pieces),
      at,
      'Its shape',
    );
    requireInput(!originals.has(o.original), `${at}/original`, 'One entry an original');
    const named = new Map<string, Piece & { readonly inputs: string; readonly cycles?: number }>();
    o.pieces.forEach((p: unknown, i) => {
      const path = `${at}/pieces/${i}`;
      requireInput(isRecord(p) && typeof p.piece === 'string', path, 'A piece is named');
      requireInput(!named.has(p.piece), `${path}/piece`, 'One piece a name');
      requireInput(typeof p.inputs === 'string', `${path}/inputs`, 'A piece records what it was solved from');
      requireInput(
        p.cycles === undefined || (Number.isInteger(p.cycles) && (p.cycles as number) > 0),
        `${path}/cycles`,
        'Whole cycles',
      );
      // A piece whose screen shows no hill is level: no stretch, no changes.
      const stretch = p.stretch === null ? 0 : admitStretch(p.stretch, `${path}/stretch`);
      const changes = admitPiece(p.changes, `${path}/changes`, stretch);
      requireInput(stretch > 0 || changes.length === 0, path, 'A level piece has no changes');
      named.set(
        p.piece,
        Object.freeze({
          stretch,
          changes: Object.freeze(changes),
          inputs: p.inputs,
          ...(p.cycles === undefined ? {} : { cycles: p.cycles as number }),
        }),
      );
    });
    originals.set(
      o.original,
      Object.freeze({ positionMetres: o.positionMetres, piece: (name: string) => named.get(name) }),
    );
  });
  return originals;
}

/**
 * A 3D road's factor by the grades' rule: its original's lens ratio, its focal length over this game's in screen
 * heights (`focalRows` of the original's `screenRows`), or less, `GRADE_LIMIT` over the road's `steepest` grade,
 * where that would pass the limit.
 */
export function lensFactor(focalRows: number, screenRows: number, steepest: number): number {
  const game = CAMERA_DEFINITION.focalLength / (2 * CAMERA_DEFINITION.horizonRow);
  return Math.min(focalRows / screenRows / game, GRADE_LIMIT / steepest);
}

/**
 * A profile's steepest grade: its grade is linear within a bend and constant between, so it is at a bend's end or
 * either side of a kink.
 */
export function steepestGrade(profile: Profile): number {
  const at = [
    ...profile.bends.flatMap((b) => [b.from, b.to]),
    ...profile.kinks.flatMap((k) => [k.at - 1e-9, k.at + 1e-9]),
  ];
  return Math.max(0, ...at.map((s) => Math.abs(profile.grade(s))));
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
