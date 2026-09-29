import {
  AdmissionError,
  admit,
  readArray,
  readDocument,
  readNumber,
  readRecord,
  type AdmissionResult,
} from '../core/admission.js';
import { compileEngineSound, type CompiledEngineSound, type ExhaustPipe } from './engine-sound.js';

/** Admitted engine sounds by sound ID; vehicle listings resolve their `sound` here. */
export type EngineSoundCatalog = Readonly<Record<string, CompiledEngineSound>>;

/**
 * Admit one `superoutride.engine-sound` version 1 document. The reader checks format, version and field shapes;
 * `compileEngineSound` alone validates the values. `metadata` is authoring commentary and is not read.
 */
export function compileEngineSoundDocument(
  value: unknown,
  id: string,
  path: string,
  sha256: string,
): AdmissionResult<CompiledEngineSound> {
  return admit(path, () => {
    const v = readDocument(
      value,
      ['format', 'version', 'cycleRevolutions', 'firingPhases', 'exhaust', 'metadata'],
      'superoutride.engine-sound',
      1,
    );
    const numbers = (item: unknown, at: string) => readArray(item, at, (x, pointer) => readNumber(x, pointer));
    const exhaust = readRecord(v.exhaust, '/exhaust', ['banks', 'lengths', 'pipes']);
    const pipes = readArray(exhaust.pipes, '/exhaust/pipes', (item, at): ExhaustPipe => {
      const pipe = readRecord(item, at, ['length', 'from', 'to']);
      return {
        length: readNumber(pipe.length, `${at}/length`),
        from: readNumber(pipe.from, `${at}/from`),
        to: pipe.to === null ? null : readNumber(pipe.to, `${at}/to`),
      };
    });
    const definition = {
      cycleRevolutions: readNumber(v.cycleRevolutions, '/cycleRevolutions') as 1 | 2,
      firingPhases: numbers(v.firingPhases, '/firingPhases'),
      exhaust: {
        banks: numbers(exhaust.banks, '/exhaust/banks'),
        lengths: numbers(exhaust.lengths, '/exhaust/lengths'),
        pipes,
      },
    };
    let sound;
    try {
      sound = compileEngineSound(definition);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new AdmissionError('invalid_value', '', error.message);
    }
    return Object.freeze({ ...sound, id, sha256 });
  });
}
