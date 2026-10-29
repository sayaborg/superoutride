import { formatSavedJson } from '../../src/content/saved-json.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { AUTHORED_DIRECTORY, CONTENT_PATH, type AuthoredIndex } from '../authoring/authored-index.js';
import type { ContentStore } from '../authoring/content-store.js';
import { createLayeredStore } from '../authoring/layered-store.js';
import { openPublishedStore } from './published-store.js';
import type {
  CompileRequest,
  CompileResponse,
  CourseQuery,
  QueryRequest,
  QueryResponse,
  EditorDiagnostic,
} from './compile-protocol.js';
import type { CompileState, EditorContext, EditorModule } from './editor-context.js';
import type { Changes } from './editor-context.js';
import { createHistory, editedBytes, type EditedBytes, type EditedFile } from './history.js';
import { openWorkingState, type WorkingFile } from './working-state.js';
import { readChangeArchive, writeChangeArchive, type ArchivedChange } from './change-archive.js';
import { element, labelled } from './dom.js';

/**
 * The editing pages' frame: the build's published authored files under the session's changes, compiled by the
 * authoring core in a worker, with a page's modules that read the store and the compile and edit by replacing
 * documents. The frame draws the shared screens itself: the header (the build, the changes, the compile, undo and
 * redo, saving and opening archives), the conflict prompt, the modules' tabs (none for one module) and the diagnostics
 * and products. Each page is `tools/<page>/<page>.html` inside a build, whose root is two directories up; workers are
 * found from that root, since this frame may lie in a shared chunk elsewhere.
 */
export async function startEditorPage(title: string, pageModules: readonly EditorModule[]): Promise<void> {
  document.title = `${title} — SUPER OUTRIDE`;
  document.body.innerHTML = FRAME_HTML;
  element('page-title').textContent = `SUPER OUTRIDE ${title.toLowerCase()}`;
  const buildRoot = new URL('../../', location.href);
  const authoredRoot = new URL(`${AUTHORED_DIRECTORY}/`, buildRoot);
  const status = element('status');

  // A request the network failed (an internal compile failure, or the build not opening) can be tried again in place.
  const again = element<HTMLButtonElement>('again');
  const openBuild = async () => {
    again.hidden = true;
    status.textContent = 'Opening the build…';
    status.dataset.state = 'running';
    try {
      const { index, store: published } = await openPublishedStore(authoredRoot);
      await start(index, published, { buildRoot, authoredRoot, status, again, pageModules });
    } catch (error) {
      status.textContent = `The ${title.toLowerCase()} could not open this build: ${error instanceof Error ? error.message : error}`;
      status.dataset.state = 'failed';
      again.onclick = () => void openBuild();
      again.hidden = false;
    }
  };
  await openBuild();
}

/** The frame's shared screens; a page's modules fill `#module`. */
const FRAME_HTML = `
<header>
  <h1 id="page-title"></h1>
  <p id="status" role="status" data-state="running">Opening the build…</p>
  <div class="actions">
    <button id="undo" type="button" disabled>Undo</button>
    <button id="redo" type="button" disabled>Redo</button>
    <button id="again" type="button" hidden>Try again</button>
    <button id="save" type="button">Save changes</button>
    <button id="discard" type="button" disabled>Discard</button>
    <label class="file-button">Open archive<input id="open-archive" type="file" accept=".zip,application/zip" /></label>
  </div>
</header>
<dialog id="conflicts">
  <form method="dialog">
    <p id="conflict-build"></p>
    <ul id="conflict-list"></ul>
    <button value="cancel">Cancel</button>
    <button value="apply">Open with these versions</button>
  </form>
</dialog>
<dialog id="other-build">
  <form method="dialog">
    <p id="other-build-text"></p>
    <button value="bring">Bring them here</button>
    <button value="save">Save as archive</button>
    <button value="discard">Discard</button>
  </form>
</dialog>
<nav id="modules" aria-label="Modules"></nav>
<details id="compile-panel">
  <summary id="compile-summary">Diagnostics</summary>
  <div class="compile-lists">
    <section aria-label="Diagnostics">
      <h2>Diagnostics</h2>
      <ul id="diagnostics"></ul>
    </section>
    <details>
      <summary id="products-summary">Products</summary>
      <table>
        <thead><tr><th>Kind</th><th>ID</th><th>Bytes</th><th>SHA-256</th></tr></thead>
        <tbody id="products"></tbody>
      </table>
    </details>
  </div>
</details>
<main id="module"></main>`;

