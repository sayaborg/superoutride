import type { AdmissionResult } from '../core/admission.js';
import { compileSurfaceMaterialDocument, type SurfaceMaterialCatalog } from '../course/surface-material.js';
import type { ContentDelivery } from './content-delivery.js';
import { requireLoaded } from './content-load-error.js';
import { admitSingleDocument, type DocumentSource } from './document-catalog.js';

/** The single surface-material document's identifier: its file name and manifest ID. */
export const SURFACE_MATERIALS_ID = 'surface';

/**
 * Admit the material catalog from its sources, from the build's files or delivery's manifest alike:
 * exactly one document, named `surface`.
 */
export function compileSurfaceMaterials(sources: readonly DocumentSource[]): AdmissionResult<SurfaceMaterialCatalog> {
  const single = admitSingleDocument(sources, SURFACE_MATERIALS_ID, 'surface material document');
  if (!single.ok) return single;
  return compileSurfaceMaterialDocument(single.value.value, single.value.path, single.value.sha256);
}

/**
 * Transport verifies the saved bytes before the catalog admission validates the material document.
 * Each composition loads the catalog once and passes it on.
 */
export async function loadSurfaceMaterials(content: ContentDelivery): Promise<SurfaceMaterialCatalog> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'material'))
    sources.push({ id: file.id, path: file.path, value: await content.json('material', file.id), sha256: file.sha256 });
  return requireLoaded(compileSurfaceMaterials(sources));
}
