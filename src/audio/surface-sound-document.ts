import {
  admit,
  admitDomain,
  readDictionary,
  readDocument,
  readNumber,
  readRecord,
  relativePointer,
  type AdmissionResult,
} from '../core/admission.js';
import { compileSurfaceSound, type CompiledSurfaceSounds } from './surface-sounds.js';

/**
 * Admit the `superoutride.surface-sounds` version 1 document: one record per material ID. The reader checks format,
 * version and field shapes; `compileSurfaceSound` alone validates the values.
 */
export function compileSurfaceSoundDocument(
  value: unknown,
  path: string,
  sha256: string,
): AdmissionResult<CompiledSurfaceSounds> {
  return admit(path, () => {
    const v = readDocument(value, ['format', 'version', 'surfaces'], 'superoutride.surface-sounds', 1);
    const surfaces = readDictionary(v.surfaces, '/surfaces', (entry, at) => {
      const record = readRecord(entry, at, ['rolling', 'friction']);
      const rollingKeys = ['low', 'high', 'textureLengthMeters', 'textureDepth'] as const;
      const frictionKeys = ['roughness', 'susceptibility'] as const;
      const numbers = <K extends string>(item: unknown, base: string, keys: readonly K[]) => {
        const fields = readRecord(item, base, keys);
        return Object.fromEntries(keys.map((key) => [key, readNumber(fields[key], `${base}/${key}`)])) as Record<
          K,
          number
        >;
      };
      const sound = {
        rolling: numbers(record.rolling, `${at}/rolling`, rollingKeys),
        friction: numbers(record.friction, `${at}/friction`, frictionKeys),
      };
      return admitDomain(
        () => compileSurfaceSound(sound),
        (path) => relativePointer(path, at),
      );
    });
    return Object.freeze({ surfaces, sha256 });
  });
}
