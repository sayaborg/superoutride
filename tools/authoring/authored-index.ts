import {
  admit,
  readArray,
  readDocument,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../../src/core/admission.js';
import { SHA256_TEXT } from '../../src/core/content-digest.js';

/**
 * The index of a build's authored files: every file under `content/` with its SHA-256, published beside the build
 * so the workbench reads the documents it was built from without a directory listing.
 */
export const AUTHORED_INDEX_FORMAT = Object.freeze({ format: 'superoutride.authored-index', version: 1 } as const);
/** Where a build publishes its authored files, beside `delivery/`; the index is `index.json` there. */
export const AUTHORED_DIRECTORY = 'authored';

export interface AuthoredFile {
  /** The path under `content/`. */
  readonly path: string;
  readonly sha256: string;
}

export interface AuthoredIndex {
  readonly format: typeof AUTHORED_INDEX_FORMAT.format;
  readonly version: typeof AUTHORED_INDEX_FORMAT.version;
  /** The commit the build was made from. */
  readonly commit: string;
  readonly files: readonly AuthoredFile[];
}

/**
 * The one rule for a path under `content/`: relative, of safe segments, none starting with a dot, so no path leaves
 * `content/`. The authored index, the workbench's edits and its archives all admit paths by it.
 */
export const CONTENT_PATH = Object.freeze({
  pattern: /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*$/,
  patternMessage: 'Expected a path under content/ of safe segments',
});

/** Admit an authored index: each path once, in sorted order, with a lowercase SHA-256. */
export function readAuthoredIndex(value: unknown, document = ''): AdmissionResult<AuthoredIndex> {
  return admit(document, () => {
    const root = readDocument(value, ['format', 'version', 'commit', 'files'], AUTHORED_INDEX_FORMAT.format, 1);
    const commit = readString(root.commit, '/commit');
    let previous = '';
    const files = readArray(root.files, '/files', (item, at) => {
      const entry = readRecord(item, at, ['path', 'sha256']);
      const path = readString(entry.path, `${at}/path`, CONTENT_PATH);
      requireAdmission(path > previous, 'invalid_value', `${at}/path`, 'Expected unique paths in sorted order');
      previous = path;
      return Object.freeze({ path, sha256: readString(entry.sha256, `${at}/sha256`, SHA256_TEXT) });
    });
    return Object.freeze({ ...AUTHORED_INDEX_FORMAT, commit, files });
  });
}
