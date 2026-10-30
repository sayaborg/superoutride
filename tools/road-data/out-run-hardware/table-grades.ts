/**
 * The grades' rule on the Out Run board ([Original road data](../../../docs/original-road-data.md#profile-from-the-originals-screen)):
 * OUTRUN's and TURBO OUTRUN's table runs graded by their screens' pieces, each piece taken only from what it was solved
 * from.
 */
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { cameraDistance } from '../../../src/view/camera.js';
import { inputError } from '../../authoring/authoring-error.js';
import type { BoardClock } from './clock.js';
import type { TableRun } from './hills.js';
import type { HeightTable } from './road-tables.js';
import type { Change } from '../shared/road-profile.js';
import { piecesDigest, placedChanges, screenPieces, type Stretch } from '../shared/screen-pieces.js';

/**
 * What a height table's piece is solved from, as a SHA-256: the table's kind and words, the original's clock and line
 * distances, and a held table's speed. The pieces' file records each piece's; an original whose own ROMs give its
 * tables' the same uses them, so TURBO OUTRUN's tables are checked against the pieces OUTRUN's solved without its zip.
 */
export function tableInputs(table: HeightTable, clock: BoardClock, distances: Float64Array, kmh?: number): string {
  const { kind, ...rest } = table as HeightTable & { readonly address?: number };
  delete (rest as { address?: number }).address;
  return piecesDigest({
    table: { kind, ...rest },
    clock,
    distances: [...distances],
    ...(kmh === undefined ? {} : { kmh }),
  });
}

/**
 * The grades of OUTRUN's or TURBO OUTRUN's table runs over a stretch the original runs on without a stop (a road, a
 * leg): each run's piece whole, its table's and, held, at `kmh`, its stretch from this game's camera's place when the
 * table starts, its distance before the car's station there (`station(position)`), on the road to `end`; their grades
 * add where the pieces overlap. Kind 4's tables have none; a run whose piece the file lacks, or whose piece was solved
 * from other inputs than this original's table, `clock` and line `distances` (`tableInputs`), stops the conversion.
 * With the stretches placed.
 */
export function tableGrades(
  runs: readonly TableRun[],
  kmh: number,
  station: (position: number) => number,
  end: number,
  solved: { readonly clock: BoardClock; readonly distances: Float64Array },
): { changes: Change[]; stretches: Stretch[] } {
  const pieces = screenPieces('outrun');
  const camera = cameraDistance(CAMERA_DEFINITION);
  const stretches: Stretch[] = [];
  const changes = runs.flatMap((run) => {
    if (run.table.kind === 4) return [];
    // A held table's piece is its speed's; another's is the table's alone.
    const piece = pieces.piece(`table ${run.number} at ${kmh} km/h`) ?? pieces.piece(`table ${run.number}`);
    if (!piece)
      throw inputError(
        '/tools/road-data/shared/screen-pieces.json',
        `Height table ${run.number} has no piece at ${kmh} km/h`,
      );
    // The piece holds for what it was solved from alone: this original's own table, clock and lines.
    if (piece.inputs !== tableInputs(run.table, solved.clock, solved.distances, run.table.kind === 0 ? undefined : kmh))
      throw inputError(
        '/tools/road-data/shared/screen-pieces.json',
        `Height table ${run.number}'s piece was solved from other inputs than these ROMs': solve it again (screen-pieces)`,
      );
    const start = station(run.start) - camera;
    if (piece.stretch > 0) stretches.push({ from: start, to: start + piece.stretch });
    return placedChanges(piece, start, end);
  });
  return { changes, stretches };
}
