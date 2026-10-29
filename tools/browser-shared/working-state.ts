/** A changed file of the working state. */
export interface WorkingFile {
  /** Its bytes, or null when the file is deleted. */
  readonly bytes: Uint8Array<ArrayBuffer> | null;
  /** The file's SHA-256 in the build the state belongs to; null for a file that build does not have. */
  readonly base: string | null;
  /** The state's revision when the file was last written; a file the state does not hold is at revision 0. */
  readonly revision: number;
  /** What the file holds: its bytes' SHA-256, or `deleted`. */
  readonly content: string;
}

/**
 * One build's working state: the changes every editing page open on that build shares. `revision` counts its writes;
 * `saved` is the content of each changed file when the state was last saved as an archive or opened from one (a path
 * it does not name was the build's own).
 */
export interface WorkingState {
  readonly commit: string;
  readonly files: ReadonlyMap<string, WorkingFile>;
  readonly revision: number;
  readonly saved: Readonly<Record<string, string>>;
}

/** Whether the state holds content not in the archive last saved or opened. */
export function unsaved(state: WorkingState): boolean {
  const saved = Object.entries(state.saved);
  return (
    saved.length !== state.files.size || saved.some(([path, content]) => state.files.get(path)?.content !== content)
  );
}

/** A write to one path: the new bytes and content, or `build` to return the file to the build's own. */
export interface WorkingWrite {
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer> | null | 'build';
  /** The new content (`WorkingFile.content`); ignored for `build`. */
  readonly content: string;
  readonly base: string | null;
  /** The revision the writer expects the file at. */
  readonly expected: number;
}

/** A write taken, at a new revision, or refused, naming the first path another page changed since. */
export type WriteResult =
  { readonly ok: true; readonly revision: number } | { readonly ok: false; readonly path: string };

/** What a page tells the build's others: files written, or the state replaced (every page's history is void). */
export type WorkingMessage =
  { readonly type: 'changed'; readonly paths: readonly string[] } | { readonly type: 'reset' };

/** The working states' record format: a build's record and its files' records carry it. */
export const WORKING_STATE_FORMAT = Object.freeze({ format: 'superoutride.working-state', version: 1 } as const);

/** A build's working state whose stored records this reader does not admit. */
export class BrokenWorkingState extends Error {}

interface StateRecord {
  readonly format: string;
  readonly version: number;
  readonly commit: string;
  readonly revision: number;
  readonly saved: Readonly<Record<string, string>>;
}

interface FileRecord extends WorkingFile {
  readonly format: string;
  readonly version: number;
  readonly commit: string;
  readonly path: string;
}

/** One transaction's reads and writes over the stored records. */
interface Transaction {
  state(commit: string): Promise<StateRecord | undefined>;
  states(): Promise<StateRecord[]>;
  files(commit: string): Promise<FileRecord[]>;
  file(commit: string, path: string): Promise<FileRecord | undefined>;
  putState(record: StateRecord): void;
  putFile(record: FileRecord): void;
  deleteState(commit: string): void;
  deleteFile(commit: string, path: string): void;
}

/** Where the records are kept: IndexedDB, or this page's memory when IndexedDB cannot open. */
interface Backend {
  readonly persistent: boolean;
  run<T>(write: boolean, work: (transaction: Transaction) => Promise<T>): Promise<T>;
}

const DATABASE = 'superoutride-working-state';

function request<T>(target: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    target.onsuccess = () => resolve(target.result);
    target.onerror = () => reject(target.error);
  });
}

async function indexedBackend(): Promise<Backend> {
  const opening = indexedDB.open(DATABASE, 2);
  opening.onupgradeneeded = () => {
    const database = opening.result;
    // Version 1 kept a build's files inside its one record; its records are not carried over.
    for (const name of [...database.objectStoreNames]) database.deleteObjectStore(name);
    database.createObjectStore('states', { keyPath: 'commit' });
    database.createObjectStore('files', { keyPath: ['commit', 'path'] }).createIndex('commit', 'commit');
  };
  const database = await request(opening);
  return {
    persistent: true,
    async run<T>(write: boolean, work: (transaction: Transaction) => Promise<T>): Promise<T> {
      const transaction = database.transaction(['states', 'files'], write ? 'readwrite' : 'readonly');
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        // An abort (no space left, say) or a failure keeps nothing of the transaction.
        transaction.onabort = () => reject(transaction.error ?? new Error('The working state write was aborted'));
        transaction.onerror = () => reject(transaction.error);
      });
      const states = transaction.objectStore('states'),
        files = transaction.objectStore('files');
      let result: T;
      try {
        result = await work({
          state: (commit) => request(states.get(commit)) as Promise<StateRecord | undefined>,
          states: () => request(states.getAll()) as Promise<StateRecord[]>,
          files: (commit) => request(files.index('commit').getAll(commit)) as Promise<FileRecord[]>,
          file: (commit, path) => request(files.get([commit, path])) as Promise<FileRecord | undefined>,
          putState: (record) => void states.put(record),
          putFile: (record) => void files.put(record),
          deleteState: (commit) => void states.delete(commit),
          deleteFile: (commit, path) => void files.delete([commit, path]),
        });
      } catch (error) {
        // A failure inside the work keeps none of its writes.
        transaction.abort();
        await done.catch(() => undefined);
        throw error;
      }
      await done;
      return result;
    },
  };
}

