import type { AdmissionResult } from '../core/admission.js';
import { compileEngineSoundDocument, type EngineSoundCatalog } from '../audio/engine-sound-document.js';
import type { CompiledEngineSound } from '../audio/engine-sound.js';
import type { ContentDelivery } from './content-delivery.js';
import { requireLoaded } from './content-load-error.js';
import type { DocumentSource } from './document-catalog.js';

export type { EngineSoundCatalog };

/**
 * Admit the engine sounds from their sources, from the build's files or delivery's manifest alike. A sound's ID is
 * its document's file name without `.json`, which is also its manifest ID; the documents carry none.
 */
export function compileEngineSounds(sources: readonly DocumentSource[]): AdmissionResult<EngineSoundCatalog> {
  const sounds: Record<string, CompiledEngineSound> = {};
  for (const source of sources) {
    const sound = compileEngineSoundDocument(source.value, source.id, source.path, source.sha256);
    if (!sound.ok) return sound;
    sounds[source.id] = sound.value;
  }
  return Object.freeze({ ok: true as const, value: Object.freeze(sounds) });
}

/** Transport verifies every payload SHA before admission; each composition loads the catalog once and passes it on. */
export async function loadEngineSounds(content: ContentDelivery): Promise<EngineSoundCatalog> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'engine-sound'))
    sources.push({
      id: file.id,
      path: file.path,
      value: await content.json('engine-sound', file.id),
      sha256: file.sha256,
    });
  return requireLoaded(compileEngineSounds(sources));
}
