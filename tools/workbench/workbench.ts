import { formatSavedJson } from '../../src/content/saved-json.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { AUTHORED_DIRECTORY } from '../authoring/authored-index.js';
import type { ContentStore } from '../authoring/content-store.js';
import { createLayeredStore } from '../authoring/layered-store.js';
import { openPublishedStore } from './published-store.js';
import type { CompileRequest, CompileResponse, WorkbenchDiagnostic } from './compile-protocol.js';
import type { CompileState, WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { WORKBENCH_MODULES } from './modules.js';

/**
 * The workbench page: the build's published authored files under the session's changes, compiled by the authoring
 * core in a worker, with modules that read the store and the compile and edit by replacing documents.
 */
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
// The page is `tools/workbench/workbench.html` inside a build; the build's root is two directories up.
const buildRoot = new URL('../../', location.href);
const authoredRoot = new URL(`${AUTHORED_DIRECTORY}/`, buildRoot);
const status = element('status');

try {
  const { index, store: published } = await openPublishedStore(authoredRoot);
  start(index.commit, published);
} catch (error) {
  status.textContent = `The workbench could not open this build: ${error instanceof Error ? error.message : error}`;
  status.dataset.state = 'failed';
}

function start(commit: string, published: ContentStore) {
  const changes = new Map<string, Uint8Array<ArrayBuffer> | null>();
  let step = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const view = createLayeredStore(published, changes);
  const store: ContentStore = Object.freeze({
    read: view.read,
    list: view.list,
    write: () => Promise.reject(new Error('Edit through the workbench')),
  });

  // Compiles run one at a time off the page's thread; an older result never replaces a newer one.
  const worker = new Worker(new URL('./compile-worker.js', import.meta.url), { type: 'module' });
  let state: CompileState = { status: 'running', last: null };
  let running = false,
    wanted = 0;
  const compile = () => {
    wanted = step;
    if (running) return;
    running = true;
    state = { status: 'running', last: state.last };
    notify();
    worker.postMessage({ generation: step, root: authoredRoot.href, changes: [...changes] } satisfies CompileRequest);
  };
  worker.addEventListener('message', ({ data }: MessageEvent<CompileResponse>) => {
    running = false;
    if (data.generation !== wanted) return compile();
    state = data.ok
      ? { status: 'ok', last: { step: data.generation, seconds: data.seconds, files: data.files } }
      : { status: 'failed', diagnostics: data.diagnostics, last: state.last };
    notify();
  });

  const modules: WorkbenchModule[] = [];
  const setFile = (path: string, bytes: Uint8Array<ArrayBuffer> | null) => {
    changes.set(path, bytes);
    step++;
    compile();
  };
  const context: WorkbenchContext = Object.freeze({
    store,
    commit,
    compile: () => state,
    replace: (path: string, value: unknown) => setFile(path, new TextEncoder().encode(formatSavedJson(value))),
    setFile,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reveal(documentPath: string, pointer: string) {
      const target = modules.find((module) => module.reveal);
      if (!target) return;
      select(target);
      target.reveal!(documentPath, pointer);
    },
  });

  // The header: the build, the changes and the compile.
  const header = () => {
    const count = changes.size;
    const compileText =
      state.status === 'running'
        ? 'compiling…'
        : state.status === 'ok'
          ? `compiled in ${state.last.seconds.toFixed(1)} s`
          : `failed (${state.diagnostics.length})${state.last ? ' · products are stale' : ''}`;
    status.textContent = `build ${commit.slice(0, 7)} · ${count} change${count === 1 ? '' : 's'} · ${compileText}`;
    status.dataset.state = state.status;
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

/** The diagnostics of a failed compile; each opens its document at its pointer. */
function showDiagnostics(context: WorkbenchContext) {
  const list = element('diagnostics');
  const state = context.compile();
  list.replaceChildren();
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
