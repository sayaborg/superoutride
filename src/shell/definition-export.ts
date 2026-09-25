import { formatSavedJson } from '../core/saved-json.js';

/** Saves an admitted source document as a browser download named like its content file. */
export function downloadDefinition(fileName: string, document: unknown, documentRef: Document = globalThis.document) {
  const url = URL.createObjectURL(new Blob([formatSavedJson(document)], { type: 'application/json' }));
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