async function start(
  index: AuthoredIndex,
  published: ContentStore,
  page: {
    readonly buildRoot: URL;
    readonly authoredRoot: URL;
    readonly status: HTMLElement;
    readonly again: HTMLButtonElement;
    readonly pageModules: readonly EditorModule[];
  },
) {
  const { authoredRoot, status, again } = page;
  const { commit } = index;
  const baseOf = (path: string) => index.files.find((file) => file.path === path)?.sha256 ?? null;
  // The changes every page open on this build shares, kept in the browser; this page's own history of its edits.
  const working = await openWorkingState(commit);
  let current = await working.read();
  const history = createHistory();
  // The revision of each file as this page last read it, so an edit made from a stale screen is refused.
  const read = new Map<string, number>();
  const revision = (path: string) => current.files.get(path)?.revision ?? 0;
  const changes = (): Changes => new Map([...current.files].map(([path, file]) => [path, file.bytes] as const));
  // Each working state compiles once, numbered by its generation.
  let generation = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const view = () => createLayeredStore(published, new Map(changes()));
  const store: ContentStore = Object.freeze({
    read(path: string) {
      read.set(path, revision(path));
      return view().read(path);
    },
    list: (directory: string) => view().list(directory),
    write: () => Promise.reject(new Error('Edit through the page')),
  });

  // Compiles run one at a time off the page's thread; an older result never replaces a newer one. Only a visible page
  // compiles: a hidden one compiles when it is shown, if the state moved meanwhile.
  const worker = new Worker(new URL('tools/browser-shared/compile-worker.js', page.buildRoot), { type: 'module' });
  let state: CompileState = { status: 'running', last: null };
  // Preview measurements live beside the compile, never in the changes: no step, no archive, no change list.
  let preview = new Map<string, Uint8Array<ArrayBuffer>>();
  let running = false,
    wanted = -1;
  const compile = () => {
    if (document.hidden) return;
    wanted = generation;
    if (running) return;
    running = true;
    state = { status: 'running', last: state.last };
    notify();
    worker.postMessage({
      type: 'compile',
      generation,
      root: authoredRoot.href,
      changes: [...changes()],
      preview: [...preview].map(([path, bytes]) => [path, bytes.slice()] as const),
    } satisfies CompileRequest);
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && wanted !== generation) compile();
  });
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
    notify();
  };

  // The one order of this page's steps: every edit, undo, redo, revert, archive opening and save runs after the ones
  // asked for before it, so a save holds every edit committed before it was asked for.
  let queue = Promise.resolve();
  const inOrder = (work: () => void | Promise<void>) => {
    // A failed step is reported and the steps after it still run.
    queue = queue.then(work).catch((error: unknown) => console.error('Editing step failed', error));
  };
  // Another page wrote the state, or replaced it (its history and this page's are then void): read it again.
  working.subscribe((message) =>
    inOrder(async () => {
      if (message === 'reset') history.clear();
      current = await working.read();
      moved();
    }),
  );
  // Write files to the working state, each as this page last read it; refused, the page reads the state again. The
  // caller records the step taken, then calls `moved`.
  const write = async (files: readonly EditedFile[], expected: (path: string) => number) => {
    const result = await working.write(
      files.map((file) => ({ path: file.path, bytes: file.after, base: file.base, expected: expected(file.path) })),
    );
    if (!result.ok) {
      alert(`${result.path} changed in another page; edit again`);
      current = await working.read();
      moved();
      return null;
    }
    current = result.state;
    for (const file of files) read.set(file.path, revision(file.path));
    return result.state.version;
  };
  // One edit. A file equal to the build's own is no change, and a path that is not under content/ (CONTENT_PATH) is
  // refused before it is written.
  const edit = (files: readonly (readonly [string, EditedBytes])[], label: string) => {
    const outside = files.find(([path]) => !CONTENT_PATH.pattern.test(path));
    if (outside) {
      alert(`Not a path under content/: ${outside[0]}`);
      return;
    }
    inOrder(async () => {
      const edited: EditedFile[] = [];
      for (const [path, bytes] of files) {
        const base = baseOf(path);
        const same = bytes === 'build' || (bytes ? base !== null && (await contentDigest(bytes)) === base : !base);
        edited.push({ path, base, before: editedBytes(current.files.get(path)), after: same ? 'build' : bytes });
      }
      const version = await write(edited, (path) => read.get(path) ?? revision(path));
      if (version === null) return;
      history.push(label, edited, version);
      moved();
    });
  };
  const modules: EditorModule[] = [];
  let selection: { readonly document: string; readonly pointer: string } | null = null;
  const context: EditorContext = Object.freeze({
    store,
    published,
    commit,
    compile: () => state,
    changes,
    paths() {
      const paths = new Set(index.files.map((file) => file.path));
      for (const [path, file] of current.files)
        if (file.bytes) paths.add(path);
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
    revert: (path: string) => edit([[path, 'build']], `Revert ${path}`),
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

  // Undo and redo move through this page's own edits; one whose files another page changed since is refused.
  const undo = () =>
    inOrder(async () => {
      const step = history.toUndo;
      if (!step) return;
      const back = step.files.map((file) => ({ ...file, before: file.after, after: file.before }));
      // A file the step left as the build's own is not in the state, at revision 0.
      const version = await write(back, (path) =>
        step.files.find((f) => f.path === path)!.after === 'build' ? 0 : step.revision,
      );
      if (version === null) return;
      history.undone(version);
      moved();
    });
  const redo = () =>
    inOrder(async () => {
      const step = history.toRedo;
      if (!step) return;
      const version = await write(step.files, (path) =>
        step.files.find((f) => f.path === path)!.before === 'build' ? 0 : step.revision,
      );
      if (version === null) return;
      history.redone(version);
      moved();
    });
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

  // Saving downloads one archive of the whole working state, whichever page saves it.
  element('save').addEventListener('click', () =>
    inOrder(async () => {
      download(commit, current.files);
      current = await working.markSaved(current.version);
      notify();
    }),
  );
  element<HTMLInputElement>('open-archive').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) inOrder(() => openArchive(file));
  });
  async function openArchive(file: File) {
    const result = readChangeArchive(new Uint8Array(await file.arrayBuffer()));
    if (!result.ok) {
      alert(`The archive cannot be opened: ${result.diagnostics[0]!.message}`);
      return;
    }
    await bring(result.value.commit, result.value.changes, 'Replace the unsaved changes with the archive?');
  }
  // Changes made on another build, from an archive or another build's working state, replace this one's after the
  // same checks: a file this build changed too is the author's choice, and one already equal to this build's is dropped.
  async function bring(from: string, brought: readonly ArchivedChange[], question: string) {
    if (current.files.size && current.version !== current.saved && !confirm(question)) return false;
    const chosen = await resolveConflicts(index, from, brought);
    if (!chosen) return false;
    const files = new Map<string, { readonly bytes: Uint8Array<ArrayBuffer> | null; readonly base: string | null }>();
    for (const change of chosen) {
      const base = baseOf(change.path);
      const same = change.bytes ? base !== null && (await contentDigest(change.bytes)) === base : !base;
      if (!same) files.set(change.path, { bytes: change.bytes, base });
    }
    current = await working.replace(files, true);
    history.clear();
    moved();
    return true;
  }
  element('discard').addEventListener('click', () =>
    inOrder(async () => {
      if (!current.files.size || !confirm('Discard every change of this build, in every page?')) return;
      current = await working.replace(new Map(), true);
      history.clear();
      moved();
    }),
  );

  // Another build's working state is never dropped silently: it is brought here, saved as an archive or discarded.
  for (const other of await working.others()) {
    if (!other.files.size) {
      await working.remove(other.commit);
      continue;
    }
    const changesThere = [...other.files].map(([path, file]) => ({ path, base: file.base, bytes: file.bytes }));
    const answer = await askOtherBuild(other.commit, other.files.size);
    if (answer === 'bring' && !(await bring(other.commit, changesThere, 'Replace this build’s unsaved changes?')))
      continue;
    if (answer === 'save') download(other.commit, other.files);
    if (answer !== 'keep') await working.remove(other.commit);
  }

  // The header: the build, the changes, the compile and this page's history.
  const header = () => {
    const count = current.files.size;
    const compileText =
      state.status === 'running'
        ? 'compiling…'
        : state.status === 'ok'
          ? `compiled in ${state.last.seconds.toFixed(1)} s · ${state.measurements === 'saved' ? 'saved measurements' : 'preview measurements (not saved)'}`
          : state.unmeasured
            ? 'measurements are stale (Measure to preview)'
            : `failed (${state.diagnostics.length})${state.last ? ' · products are stale' : ''}`;
    const unsaved = count && current.version !== current.saved ? ' (unsaved)' : '';
    status.textContent = `build ${commit.slice(0, 7)} · ${count} change${count === 1 ? '' : 's'}${unsaved} · ${compileText}`;
    status.dataset.state =
      state.status === 'failed' && state.unmeasured
        ? 'stale'
        : state.status === 'ok' && state.measurements === 'preview'
          ? 'preview'
          : state.status;
    // A compile that failed internally (a read of the build, for one) compiles again on request.
    again.hidden = !(
      state.status === 'failed' && state.diagnostics.some((diagnostic) => diagnostic.kind === 'internal')
    );
    again.onclick = compile;
    const { undo: undoLabel, redo: redoLabel } = history.labels;
    labelled(element<HTMLButtonElement>('undo'), !history.canUndo, undoLabel ? `Undo: ${undoLabel}` : 'Undo');
    labelled(element<HTMLButtonElement>('redo'), !history.canRedo, redoLabel ? `Redo: ${redoLabel}` : 'Redo');
    labelled(element<HTMLButtonElement>('discard'), !count, 'Discard every change of this build');
  };
  listeners.add(header);
  listeners.add(() => showDiagnostics(context));
  listeners.add(() => void showProducts(context));

  // Modules: one tab each, and no tabs for a page of one module.
  const tabs = element('modules'),
    screen = element('module');
  tabs.hidden = page.pageModules.length < 2;
  const screens = new Map<EditorModule, HTMLElement>();
  const select = (module: EditorModule) => {
    for (const [other, section] of screens) section.hidden = other !== module;
    for (const button of tabs.querySelectorAll('button'))
      button.setAttribute('aria-pressed', String(button.dataset.module === module.id));
  };
  for (const module of page.pageModules) {
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
  moved();
}

