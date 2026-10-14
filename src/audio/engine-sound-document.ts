import {
  admit,
  deepFreeze,
  admitDomain,
  readArray,
  readDocument,
  readNumber,
  readRecord,
  type AdmissionResult,
} from '../core/admission.js';
import { compileEngineSound, type CompiledEngineSound, type EngineSound, type ExhaustPipe } from './engine-sound.js';

export const ENGINE_SOUND_DOCUMENT_FORMAT = 'superoutride.engine-sound';
export const ENGINE_SOUND_DOCUMENT_VERSION = 1;

/** The `superoutride.engine-sound` document of an engine sound and its notes: what the DEV export saves. */
export function engineSoundDocument(sound: EngineSound & { readonly metadata: unknown }) {
  const { cycleRevolutions, firingPhases, exhaust, metadata } = sound;
  return {
    format: ENGINE_SOUND_DOCUMENT_FORMAT,
    version: ENGINE_SOUND_DOCUMENT_VERSION,
    cycleRevolutions,
    firingPhases,
    exhaust,
    metadata,
  };
}

/** Admitted engine sounds by sound ID; vehicle listings resolve their `sound` here. */
export type EngineSoundCatalog = Readonly<Record<string, CompiledEngineSound>>;

/**
 * Admit one `superoutride.engine-sound` version 1 document. The reader checks format, version and field shapes;
 * `compileEngineSound` alone validates the values. `metadata` is authoring commentary, kept as written and not read.
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
      ENGINE_SOUND_DOCUMENT_FORMAT,
      ENGINE_SOUND_DOCUMENT_VERSION,
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
    const sound = admitDomain(() => compileEngineSound(definition));
    return Object.freeze({ ...sound, id, sha256, metadata: deepFreeze(v.metadata) });
  });
}
