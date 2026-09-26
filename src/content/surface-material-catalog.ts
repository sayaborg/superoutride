import { admit, requireAdmission, type AdmissionResult } from '../core/admission.js';
import { compileSurfaceMaterialDocument, type SurfaceMaterialCatalog } from '../course/surface-material.js';
import type { ContentDelivery } from './content-manifest.js';
import { requireLoaded } from './content-load-error.js';
import { admitSingleDocument, type DocumentSource } from './document-catalog.js';

/**
 * Admit the material catalog from its sources, from the build's files or delivery's manifest alike:
 * exactly one document, named `surface`, whose ID is its file name.
 */
export function compileSurfaceMaterials(sources: readonly DocumentSource[]): AdmissionResult<SurfaceMaterialCatalog> {
  const single = admitSingleDocument(sources, 'surface', 'surface material document');
  if (!single.ok) return single;
  const { id, path, value } = single.value;
  const catalog = compileSurfaceMaterialDocument(value, path);
  if (!catalog.ok) return catalog;
  const identity = admit(path, () =>
    requireAdmission(
      catalog.value.source.id === id,
      'invalid_value',
      '/id',
      `Expected the file name ${id} as the document ID`,
    ),
  );
  return identity.ok ? catalog : identity;
}

/**
 * Transport verifies the saved bytes before the catalog admission validates the material document.
 * Each composition loads the catalog once and passes it on.
 */
export async function loadSurfaceMaterials(content: ContentDelivery): Promise<SurfaceMaterialCatalog> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'material'))
    sources.push({ id: file.id, path: file.path, value: await content.json('material', file.id) });
  return requireLoaded(compileSurfaceMaterials(sources));
}