function memoryBackend(): Backend {
  const states = new Map<string, StateRecord>(),
    files = new Map<string, FileRecord>();
  const key = (commit: string, path: string) => `${commit}\n${path}`;
  return {
    persistent: false,
    run: (_write, work) =>
      work({
        state: async (commit) => states.get(commit),
        states: async () => [...states.values()],
        files: async (commit) => [...files.values()].filter((file) => file.commit === commit),
        file: async (commit, path) => files.get(key(commit, path)),
        putState: (record) => void states.set(record.commit, record),
        putFile: (record) => void files.set(key(record.commit, record.path), record),
        deleteState: (commit) => void states.delete(commit),
        deleteFile: (commit, path) => void files.delete(key(commit, path)),
      }),
  };
}

const admitted = (record: { readonly format?: unknown; readonly version?: unknown } | undefined) =>
  !record || (record.format === WORKING_STATE_FORMAT.format && record.version === WORKING_STATE_FORMAT.version);

function liveFile(record: FileRecord): WorkingFile {
  return Object.freeze({ bytes: record.bytes, base: record.base, revision: record.revision, content: record.content });
}

async function readState(transaction: Transaction, commit: string): Promise<WorkingState> {
  const record = await transaction.state(commit);
  const files = await transaction.files(commit);
  if (!admitted(record) || !files.every(admitted)) throw new BrokenWorkingState(`build ${commit.slice(0, 7)}`);
  return Object.freeze({
    commit,
    files: new Map(files.map((file) => [file.path, liveFile(file)] as const)),
    revision: record?.revision ?? 0,
    saved: Object.freeze({ ...(record?.saved ?? {}) }),
  });
}

const channelName = (commit: string) => `${DATABASE}:${commit}`;

/**
 * The working state of the build `commit`, kept in the browser's IndexedDB and written on every edit, so it outlives
 * the page; when IndexedDB cannot open, kept in this page alone (`persistent` false). Each write is one transaction, so
 * pages writing at once take turns, and writes only the files it changes; a BroadcastChannel tells the other pages of
 * the same build which paths changed.
 */
