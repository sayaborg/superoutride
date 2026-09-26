import { admit, requireAdmission, type AdmissionResult } from '../core/admission.js';

/** One authored document: its identifier (the file name, which is also its manifest ID), path and value. */
export interface DocumentSource {
  readonly id: string;
  readonly path: string;
  readonly value: unknown;
}

/** The single-document rule: exactly one source, named `id`. A failure names the extra or misnamed source. */
export function admitSingleDocument(
  sources: readonly DocumentSource[],
  id: string,
  kind: string,
): AdmissionResult<DocumentSource> {
  const other = sources.find((source) => source.id !== id) ?? sources[1];
  return admit(other?.path ?? '', () => {
    requireAdmission(sources.length === 1 && !other, 'invalid_value', '', `Expected exactly one ${kind}, named ${id}`);
    return sources[0]!;
  });
}
