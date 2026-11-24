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
import { compileEngineSound, type CompiledEngineSound, type EngineSound, type ExhaustTube } from './engine-sound.js';

export const ENGINE_SOUND_DOCUMENT_FORMAT = 'superoutride.engine-sound';
export const ENGINE_SOUND_DOCUMENT_VERSION = 3;

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
 * Admit one `superoutride.engine-sound` version 3 document. The reader checks format, version and field shapes;
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
    const exhaust = readRecord(v.exhaust, '/exhaust', ['valve', 'diameter', 'tubes']);
    const valve = readRecord(exhaust.valve, '/exhaust/valve', ['diameter', 'open']);
    const end = (value: unknown, at: string) => (value === null ? null : readNumber(value, at));
    const tubes = readArray(exhaust.tubes, '/exhaust/tubes', (item, at): ExhaustTube => {
      const tube = readRecord(item, at, ['from', 'to', 'length']);
      return {
        from: end(tube.from, `${at}/from`),
        to: end(tube.to, `${at}/to`),
        length: readNumber(tube.length, `${at}/length`),
      };
    });
    const definition = {
      cycleRevolutions: readNumber(v.cycleRevolutions, '/cycleRevolutions') as 1 | 2,
      firingPhases: readArray(v.firingPhases, '/firingPhases', (x, pointer) => readNumber(x, pointer)),
      exhaust: {
        valve: {
          diameter: readNumber(valve.diameter, '/exhaust/valve/diameter'),
          open: readNumber(valve.open, '/exhaust/valve/open'),
        },
        diameter: readNumber(exhaust.diameter, '/exhaust/diameter'),
        tubes,
      },
    };
    const sound = admitDomain(() => compileEngineSound(definition));
    return Object.freeze({ ...sound, id, sha256, metadata: deepFreeze(v.metadata) });
  });
}
