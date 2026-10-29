/** A changed file of the working state: its bytes (null when deleted), its digest in the build and its revision. */
export interface WorkingFile {
  readonly bytes: Uint8Array<ArrayBuffer> | null;
  /** The file's SHA-256 in the build the state belongs to; null for a file that build does not have. */
  readonly base: string | null;
  /** The state's version when the file was last written; a file the state does not hold is at revision 0. */
  readonly revision: number;
}

/**
 * One build's working state: the changes every editing page open on that build shares. `version` counts its writes;
 * `saved` is the version last saved as an archive or opened from one.
 */
export interface WorkingState {
  readonly commit: string;
  readonly files: ReadonlyMap<string, WorkingFile>;
  readonly version: number;
  readonly saved: number;
}

/** A write to one path: the new bytes, or `build` to return the file to the build's own. */
export interface WorkingWrite {
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer> | null | 'build';
  readonly base: string | null;
  /** The revision the writer last read the file at. */
  readonly expected: number;
}

/** What one page tells the others: the state changed, or it was replaced and every page's history is void. */
export type WorkingMessage = 'changed' | 'reset';

/** A write taken, with the state after it, or refused, naming the first path another page changed since its read. */
export type WriteResult =
  { readonly ok: true; readonly state: WorkingState } | { readonly ok: false; readonly path: string };

const DATABASE = 'superoutride-working-state';
const STATES = 'states';

interface StoredState {
  readonly commit: string;
  readonly files: Readonly<Record<string, WorkingFile>>;
  readonly version: number;
  readonly saved: number;
}

const stored = (state: WorkingState): StoredState => ({
  commit: state.commit,
  files: Object.fromEntries(state.files),
  version: state.version,
  saved: state.saved,
});
const live = (state: StoredState): WorkingState =>
  Object.freeze({ ...state, files: new Map(Object.entries(state.files)) });
const empty = (commit: string): WorkingState => Object.freeze({ commit, files: new Map(), version: 0, saved: 0 });

function request<T>(target: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    target.onsuccess = () => resolve(target.result);
    target.onerror = () => reject(target.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  const opening = indexedDB.open(DATABASE, 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore(STATES, { keyPath: 'commit' });
  return request(opening);
}

/**
 * The working state of the build `commit`, kept in the browser's IndexedDB and written on every edit, so it outlives
 * the page; a BroadcastChannel tells the other pages of the same build of each write. Each write runs in one
 * transaction, so pages writing at once take turns.
 */
export async function openWorkingState(commit: string) {
  const database = await openDatabase();
  const channel = new BroadcastChannel(`${DATABASE}:${commit}`);
  const listeners = new Set<(message: WorkingMessage) => void>();
  channel.onmessage = ({ data }: MessageEvent<WorkingMessage>) => listeners.forEach((listener) => listener(data));
  // The writing page has its state already: only the others hear (a channel does not deliver to its sender).
  const tell = (message: WorkingMessage) => channel.postMessage(message);

  /**
   * Run `change` on the stored state of `key` in one transaction: it returns the state to store, null to remove it, or
   * no state to leave it as it is.
   */
  async function transact<T>(
    key: string,
    change: (state: WorkingState) => { readonly state?: WorkingState | null; readonly result: T },
  ): Promise<T> {
    const transaction = database.transaction(STATES, 'readwrite');
    const states = transaction.objectStore(STATES);
    const found = (await request(states.get(key))) as StoredState | undefined;
    const { state, result } = change(found ? live(found) : empty(key));
    if (state) states.put(stored(state));
    else if (state === null) states.delete(key);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    return result;
  }

  return Object.freeze({
    async read(): Promise<WorkingState> {
      const found = (await request(database.transaction(STATES).objectStore(STATES).get(commit))) as
        StoredState | undefined;
      return found ? live(found) : empty(commit);
    },
    /**
     * Apply `writes` together when each path is still at the revision its writer read, else none of them: the result
     * names the first path another page changed since. A file written as the build's own leaves the state.
     */
    async write(writes: readonly WorkingWrite[]): Promise<WriteResult> {
      const result = await transact<WriteResult>(commit, (state) => {
        const moved = writes.find((write) => (state.files.get(write.path)?.revision ?? 0) !== write.expected);
        if (moved) return { result: { ok: false, path: moved.path } };
        const version = state.version + 1;
        const files = new Map(state.files);
        for (const write of writes)
          if (write.bytes === 'build') files.delete(write.path);
          else files.set(write.path, { bytes: write.bytes, base: write.base, revision: version });
        const next = Object.freeze({ ...state, files, version });
        return { state: next, result: { ok: true, state: next } };
      });
      if (result.ok) tell('changed');
      return result;
    },
    /**
     * Replace the whole state (an archive opened, changes brought from another build, a discard): every page's history
     * is void.
     */
    async replace(files: ReadonlyMap<string, Omit<WorkingFile, 'revision'>>, saved: boolean): Promise<WorkingState> {
      const next = await transact(commit, (state) => {
        const version = state.version + 1;
        const replaced = Object.freeze({
          commit,
          files: new Map([...files].map(([path, file]) => [path, { ...file, revision: version }] as const)),
          version,
          saved: saved ? version : state.saved,
        });
        return { state: replaced, result: replaced };
      });
      tell('reset');
      return next;
    },
    /** Mark `version` saved as an archive. */
    async markSaved(version: number) {
      const next = await transact(commit, (state) => {
        const marked = Object.freeze({ ...state, saved: version });
        return { state: marked, result: marked };
      });
      tell('changed');
      return next;
    },
    /** The working states other builds left in this browser. */
    async others(): Promise<WorkingState[]> {
      const all = (await request(database.transaction(STATES).objectStore(STATES).getAll())) as StoredState[];
      return all.filter((state) => state.commit !== commit).map(live);
    },
    /** Remove another build's working state. */
    async remove(other: string) {
      await transact(other, () => ({ state: null, result: null }));
    },
    /** Hear the other pages' writes and replacements. */
    subscribe(listener: (message: WorkingMessage) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export type WorkingStateStore = Awaited<ReturnType<typeof openWorkingState>>;
