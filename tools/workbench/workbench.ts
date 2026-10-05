import { formatSavedJson } from '../../src/content/saved-json.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { AUTHORED_DIRECTORY, type AuthoredIndex } from '../authoring/authored-index.js';
import type { ContentStore } from '../authoring/content-store.js';
import { createLayeredStore } from '../authoring/layered-store.js';
import { openPublishedStore } from './published-store.js';
import type {
  CompileRequest,
  CompileResponse,
  CourseQuery,
  QueryRequest,
  QueryResponse,
  WorkbenchDiagnostic,
} from './compile-protocol.js';
import type { CompileState, WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { WORKBENCH_MODULES } from './modules.js';
import { createHistory, type Changes } from './history.js';
import { readChangeArchive, writeChangeArchive, type ArchivedChange } from './change-archive.js';
import { element, labelled } from './dom.js';

/**
 * The workbench page: the build's published authored files under the session's changes, compiled by the authoring
 * core in a worker, with modules that read the store and the compile and edit by replacing documents.
 */
// The page is `tools/workbench/workbench.html` inside a build; the build's root is two directories up.
const buildRoot = new URL('../../', location.href);
const authoredRoot = new URL(`${AUTHORED_DIRECTORY}/`, buildRoot);
const status = element('status');

try {
  const { index, store: published } = await openPublishedStore(authoredRoot);
  start(index, published);
} catch (error) {
  status.textContent = `The workbench could not open this build: ${error instanceof Error ? error.message : error}`;
  status.dataset.state = 'failed';
}

function start(index: AuthoredIndex, published: ContentStore) {
  const { commit } = index;
  const history = createHistory();
  // Each history state compiles once, numbered by its generation.
  let generation = 0,
    saved: Changes = history.changes;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const view = () => createLayeredStore(published, new Map(history.changes));
  const store: ContentStore = Object.freeze({
    read: (path: string) => view().read(path),
    list: (directory: string) => view().list(directory),
    write: () => Promise.reject(new Error('Edit through the workbench')),
  });

  // Compiles run one at a time off the page's thread; an older result never replaces a newer one.
  const worker = new Worker(new URL('./compile-worker.js', import.meta.url), { type: 'module' });
  let state: CompileState = { status: 'running', last: null };
  // Preview measurements live beside the compile, never in the changes: no step, no archive, no change list.
  let preview = new Map<string, Uint8Array<ArrayBuffer>>();
  let running = false,
    wanted = 0;
  const compile = () => {
    wanted = generation;
    if (running) return;
    running = true;
    state = { status: 'running', last: state.last };
    notify();
    worker.postMessage({
      type: 'compile',
      generation,
      root: authoredRoot.href,
      changes: [...history.changes],
      preview: [...preview].map(([path, bytes]) => [path, bytes.slice()] as const),
    } satisfies CompileRequest);
  };
  // Queries about the compiled courses, answered in the order asked.
  const queries = new Map<number, (answer: QueryResponse) => void>();
  let queryId = 0;
  worker.addEventListener('message', ({ data }: MessageEvent<CompileResponse | QueryResponse>) => {
    if (data.type === 'answer') {
      queries.get(data.id)?.(data);
      queries.delete(data.id);
      return;
    }
    running = false;
    if (data.generation !== wanted) return compile();
    // Preview measurements no longer current are discarded.
    preview = new Map([...preview].filter(([path]) => data.preview.includes(path)));
    state = data.ok
      ? {
          status: 'ok',
          last: { step: data.generation, seconds: data.seconds, files: data.files },
          measurements: data.measurements,
        }
      : {
          status: 'failed',
          diagnostics: data.diagnostics,
          last: state.last,
          unmeasured: data.unmeasured ? { step: data.generation, seconds: data.seconds, files: data.unmeasured } : null,
        };
    notify();
  });
  const moved = () => {
    generation++;
    compile();
  };

  // One edit: a new state of the changes. A file equal to the build's own is no change. Edits apply in order.
  let edits = Promise.resolve();
  const edit = (files: readonly (readonly [string, Uint8Array<ArrayBuffer> | null])[], label: string) =>
    (edits = edits.then(async () => {
      const next = new Map(history.changes);
      for (const [path, bytes] of files) {
        const original = index.files.find((file) => file.path === path);
        const same = bytes ? original !== undefined && (await contentDigest(bytes)) === original.sha256 : !original;
        if (same) next.delete(path);
        else next.set(path, bytes);
      }
      history.push(next, label);
      moved();
    }));
  const modules: WorkbenchModule[] = [];
  let selection: { readonly document: string; readonly pointer: string } | null = null;
  const context: WorkbenchContext = Object.freeze({
    store,
    published,
    commit,
    compile: () => state,
    changes: () => history.changes,
    paths() {
      const paths = new Set(index.files.map((file) => file.path));
      for (const [path, bytes] of history.changes)
        if (bytes) paths.add(path);
        else paths.delete(path);
      return [...paths].sort();
    },
    root: authoredRoot.href,
    replace: (path: string, value: unknown, label = `Edit ${path}`) =>
      void edit([[path, new TextEncoder().encode(formatSavedJson(value))]], label),
    setFile: (path: string, bytes: Uint8Array<ArrayBuffer> | null, label = `${bytes ? 'Set' : 'Delete'} ${path}`) =>
      void edit([[path, bytes]], label),
    preview: () => preview,
    query: (query: CourseQuery) =>
      new Promise<QueryResponse>((resolve) => {
        const id = ++queryId;
        queries.set(id, resolve);
        worker.postMessage({ type: 'query', id, query } satisfies QueryRequest);
      }),
    addPreview(files: readonly (readonly [string, Uint8Array<ArrayBuffer>])[]) {
      preview = new Map([...preview, ...files]);
      moved();
    },
    revert(path: string) {
      const next = new Map(history.changes);
      next.delete(path);
      history.push(next, `Revert ${path}`);
      moved();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selection: () => selection,
    select(document: string, pointer: string) {
      if (selection?.document === document && selection.pointer === pointer) return;
      selection = { document, pointer };
      notify();
    },
    reveal(documentPath: string, pointer: string) {
      const target = modules.find((module) => module.reveal);
      if (!target) return;
      select(target);
      target.reveal!(documentPath, pointer);
    },
  });

  // Undo and redo move through the history; each position compiles again.
  const undo = () => {
    if (!history.canUndo) return;
    history.undo();
    moved();
  };
  const redo = () => {
    if (!history.canRedo) return;
    history.redo();
    moved();
  };
  element('undo').addEventListener('click', undo);
  element('redo').addEventListener('click', redo);
  document.addEventListener('keydown', (event) => {
    const typing = (event.target as HTMLElement).closest('input, textarea, select, [contenteditable]');
    if (typing || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) undo();
    else if ((key === 'z' && event.shiftKey) || key === 'y') redo();
    else return;
    event.preventDefault();
  });

  // Saving downloads one archive of the changes; nothing is kept in the browser.
  element('save').addEventListener('click', () => {
    const changes: ArchivedChange[] = [...history.changes].map(([path, bytes]) => ({
      path,
      base: index.files.find((file) => file.path === path)?.sha256 ?? null,
      bytes,
    }));
    const archive = writeChangeArchive({ commit, changes });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
    link.download = `superoutride-changes-${commit.slice(0, 7)}.zip`;
    link.click();
    URL.revokeObjectURL(link.href);
    saved = history.changes;
    notify();
  });
  element<HTMLInputElement>('open-archive').addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const result = readChangeArchive(new Uint8Array(await file.arrayBuffer()));
    if (!result.ok) {
      alert(`The archive cannot be opened: ${result.diagnostics[0]!.message}`);
      return;
    }
    if (history.changes.size && history.changes !== saved && !confirm('Replace the unsaved changes with the archive?'))
      return;
    const chosen = await resolveConflicts(index, result.value.commit, result.value.changes);
    if (!chosen) return;
    history.push(new Map(chosen.map((change) => [change.path, change.bytes])), `Open ${file.name}`);
    saved = history.changes;
    moved();
  });
  addEventListener('beforeunload', (event) => {
    if (history.changes === saved || !history.changes.size) return;
    event.preventDefault();
    event.returnValue = '';
  });

  // The header: the build, the changes, the compile and the history.
  const header = () => {
    const count = history.changes.size;
    const compileText =
      state.status === 'running'
        ? 'compiling…'
        : state.status === 'ok'
          ? `compiled in ${state.last.seconds.toFixed(1)} s · ${state.measurements === 'saved' ? 'saved measurements' : 'preview measurements (not saved)'}`
          : state.unmeasured
            ? 'measurements are stale (Measure to preview)'
            : `failed (${state.diagnostics.length})${state.last ? ' · products are stale' : ''}`;
    const unsaved = count && history.changes !== saved ? ' (unsaved)' : '';
    status.textContent = `build ${commit.slice(0, 7)} · ${count} change${count === 1 ? '' : 's'}${unsaved} · ${compileText}`;
    status.dataset.state =
      state.status === 'failed' && state.unmeasured
        ? 'stale'
        : state.status === 'ok' && state.measurements === 'preview'
          ? 'preview'
          : state.status;
    const { undo: undoLabel, redo: redoLabel } = history.labels;
    labelled(element<HTMLButtonElement>('undo'), !history.canUndo, undoLabel ? `Undo: ${undoLabel}` : 'Undo');
    labelled(element<HTMLButtonElement>('redo'), !history.canRedo, redoLabel ? `Redo: ${redoLabel}` : 'Redo');
  };
  listeners.add(header);
  listeners.add(() => showDiagnostics(context));
  listeners.add(() => void showProducts(context));

  // Modules: one tab each.
  const tabs = element('modules'),
    screen = element('module');
  const screens = new Map<WorkbenchModule, HTMLElement>();
  const select = (module: WorkbenchModule) => {
    for (const [other, section] of screens) section.hidden = other !== module;
    for (const button of tabs.querySelectorAll('button'))
      button.setAttribute('aria-pressed', String(button.dataset.module === module.id));
  };
  for (const module of WORKBENCH_MODULES) {
    modules.push(module);
    const section = document.createElement('section');
    section.className = 'module';
    section.hidden = true;
    screen.append(section);
    screens.set(module, section);
    module.mount(section, context);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = module.title;
    button.dataset.module = module.id;
    button.addEventListener('click', () => select(module));
    tabs.append(button);
  }
  if (modules[0]) select(modules[0]);
  compile();
}

