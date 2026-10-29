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
import { siteRoot } from './game-run.js';
import {
  BrokenWorkingState,
  openWorkingState,
  unsaved,
  type WorkingFile,
  type WorkingState,
  type WriteResult,
} from './working-state.js';
import { readChangeArchive, writeChangeArchive, type ArchivedChange } from './change-archive.js';
import { element, labelled } from './dom.js';
import { imagePathIn, inOriginalsPlace } from '../authoring/content-places.js';

/**
 * The editing pages' frame: the build's published authored files under its working state, compiled by the
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
    <button id="remove-broken" type="button" hidden>Remove the broken working state</button>
  </div>
  <p id="working-note" role="status" hidden></p>
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
  // The working state every page open on this build shares, kept in the browser; this page's own history of its edits.
  const working = await openWorkingState(commit);
  const empty: WorkingState = Object.freeze({ commit, files: new Map(), revision: 0, saved: {} });
  const note = element('working-note'),
    removeBroken = element<HTMLButtonElement>('remove-broken');
  // A stored state this page cannot read is kept as it is until K removes it; meanwhile the page edits nothing.
  let broken = false,
    current = empty;
  try {
    current = await working.read();
  } catch (error) {
    if (!(error instanceof BrokenWorkingState)) throw error;
    broken = true;
  }
  const history = createHistory();
  const revision = (path: string) => current.files.get(path)?.revision ?? 0;
  const changes = (): Changes => new Map([...current.files].map(([path, file]) => [path, file.bytes] as const));
  // Each working state compiles once, numbered by its generation.
  let generation = 0;
  // A hidden page draws nothing and asks nothing (findings, previews) until it is shown.
  let pendingNotify = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    if (document.hidden) {
      pendingNotify = true;
      return;
    }
    pendingNotify = false;
    listeners.forEach((listener) => listener());
  };
  const view = () => createLayeredStore(published, new Map(changes()));
  const store: ContentStore = Object.freeze({
    read: (path: string) => view().read(path),
    list: (directory: string) => view().list(directory),
    write: () => Promise.reject(new Error('Edit through the page')),
  });

  // Compiles run one at a time off the page's thread; an older result never replaces a newer one. Only a visible page
  // compiles: a page hidden meanwhile compiles when it is shown, whenever its last result is not of the current state.
  const worker = new Worker(new URL('tools/browser-shared/compile-worker.js', page.buildRoot), { type: 'module' });
  let state: CompileState = { status: 'running', last: null };
  // Preview measurements live beside the compile, never in the changes: no step, no archive, no change list.
  let preview = new Map<string, Uint8Array<ArrayBuffer>>();
  let running = false,
    compiled = -1;
  const compile = () => {
    if (document.hidden || running || compiled === generation) return;
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
    if (document.hidden) return;
    compile();
    if (pendingNotify) notify();
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
    if (data.generation !== generation) return compile();
    compiled = data.generation;
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
  // The page's copy of the state with `files` written at `revision`.
  const apply = (files: readonly EditedFile[], at: number) => {
    const next = new Map(current.files);
    for (const file of files)
      if (file.after === 'build') next.delete(file.path);
      else next.set(file.path, { bytes: file.after, base: file.base, revision: at, content: file.afterContent });
    current = Object.freeze({ ...current, files: next, revision: at });
  };
  const readAll = async () => {
    current = await working.read();
  };
  // Another page wrote files (only those are read again) or replaced the state (its history and this page's are void).
  working.subscribe((message) =>
    inOrder(async () => {
      if (broken) return;
      if (message.type === 'reset') {
        history.clear();
        await readAll();
      } else {
        const found = await working.readPaths(message.paths);
        const files = new Map(current.files);
        for (const [path, file] of found.files)
          if (file) files.set(path, file);
          else files.delete(path);
        current = Object.freeze({ ...current, files, revision: found.revision, saved: found.saved });
      }
      moved();
    }),
  );
  const refusedWhileBroken = () => {
    if (broken) alert('The working state stored for this build cannot be read: remove it first (in the header).');
    return broken;
  };
  // Write files to the working state, each expected at `expected`'s revision. Refused, or failing in the browser (no
  // space left, say), nothing is written and K is told; the page goes on. The caller records the step, then `moved`.
  const write = async (
    files: readonly EditedFile[],
    expected: (path: string) => number,
    refused: (path: string) => string,
  ): Promise<number | null> => {
    let result: WriteResult;
    try {
      result = await working.write(
        files.map((file) => ({
          path: file.path,
          bytes: file.after,
          content: file.afterContent,
          base: file.base,
          expected: expected(file.path),
        })),
      );
    } catch (error) {
      alert(
        `The browser could not keep this change, so nothing was written: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
    if (!result.ok) {
      alert(refused(result.path));
      await readAll();
      moved();
      return null;
    }
    apply(files, result.revision);
    return result.revision;
  };
  // One edit of one or more files, each with the revision its edit was made from (`readAt`): refused when another page
  // has written the file since. A file equal to the build's own is no change, and a path that is not under content/
  // (CONTENT_PATH) or lies in the originals' place is refused before anything is written.
  const edit = (files: readonly (readonly [string, EditedBytes, number])[], label: string) => {
    const outside = files.find(([path]) => !CONTENT_PATH.pattern.test(path));
    if (outside) {
      alert(`Not a path under content/: ${outside[0]}`);
      return;
    }
    const original = files.find(([path]) => inOriginalsPlace(path));
    if (original) {
      alert(`content/${original[0]} is an original, which no page writes.`);
      return;
    }
    inOrder(async () => {
      if (refusedWhileBroken()) return;
      const edited: EditedFile[] = [];
      for (const [path, bytes] of files) {
        const base = baseOf(path);
        const content = bytes === 'build' ? null : bytes ? await contentDigest(bytes) : DELETED;
        const same = content === null || (bytes ? content === base : !base);
        const before = current.files.get(path);
        edited.push({
          path,
          base,
          before: editedBytes(before),
          beforeContent: before?.content ?? BUILD,
          after: same ? 'build' : bytes,
          afterContent: same ? BUILD : content,
        });
      }
      const readAt = new Map(files.map(([path, , at]) => [path, at]));
      const expected = (path: string) => readAt.get(path)!;
      const at = await write(edited, expected, (path) => `${path} changed in another page; edit again`);
      if (at === null) return;
      history.push(label, edited, expected, at);
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
    revision,
    async readFile(path: string) {
      // The revision and the bytes of one moment: the view is taken as the revision is.
      const at = revision(path);
      return { bytes: await view().read(path), revision: at };
    },
    replace: (path: string, value: unknown, readAt: number, label = `Edit ${path}`) =>
      void edit([[path, new TextEncoder().encode(formatSavedJson(value)), readAt]], label),
    setFile: (
      path: string,
      bytes: Uint8Array<ArrayBuffer> | null,
      readAt: number,
      label = `${bytes ? 'Set' : 'Delete'} ${path}`,
    ) => void edit([[path, bytes, readAt]], label),
    setFiles: (files: readonly (readonly [string, Uint8Array<ArrayBuffer> | null, number])[], label: string) =>
      void edit(files, label),
    preview: () => preview,
    query: (query: CourseQuery) =>
      new Promise<QueryResponse>((resolve) => {
        const id = ++queryId;
        queries.set(id, resolve);
        worker.postMessage({ type: 'query', id, query } satisfies QueryRequest);
      }),
    addPreview(files: readonly (readonly [string, Uint8Array<ArrayBuffer>])[]) {
      preview = new Map([...preview, ...files]);
      compiled = -1;
      moved();
    },
    revert: (path: string, readAt: number) => edit([[path, 'build', readAt]], `Revert ${path}`),
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

  // Undo and redo move through this page's own edits, each file expected where this page last left it; one whose
  // file another page has written since is refused.
  const undoRefused = (path: string) => `${path} changed in another page since; this undo was not made`;
  const redoRefused = (path: string) => `${path} changed in another page since; this redo was not made`;
  const undo = () =>
    inOrder(async () => {
      const step = history.toUndo;
      if (!step || refusedWhileBroken()) return;
      const closed = history.closed(step);
      if (closed) return alert(undoRefused(closed.path));
      const back = step.files.map((file) => ({
        ...file,
        before: file.after,
        beforeContent: file.afterContent,
        after: file.before,
        afterContent: file.beforeContent,
      }));
      const at = await write(back, (path) => history.mine(path) ?? -1, undoRefused);
      if (at === null) return;
      history.undone(at);
      moved();
    });
  const redo = () =>
    inOrder(async () => {
      const step = history.toRedo;
      if (!step || refusedWhileBroken()) return;
      const closed = history.closed(step);
      if (closed) return alert(redoRefused(closed.path));
      const at = await write(step.files, (path) => history.mine(path) ?? -1, redoRefused);
      if (at === null) return;
      history.redone(at);
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
  const guarded = async (work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      alert(`The browser could not keep the working state: ${error instanceof Error ? error.message : error}`);
    }
  };
  element('save').addEventListener('click', () =>
    inOrder(() =>
      guarded(async () => {
        download(commit, current.files);
        await working.markSaved();
        current = Object.freeze({ ...current, saved: contentOf(current.files) });
        notify();
      }),
    ),
  );
  element<HTMLInputElement>('open-archive').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) inOrder(() => openArchive(file));
  });
  async function openArchive(file: File) {
    if (refusedWhileBroken()) return;
    const result = readChangeArchive(new Uint8Array(await file.arrayBuffer()));
    if (!result.ok) {
      alert(`The archive cannot be opened: ${result.diagnostics[0]!.message}`);
      return;
    }
    await bring(result.value.commit, result.value.changes, 'Replace the unsaved changes with the archive?', true);
  }
  // Changes made on another build, from an archive or another build's working state, replace this one's: a file
  // already equal to this build's is dropped first, then a file this build changed too is the author's choice. Only an
  // archive's changes are saved; changes brought from a working state are in no archive yet.
  async function bring(from: string, brought: readonly ArchivedChange[], question: string, saved: boolean) {
    if (current.files.size && unsaved(current) && !confirm(question)) return false;
    const pending: (ArchivedChange & { readonly content: string })[] = [];
    for (const change of brought) {
      const base = baseOf(change.path);
      const content = change.bytes ? await contentDigest(change.bytes) : DELETED;
      if (change.bytes ? content !== base : base !== null) pending.push({ ...change, content });
    }
    // No page writes the originals' place, whatever brings the change.
    const original = pending.find((change) => inOriginalsPlace(change.path));
    if (original) {
      alert(`These changes change content/${original.path}, an original, which no page writes; they are not brought.`);
      return false;
    }
    const chosen = await resolveConflicts(index, from, pending);
    if (!chosen) return false;
    const files = new Map(
      chosen.map((change) => [
        change.path,
        { bytes: change.bytes, base: baseOf(change.path), content: change.content },
      ]),
    );
    let done = false;
    await guarded(async () => {
      await working.replace(files, saved);
      done = true;
    });
    if (!done) return false;
    history.clear();
    await readAll();
    moved();
    return true;
  }
  element('discard').addEventListener('click', () =>
    inOrder(async () => {
      if (refusedWhileBroken() || !current.files.size) return;
      if (!confirm('Discard every change of this build, in every page?')) return;
      await guarded(async () => {
        await working.replace(new Map(), true);
        history.clear();
        await readAll();
        moved();
      });
    }),
  );
  removeBroken.addEventListener('click', () =>
    inOrder(() =>
      guarded(async () => {
        if (!confirm('Remove the working state stored for this build, which cannot be read?')) return;
        await working.removeOwn();
        broken = false;
        history.clear();
        await readAll();
        moved();
      }),
    ),
  );

  // Another build's working state is never dropped silently: it is brought here, saved as an archive or discarded.
  // Only the build the site publishes now does this, so a tab of an older build never takes a newer build's state.
  if (await isPublishedBuild(commit))
    for (const listed of await working.others()) {
      const name = `build ${listed.commit.slice(0, 7)}`;
      if (listed.broken) {
        if (confirm(`This browser holds a working state of ${name} that cannot be read. Remove it?`))
          await guarded(async () => void (await working.removeOther(listed.commit, null)));
        continue;
      }
      if (!listed.count) {
        await guarded(async () => void (await working.removeOther(listed.commit, listed.revision)));
        continue;
      }
      const answer = await askOtherBuild(listed.commit, listed.count);
      if (answer === 'keep') continue;
      // What K answered about is read again: a change since the question leaves the state for the next opening.
      const other = await working.readOther(listed.commit);
      if (other.revision !== listed.revision) {
        alert(`The changes of ${name} changed while you chose; they are kept and offered again next time.`);
        continue;
      }
      if (answer === 'save') {
        download(other.commit, other.files);
        continue;
      }
      if (answer === 'bring') {
        const there = [...other.files].map(([path, file]) => ({ path, base: file.base, bytes: file.bytes }));
        if (!(await bring(other.commit, there, 'Replace this build’s unsaved changes?', false))) continue;
      }
      let removed = false;
      await guarded(async () => void (removed = await working.removeOther(other.commit, other.revision)));
      if (!removed) alert(`The changes of ${name} changed meanwhile and were kept.`);
    }

  // The header: the build, the changes, the compile, this page's history and where the state is kept.
  note.hidden = working.persistent && !broken;
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
    const marked = count && unsaved(current) ? ' (unsaved)' : '';
    status.textContent = `build ${commit.slice(0, 7)} · ${count} change${count === 1 ? '' : 's'}${marked} · ${compileText}`;
    status.dataset.state =
      state.status === 'failed' && state.unmeasured
        ? 'stale'
        : state.status === 'ok' && state.measurements === 'preview'
          ? 'preview'
          : state.status;
    note.textContent = broken
      ? 'The working state stored for this build cannot be read.'
      : working.persistent
        ? ''
        : 'This browser cannot keep the changes (no IndexedDB): they live in this page alone, so save them before closing it.';
    note.hidden = !note.textContent;
    removeBroken.hidden = !broken;
    // A compile that failed internally (a read of the build, for one) compiles again on request.
    again.hidden = !(
      state.status === 'failed' && state.diagnostics.some((diagnostic) => diagnostic.kind === 'internal')
    );
    again.onclick = () => {
      compiled = -1;
      compile();
    };
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

/** What a deleted file holds, and what a file returned to the build's own holds, in an edit. */
const DELETED = 'deleted',
  BUILD = 'build';

/** Each file's content, as a saved mark records it. */
const contentOf = (files: ReadonlyMap<string, WorkingFile>) =>
  Object.freeze(Object.fromEntries([...files].map(([path, file]) => [path, file.content])));

/** Whether `commit` is the build the site publishes now (its `version.txt`); a local build, with none, is. */
async function isPublishedBuild(commit: string): Promise<boolean> {
  try {
    const response = await fetch(new URL(`version.txt?t=${Date.now()}`, siteRoot()), { cache: 'no-store' });
    const version = response.ok ? (await response.text()).trim() : '';
    return !/^[0-9a-f]{40}$/.test(version) || version === commit;
  } catch {
    return true;
  }
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
async function resolveConflicts<Change extends ArchivedChange>(
  index: AuthoredIndex,
  archiveCommit: string,
  changes: readonly Change[],
): Promise<Change[] | null> {
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
    const documentPath =
      'document' in diagnostic ? diagnostic.document : `content/${imagePathIn(context.paths(), diagnostic.image)}`;
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
