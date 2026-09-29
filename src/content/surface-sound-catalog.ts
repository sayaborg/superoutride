import type { AdmissionResult } from '../core/admission.js';
import { compileSurfaceSoundDocument } from '../audio/surface-sound-document.js';
import type { CompiledSurfaceSounds } from '../audio/surface-sounds.js';
import type { ContentDelivery } from './content-manifest.js';
import { requireLoaded } from './content-load-error.js';
import { admitSingleDocument, type DocumentSource } from './document-catalog.js';

/** The single surface-sound document's identifier: its file name and manifest ID. */
export const SURFACE_SOUNDS_ID = 'default';

/**
 * Admit the surface sounds from their sources, from the build's files or delivery's manifest alike: exactly one
 * document, named `default`. Resolution against the material catalog is `resolveSurfaceSoundRecords`.
 */
export function compileSurfaceSounds(sources: readonly DocumentSource[]): AdmissionResult<CompiledSurfaceSounds> {
  const single = admitSingleDocument(sources, SURFACE_SOUNDS_ID, 'surface sound document');
  if (!single.ok) return single;
  return compileSurfaceSoundDocument(single.value.value, single.value.path, single.value.sha256);
}

/** Transport verifies the saved bytes before admission; each composition loads the document once. */
export async function loadSurfaceSounds(content: ContentDelivery): Promise<CompiledSurfaceSounds> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'surface-sound'))
    sources.push({
      id: file.id,
      path: file.path,
      value: await content.json('surface-sound', file.id),
      sha256: file.sha256,
    });
  return requireLoaded(compileSurfaceSounds(sources));
}