/**
 * The changes of an archive made on another build: a file changed in both the archive and this build (its digest here
 * is not the one the archive started from) is the author's choice, never merged. Null when the author cancels.
 */
async function resolveConflicts(
  index: AuthoredIndex,
  archiveCommit: string,
  changes: readonly ArchivedChange[],
): Promise<ArchivedChange[] | null> {
  const here = (path: string) => index.files.find((file) => file.path === path)?.sha256 ?? null;
  const conflicts = changes.filter((change) => here(change.path) !== change.base);
  if (!conflicts.length) return [...changes];
  const dialog = element<HTMLDialogElement>('conflicts');
  const list = element('conflict-list');
  element('conflict-build').textContent =
    `The archive was made on build ${archiveCommit.slice(0, 7)}, and this build (${index.commit.slice(0, 7)}) ` +
    'changed these files too. Choose each file’s version:';
  list.replaceChildren(
    ...conflicts.map((change, i) => {
      const row = document.createElement('li');
      const path = document.createElement('code');
      path.textContent = change.path;
      row.append(path);
      for (const [value, text] of [
        ['archive', 'the archive’s'],
        ['build', 'this build’s'],
      ] as const) {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        Object.assign(radio, { type: 'radio', name: `c${i}`, value, checked: value === 'archive' });
        label.append(' ', radio, ` ${text}`);
        row.append(label);
      }
      return row;
    }),
  );
  dialog.returnValue = '';
  dialog.showModal();
  const answer = await new Promise<string>((resolve) =>
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }),
  );
  if (answer !== 'apply') return null;
  const keepBuild = new Set(
    conflicts
      .filter((_, i) => (list.querySelector(`input[name=c${i}]:checked`) as HTMLInputElement).value === 'build')
      .map((change) => change.path),
  );
  return changes.filter((change) => !keepBuild.has(change.path));
}