/** Download the archive of a working state's files, made on the build `commit`. */
function download(commit: string, files: ReadonlyMap<string, WorkingFile>) {
  const archive = writeChangeArchive({
    commit,
    changes: [...files].map(([path, file]) => ({ path, base: file.base, bytes: file.bytes })),
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
  link.download = `superoutride-changes-${commit.slice(0, 7)}.zip`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** What to do with the changes another build left in this browser; `keep` leaves them (the prompt was dismissed). */
async function askOtherBuild(other: string, count: number): Promise<'bring' | 'save' | 'discard' | 'keep'> {
  const dialog = element<HTMLDialogElement>('other-build');
  element('other-build-text').textContent =
    `This browser holds ${count} change${count === 1 ? '' : 's'} made on build ${other.slice(0, 7)}.`;
  dialog.returnValue = '';
  dialog.showModal();
  const answer = await new Promise<string>((resolve) =>
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }),
  );
  return answer === 'bring' || answer === 'save' || answer === 'discard' ? answer : 'keep';
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
function showDiagnostics(context: EditorContext) {
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
  for (const diagnostic of state.diagnostics as readonly EditorDiagnostic[]) {
    // A course image diagnostic names the image's file by its name.
    const documentPath = 'document' in diagnostic ? diagnostic.document : `content/images/${diagnostic.image}.json`;
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
async function showProducts(context: EditorContext) {
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
