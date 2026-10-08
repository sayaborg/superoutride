import {
  AdmissionError,
  admit,
  readDictionary,
  readDocument,
  readNumber,
  readRecord,
  readString,
  type AdmissionResult,
} from '../core/admission.js';
import { compileFrictionInput, type FrictionInput } from './surface-sounds.js';

/** One wall sound: the friction system's input from a wall rubbed along, as a surface's friction input. */
export type WallSound = Readonly<{ friction: FrictionInput }>;

/** Admitted wall sounds by ID, the record course limits use, and the delivered document's SHA-256. */
export interface CompiledWallSounds {
  readonly walls: Readonly<Record<string, WallSound>>;
  /** The ID of the record every course limit uses. */
  readonly courseLimit: string;
  readonly sha256: string;
}

export const WALL_SOUND_DOCUMENT_FORMAT = 'superoutride.wall-sounds';
export const WALL_SOUND_DOCUMENT_VERSION = 1;
/** The transport bound on wall sound numbers: the scraping worklet's `wall` parameter range, as for surface sounds. */
export const WALL_SOUND_LIMIT = 256;

/**
 * Admit the `superoutride.wall-sounds` version 1 document: at most `WALL_SOUND_LIMIT` records, one per wall-sound ID,
 * each holding its friction input with the surface sounds' one value check (`compileFrictionInput`), and `courseLimit`,
 * the ID of the record course limits use, which must name a record.
 */
export function compileWallSoundDocument(
  value: unknown,
  path: string,
  sha256: string,
): AdmissionResult<CompiledWallSounds> {
  return admit(path, () => {
    const v = readDocument(
      value,
      ['format', 'version', 'courseLimit', 'walls'],
      WALL_SOUND_DOCUMENT_FORMAT,
      WALL_SOUND_DOCUMENT_VERSION,
    );
    const walls = readDictionary(v.walls, '/walls', (entry, at): WallSound => {
      const friction = readRecord(readRecord(entry, at, ['friction']).friction, `${at}/friction`, [
        'roughness',
        'susceptibility',
      ]);
      try {
        return Object.freeze({
          friction: compileFrictionInput({
            roughness: readNumber(friction.roughness, `${at}/friction/roughness`),
            susceptibility: readNumber(friction.susceptibility, `${at}/friction/susceptibility`),
          }),
        });
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        throw new AdmissionError('invalid_value', `${at}/friction`, error.message);
      }
    });
    if (Object.keys(walls).length > WALL_SOUND_LIMIT)
      throw new AdmissionError('resource_limit', '/walls', `At most ${WALL_SOUND_LIMIT} wall sounds are admitted`);
    const courseLimit = readString(v.courseLimit, '/courseLimit');
    if (!Object.hasOwn(walls, courseLimit))
      throw new AdmissionError('unresolved_reference', '/courseLimit', `No wall sound ${courseLimit}`);
    return Object.freeze({ walls, courseLimit, sha256 });
  });
}

/** The wall sounds as the scraping worklet takes them: the records in ID order and each line's number among them. */
export interface WallSoundRecords {
  readonly walls: readonly WallSound[];
  /** The number of a line's wall sound: its wall's ID, or the course limits' record for null. */
  indexOf(sound: string | null): number;
}

/** Number the admitted wall sounds for transport. */
export function wallSoundRecords(sounds: CompiledWallSounds): WallSoundRecords {
  const ids = Object.keys(sounds.walls).sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  return Object.freeze({
    walls: Object.freeze(ids.map((id) => sounds.walls[id]!)),
    indexOf: (sound: string | null) => index.get(sound ?? sounds.courseLimit) ?? -1,
  });
}

/** The wall sound of a barrier line: its wall's `sound`, or the course limits' record for a course limit (null). */
export function barrierWallSound(sounds: CompiledWallSounds, sound: string | null): WallSound {
  const record = sounds.walls[sound ?? sounds.courseLimit];
  if (!record) throw new RangeError(`No wall sound ${sound}`);
  return record;
}