/** The diagnostics of a failed compile; each opens its document at its pointer. */
function showDiagnostics(context: WorkbenchContext) {
  const list = element('diagnostics');
  const state = context.compile();
  if (state.status === 'running') return;
  list.replaceChildren();
  // The one place diagnostics show for every module: its summary counts them, and a newly failed compile opens it.
  const panel = element<HTMLDetailsElement>('compile-panel');
  const count = state.status === 'failed' ? state.diagnostics.length : 0;
  element('compile-summary').textContent = `Diagnostics: ${count}`;
  if (count && !panel.hasAttribute('data-failed')) panel.open = true;
  panel.toggleAttribute('data-failed', count > 0);
  if (state.status !== 'failed') return;
  for (const diagnostic of state.diagnostics as readonly WorkbenchDiagnostic[]) {
    // A course asset diagnostic names its saved image by digest.
    const documentPath = 'document' in diagnostic ? diagnostic.document : `content/images/${diagnostic.sha256}.json`;
    const where = ('path' in diagnostic ? diagnostic.path : '') ?? '';
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${documentPath || '(no document)'} ${where || '/'} · ${diagnostic.code}: ${diagnostic.message}`;
    button.addEventListener('click', () => context.reveal(documentPath.replace(/^content\//, ''), where));
    item.append(button);
    list.append(item);
  }
}

/** The products of the last successful compile with their digests. */
let shownProducts: unknown = null;
async function showProducts(context: WorkbenchContext) {
  const last = context.compile().last;
  if (last === shownProducts) return;
  shownProducts = last;
  const table = element('products');
  const rows = [],
    shown = new Set<string>();
  for (const file of last?.files ?? []) {
    // A course image shared by courses is delivered once.
    const key = `${file.kind} ${file.id}`;
    if (shown.has(key)) continue;
    shown.add(key);
    const row = document.createElement('tr');
    for (const text of [file.kind, file.id, String(file.bytes.byteLength), await contentDigest(file.bytes)]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    rows.push(row);
  }
  if (shownProducts !== last) return;
  table.replaceChildren(...rows);
  element('products-summary').textContent = `Products (${rows.length})`;
}
