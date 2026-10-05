import {
  AdmissionError,
  admit,
  readDocument,
  readNumber,
  readRecord,
  readString,
  type AdmissionResult,
} from '../core/admission.js';
import { TEXT_CHARACTERS } from '../image/text-tiles.js';

/** One track: its music document's values. Its recording is `music/<id>`. */
export interface MusicTrack {
  /** The document's file name without `.json`; documents carry none. */
  readonly id: string;
  /** The title SELECT MUSIC lists, in text-tile characters. */
  readonly title: string;
  /** The list order: a positive integer, unique among tracks. */
  readonly selectionOrder: number;
  /** Seconds from the start of the decoded recording: playback returns from `end` to `start`. */
  readonly loop: Readonly<{ start: number; end: number }>;
  readonly sha256: string;
}

export const MUSIC_DOCUMENT_FORMAT = 'superoutride.music';
export const MUSIC_DOCUMENT_VERSION = 1;

/**
 * Admit one `superoutride.music` version 1 document: `title` in text-tile characters, a positive integer
 * `selectionOrder` and `loop` with `0 <= start < end`. The recording's length and the catalog's rules are checked
 * where the recordings are admitted.
 */
export function compileMusicDocument(
  value: unknown,
  id: string,
  path: string,
  sha256: string,
): AdmissionResult<MusicTrack> {
  return admit(path, () => {
    const v = readDocument(
      value,
      ['format', 'version', 'title', 'selectionOrder', 'loop'],
      MUSIC_DOCUMENT_FORMAT,
      MUSIC_DOCUMENT_VERSION,
    );
    const title = readString(v.title, '/title', {
      pattern: TEXT_CHARACTERS,
      patternMessage: 'Expected only characters the text tiles draw',
    });
    const selectionOrder = readNumber(v.selectionOrder, '/selectionOrder', { min: 1, integer: true });
    const loop = readRecord(v.loop, '/loop', ['start', 'end']);
    const start = readNumber(loop.start, '/loop/start', { min: 0 });
    const end = readNumber(loop.end, '/loop/end', { min: 0 });
    if (end <= start) throw new AdmissionError('invalid_value', '/loop/end', 'Expected the loop end after its start');
    return Object.freeze({ id, title, selectionOrder, loop: Object.freeze({ start, end }), sha256 });
  });
}
