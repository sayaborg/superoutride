import type { AdmissionResult } from '../core/admission.js';
import { requireLoaded } from './content-load-error.js';
import type { ContentDelivery } from './content-manifest.js';

/** Generated products are admitted with their delivered path as the diagnostic document. */
export async function admitProduct<T>(
  content: ContentDelivery,
  kind: 'envelope' | 'budget',
  id: string,
  read: (value: unknown, document: string) => Promise<AdmissionResult<T>>,
): Promise<T> {
  const value = await content.json(kind, id);
  const document = content.manifest.files.find((file) => file.kind === kind && file.id === id)!.path;
  return requireLoaded(await read(value, document));
}
