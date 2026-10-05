import {
  admit,
  readArray,
  readBoolean,
  readDocument,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../../src/core/admission.js';
import { SHA256_TEXT } from '../../src/core/content-digest.js';
import { readZip, writeZip, type ZipEntry } from './zip.js';

/**
 * The workbench's archive of changes: each changed or added file at its `content/` path, and `workbench-changes.json`
 * (`superoutride.workbench-changes` version 1) naming the build the changes were made on, every changed path with the
 * digest it had in that build (null for an added file) and whether it is deleted.
 */
export const CHANGE_LIST_NAME = 'workbench-changes.json';
export const CHANGE_LIST_FORMAT = Object.freeze({ format: 'superoutride.workbench-changes', version: 1 } as const);

export interface ArchivedChange {
  readonly path: string;
  /** The digest of the file in the build the change was made on; null for a file that build did not have. */
  readonly base: string | null;
  /** The new bytes, or null for a deleted file. */
  readonly bytes: Uint8Array<ArrayBuffer> | null;
}

export interface ChangeArchive {
  readonly commit: string;
  readonly changes: readonly ArchivedChange[];
}

/** The archive of `changes` made on the build `commit`; `base` gives each path's digest there. */
export function writeChangeArchive(archive: ChangeArchive): Uint8Array<ArrayBuffer> {
  const changes = [...archive.changes].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const list = {
    ...CHANGE_LIST_FORMAT,
    commit: archive.commit,
    changes: changes.map(({ path, base, bytes }) => ({ path, base, deleted: bytes === null })),
  };
  const entries: ZipEntry[] = [
    { name: CHANGE_LIST_NAME, bytes: new TextEncoder().encode(JSON.stringify(list, null, 2) + '\n') },
  ];
  for (const { path, bytes } of changes) if (bytes) entries.push({ name: `content/${path}`, bytes });
  return writeZip(entries);
}

/** Admit a change archive: its list, and exactly the files its list names as changed. */
export function readChangeArchive(bytes: Uint8Array): AdmissionResult<ChangeArchive> {
  return admit(CHANGE_LIST_NAME, () => {
    let entries: ZipEntry[];
    try {
      entries = readZip(bytes);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return requireAdmission(false, 'invalid_shape', '', error.message) as never;
    }
    const files = new Map(entries.map((entry) => [entry.name, entry.bytes]));
    const listBytes = files.get(CHANGE_LIST_NAME);
    requireAdmission(listBytes !== undefined, 'invalid_shape', '', `The archive has no ${CHANGE_LIST_NAME}`);
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(listBytes));
    } catch {
      requireAdmission(false, 'invalid_shape', '', `${CHANGE_LIST_NAME} is not JSON`);
    }
    const root = readDocument(value, ['format', 'version', 'commit', 'changes'], CHANGE_LIST_FORMAT.format, 1);
    const commit = readString(root.commit, '/commit');
    const seen = new Set<string>();
    const changes = readArray(root.changes, '/changes', (item, at) => {
      const change = readRecord(item, at, ['path', 'base', 'deleted']);
      const path = readString(change.path, `${at}/path`);
      requireAdmission(!seen.has(path), 'duplicate_id', `${at}/path`, `Duplicate path ${path}`);
      seen.add(path);
      const base = change.base === null ? null : readString(change.base, `${at}/base`, SHA256_TEXT);
      const deleted = readBoolean(change.deleted, `${at}/deleted`);
      const data = files.get(`content/${path}`);
      requireAdmission(
        deleted ? data === undefined : data !== undefined,
        'invalid_value',
        `${at}/deleted`,
        deleted ? `A deleted file is in the archive: ${path}` : `The archive lacks content/${path}`,
      );
      return Object.freeze({ path, base, bytes: data ?? null });
    });
    for (const name of files.keys())
      requireAdmission(
        name === CHANGE_LIST_NAME || seen.has(name.slice('content/'.length)),
        'unsupported_feature',
        '/changes',
        `The list does not name ${name}`,
      );
    return Object.freeze({ commit, changes });
  });
}