export async function openWorkingState(commit: string) {
  const backend = await indexedBackend().catch(() => memoryBackend());
  const channel = new BroadcastChannel(channelName(commit));
  const listeners = new Set<(message: WorkingMessage) => void>();
  channel.onmessage = ({ data }: MessageEvent<WorkingMessage>) => listeners.forEach((listener) => listener(data));
  // The writing page has its state already: only the others hear (a channel does not deliver to its sender).
  const tell = (message: WorkingMessage) => channel.postMessage(message);
  const stateRecord = (revision: number, saved: Readonly<Record<string, string>>): StateRecord => ({
    ...WORKING_STATE_FORMAT,
    commit,
    revision,
    saved,
  });
  const fileRecord = (path: string, file: Omit<WorkingFile, 'revision'>, revision: number): FileRecord => ({
    ...WORKING_STATE_FORMAT,
    commit,
    path,
    bytes: file.bytes,
    base: file.base,
    content: file.content,
    revision,
  });

  return Object.freeze({
    /** Whether the state outlives the page (IndexedDB opened). */
    persistent: backend.persistent,
    /** The whole state; records this reader does not admit throw `BrokenWorkingState`. */
    read: () => backend.run(false, (transaction) => readState(transaction, commit)),
    /** The state's revision and saved content, and the files at `paths` (null where the state does not hold them). */
    readPaths: (paths: readonly string[]) =>
      backend.run(false, async (transaction) => {
        const record = await transaction.state(commit);
        const files = new Map<string, WorkingFile | null>();
        for (const path of paths) {
          const file = await transaction.file(commit, path);
          if (!admitted(file)) throw new BrokenWorkingState(`build ${commit.slice(0, 7)}`);
          files.set(path, file ? liveFile(file) : null);
        }
        return { revision: record?.revision ?? 0, saved: Object.freeze({ ...(record?.saved ?? {}) }), files };
      }),
    /**
     * Apply `writes` together when each path is still at the revision its writer expects, else none of them. A file
     * written as the build's own leaves the state.
     */
    async write(writes: readonly WorkingWrite[]): Promise<WriteResult> {
      const result = await backend.run<WriteResult>(true, async (transaction) => {
        for (const write of writes)
          if (((await transaction.file(commit, write.path))?.revision ?? 0) !== write.expected)
            return { ok: false, path: write.path };
        const record = await transaction.state(commit);
        const revision = (record?.revision ?? 0) + 1;
        for (const write of writes)
          if (write.bytes === 'build') transaction.deleteFile(commit, write.path);
          else transaction.putFile(fileRecord(write.path, { ...write, bytes: write.bytes }, revision));
        transaction.putState(stateRecord(revision, record?.saved ?? {}));
        return { ok: true, revision };
      });
      if (result.ok) tell({ type: 'changed', paths: writes.map((write) => write.path) });
      return result;
    },
    /**
     * Replace the whole state with `files` (an archive opened, changes brought from another build, a discard); every
     * page's history is void. `saved` marks the new content saved (an archive opened, a discard).
     */
    async replace(files: ReadonlyMap<string, Omit<WorkingFile, 'revision'>>, saved: boolean) {
      await backend.run(true, async (transaction) => {
        for (const file of await transaction.files(commit)) transaction.deleteFile(commit, file.path);
        const record = await transaction.state(commit);
        const revision = (record?.revision ?? 0) + 1;
        for (const [path, file] of files) transaction.putFile(fileRecord(path, file, revision));
        const content = Object.fromEntries([...files].map(([path, file]) => [path, file.content]));
        transaction.putState(stateRecord(revision, saved ? content : (record?.saved ?? {})));
      });
      tell({ type: 'reset' });
    },
    /** Mark the state's content saved, as it stands when the mark is written. */
    async markSaved() {
      await backend.run(true, async (transaction) => {
        const record = await transaction.state(commit);
        const files = await transaction.files(commit);
        const saved = Object.fromEntries(files.map((file) => [file.path, file.content]));
        transaction.putState(stateRecord(record?.revision ?? 0, saved));
      });
      tell({ type: 'changed', paths: [] });
    },
    /** The other builds' states this browser holds, each with its revision and count of files; broken ones flagged. */
    others: () =>
      backend.run(false, async (transaction) => {
        const found: { commit: string; revision: number; count: number; broken: boolean }[] = [];
        for (const record of await transaction.states()) {
          if (record.commit === commit) continue;
          const files = await transaction.files(record.commit);
          const broken = !admitted(record) || !files.every(admitted);
          found.push({ commit: record.commit, revision: record.revision, count: files.length, broken });
        }
        return found;
      }),
    /** Another build's state, read whole. */
    readOther: (other: string) => backend.run(false, (transaction) => readState(transaction, other)),
    /**
     * Remove another build's state if it is still at `revision` (none of its pages wrote since it was read; null
     * removes it as it is), telling its pages it was replaced. False when it changed meanwhile.
     */
    async removeOther(other: string, revision: number | null) {
      const removed = await backend.run(true, async (transaction) => {
        const record = await transaction.state(other);
        if (revision !== null && (record?.revision ?? 0) !== revision) return false;
        for (const file of await transaction.files(other)) transaction.deleteFile(other, file.path);
        transaction.deleteState(other);
        return true;
      });
      if (removed) {
        const theirs = new BroadcastChannel(channelName(other));
        theirs.postMessage({ type: 'reset' } satisfies WorkingMessage);
        theirs.close();
      }
      return removed;
    },
    /** Remove this build's state as it is, broken or not. */
    async removeOwn() {
      await backend.run(true, async (transaction) => {
        for (const file of await transaction.files(commit)) transaction.deleteFile(commit, file.path);
        transaction.deleteState(commit);
      });
      tell({ type: 'reset' });
    },
    /** Hear the other pages' writes and replacements. */
    subscribe(listener: (message: WorkingMessage) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export type WorkingStateStore = Awaited<ReturnType<typeof openWorkingState>>;
