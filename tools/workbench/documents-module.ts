import { formatSavedJson } from '../../src/content/saved-json.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import type { WorkbenchDiagnostic } from './compile-protocol.js';
import type { WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { make } from './dom.js';
import { confirmField } from './pending-edit.js';
import { childPointer, nearestPointer, withValue, type Json } from './json-pointer.js';

/** Children of an opened container are shown this many at a time. */
const PAGE = 200;
/** A field whose name, or whose container's name, matches is an RGB555 color when it holds an integer color. */
const COLOR_FIELD = /colou?r|palette|lamp|^off$|^on$/i;

interface Located {
  readonly code: string;
  readonly message: string;
  /** The diagnostic's own pointer, when nothing exists there and it shows at its nearest existing parent. */
  readonly missing: string | null;
}

/** The diagnostics of the current compile by the store path of their document. */
function diagnosticsByDocument(
  context: WorkbenchContext,
): Map<string, { pointer: string; code: string; message: string }[]> {
  const result = new Map<string, { pointer: string; code: string; message: string }[]>();
  const state = context.compile();
  if (state.status !== 'failed') return result;
  for (const diagnostic of state.diagnostics as readonly WorkbenchDiagnostic[]) {
    const document = 'document' in diagnostic ? diagnostic.document : `content/images/${diagnostic.sha256}.json`;
    if (!document) continue;
    const pointer = ('path' in diagnostic ? diagnostic.path : '') ?? '';
    const path = document.replace(/^content\//, '');
    result.set(path, [...(result.get(path) ?? []), { pointer, code: diagnostic.code, message: diagnostic.message }]);
  }
  return result;
}

function swatch(value: number): HTMLElement | null {
  if (!Number.isInteger(value) || value < 0 || value > 0x7fff) return null;
  const { r, g, b } = unpackRgba(rgb555ToRgba(value));
  const box = make('span', '', { class: 'swatch', title: `RGB555 ${value}` });
  box.style.background = `rgb(${r} ${g} ${b})`;
  return box;
}

/**
 * The one document view for every kind of document: the documents by directory, and a document's JSON tree with its
 * admission diagnostics at their JSON Pointers. Values are edited in place; containers are edited as JSON text in the
 * saved layout. Every confirmed edit replaces the document: one step.
 */
export function createDocumentsModule(): WorkbenchModule {
  let context: WorkbenchContext;
  let list: HTMLElement, pane: HTMLElement;
  let current: string | null = null,
    root: Json | undefined,
    rootText: string | null = null;
  const opened = new Set<string>();
  let highlight: string | null = null;

  const replaceAt = (pointer: string, value: Json) =>
    context.replace(current!, withValue(root as Json, pointer, value), `Edit ${current}${pointer || ' (root)'}`);

  /** Show the document list with each document's marks. */
  const showList = () => {
    const changes = context.changes(),
      diagnostics = diagnosticsByDocument(context);
    const groups = new Map<string, string[]>();
    for (const path of context.paths()) {
      const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      groups.set(directory, [...(groups.get(directory) ?? []), path]);
    }
    const items = [];
    for (const [directory, paths] of groups) {
      const group = make('details');
      group.open = paths.includes(current ?? '') || paths.some((path) => diagnostics.has(path) || changes.has(path));
      group.append(make('summary', `${directory || '(root)'} (${paths.length})`));
      for (const path of paths) {
        const marks = `${changes.has(path) ? ' ●' : ''}${diagnostics.has(path) ? ` ⚠${diagnostics.get(path)!.length}` : ''}`;
        const button = make('button', `${path.slice(directory.length ? directory.length + 1 : 0)}${marks}`, {
          type: 'button',
          'data-path': path,
        });
        if (path === current) button.setAttribute('aria-pressed', 'true');
        if (diagnostics.has(path)) button.classList.add('has-diagnostics');
        button.addEventListener('click', () => void open(path));
        group.append(button);
      }
      items.push(group);
    }
    list.replaceChildren(...items);
  };

  /** Open a document: read it from the store and show its tree. */
  const open = async (path: string) => {
    if (path !== current) opened.clear();
    current = path;
    const bytes = await context.store.read(path).catch(() => null);
    if (current !== path) return;
    rootText = bytes ? new TextDecoder().decode(bytes) : null;
    try {
      root = rootText === null ? undefined : (JSON.parse(rootText) as Json);
    } catch {
      root = undefined;
    }
    opened.add('');
    showList();
    showDocument(bytes?.byteLength ?? 0);
  };

  /** Show the open document's tree, keeping which containers are open. */
  const showDocument = (byteLength: number) => {
    const header = make('h2', current ?? '');
    if (root === undefined) {
      pane.replaceChildren(
        header,
        make('p', rootText === null ? 'The file is absent.' : `Not a JSON document (${byteLength} bytes).`),
      );
      return;
    }
    // Each diagnostic shows at its pointer, or at the nearest parent that exists.
    const located = new Map<string, Located[]>();
    for (const { pointer, code, message } of diagnosticsByDocument(context).get(current!) ?? []) {
      const at = nearestPointer(root, pointer);
      located.set(at, [...(located.get(at) ?? []), { code, message, missing: at === pointer ? null : pointer }]);
    }
    const tree = make('div', '', { class: 'tree' });
    tree.append(node(root, '', current!, located));
    pane.replaceChildren(header, tree);
    if (highlight !== null) {
      const target = tree.querySelector<HTMLElement>(`[data-pointer="${CSS.escape(highlight)}"]`);
      target?.classList.add('revealed');
      target?.scrollIntoView({ block: 'center' });
      highlight = null;
    }
  };

  /** The diagnostics shown at one pointer. */
  const notes = (located: Map<string, Located[]>, pointer: string) =>
    (located.get(pointer) ?? []).map(({ code, message, missing }) =>
      make('div', `${code}: ${message}${missing ? ` (at ${missing})` : ''}`, { class: 'diagnostic' }),
    );

  /** One value of the tree: a primitive edited in place, or a container opened on demand. */
  const node = (value: Json, pointer: string, label: string, located: Map<string, Located[]>): HTMLElement => {
    if (value === null || typeof value !== 'object') {
      const row = make('div', '', { class: 'row', 'data-pointer': pointer });
      row.append(make('span', `${label}: `, { class: 'key' }), editor(value, pointer));
      const key = label,
        parent = pointer.slice(0, pointer.lastIndexOf('/'));
      if (typeof value === 'number' && (COLOR_FIELD.test(key) || COLOR_FIELD.test(parent.split('/').at(-1) ?? ''))) {
        const box = swatch(value);
        if (box) row.append(box);
      }
      row.append(...notes(located, pointer));
      return row;
    }
    const entries: [string, Json][] = Array.isArray(value)
      ? value.map((item, i) => [String(i), item])
      : Object.entries(value);
    const box = make('details', '', { 'data-pointer': pointer });
    const inside = [...located.keys()].filter((at) => at.startsWith(`${pointer}/`)).length;
    const summary = make('summary');
    summary.append(
      make('span', label, { class: 'key' }),
      make('span', ` ${Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}`, { class: 'size' }),
    );
    if (inside) summary.append(make('span', ` ⚠ ${inside} inside`, { class: 'inside' }));
    const editJson = make('button', 'Edit JSON', { type: 'button' });
    summary.append(' ', editJson);
    box.append(summary, ...notes(located, pointer));
    const children = make('div', '', { class: 'children' });
    box.append(children);
    let shown = 0;
    const more = make('button', '', { type: 'button' });
    const showMore = () => {
      const next = entries.slice(shown, shown + PAGE);
      for (const [key, item] of next) children.append(node(item, childPointer(pointer, key), key, located));
      shown += next.length;
      more.remove();
      if (shown < entries.length) {
        more.textContent = `Show ${Math.min(PAGE, entries.length - shown)} more of ${entries.length - shown}`;
        children.append(more);
      }
    };
    more.addEventListener('click', showMore);
    box.addEventListener('toggle', () => {
      if (box.open) {
        opened.add(pointer);
        if (!shown) showMore();
      } else opened.delete(pointer);
    });
    editJson.addEventListener('click', (event) => {
      event.preventDefault();
      textEditor(box, value, pointer);
    });
    box.open = opened.has(pointer);
    if (box.open) showMore();
    return box;
  };

  /** A primitive's editor: confirmed by Enter or leaving it. Text that is not a value stays in the field. */
  const editor = (value: Exclude<Json, object>, pointer: string): HTMLElement => {
    if (typeof value === 'boolean') {
      const check = make('input', '', { type: 'checkbox' });
      check.checked = value;
      check.addEventListener('change', () => replaceAt(pointer, check.checked));
      return check;
    }
    const input = make('input', '', { type: 'text', class: `value ${value === null ? 'null' : typeof value}` });
    input.value = typeof value === 'string' ? value : JSON.stringify(value);
    input.size = Math.min(60, Math.max(6, input.value.length + 1));
    confirmField(
      input,
      (text): { next: Json } | null => {
        if (typeof value === 'string') return { next: text };
        try {
          const next = JSON.parse(text) as Json;
          return typeof value === 'number' && typeof next !== 'number' ? null : { next };
        } catch {
          return null;
        }
      },
      ({ next }) => replaceAt(pointer, next),
    );
    input.title = 'Text that is not a value stays in the field; the document keeps its saved value';
    return input;
  };

  /** A container's JSON text in the saved layout, applied as one edit when it parses. */
  const textEditor = (box: HTMLElement, value: Json, pointer: string) => {
    if (box.querySelector(':scope > .json-editor')) return;
    const form = make('div', '', { class: 'json-editor' });
    const area = make('textarea', '', { spellcheck: 'false' });
    area.value = formatSavedJson(value).trimEnd();
    area.rows = Math.min(30, area.value.split('\n').length + 1);
    const apply = make('button', 'Apply', { type: 'button' }),
      cancel = make('button', 'Cancel', { type: 'button' }),
      error = make('span', '', { class: 'diagnostic' });
    apply.addEventListener('click', () => {
      try {
        replaceAt(pointer, JSON.parse(area.value) as Json);
        form.remove();
      } catch (cause) {
        error.textContent = `Not JSON: ${(cause as Error).message}`;
      }
    });
    cancel.addEventListener('click', () => form.remove());
    form.append(area, make('br'), apply, ' ', cancel, ' ', error);
    box.querySelector(':scope > summary')!.after(form);
    (box as HTMLDetailsElement).open = true;
    area.focus();
  };

  const module: WorkbenchModule = {
    id: 'documents',
    title: 'Documents',
    mount(element: HTMLElement, mounted: WorkbenchContext) {
      context = mounted;
      element.classList.add('documents');
      list = make('nav', '', { class: 'document-list', 'aria-label': 'Documents' });
      pane = make('div', '', { class: 'document' });
      pane.append(make('p', 'Choose a document.'));
      element.append(list, pane);
      let shownChanges: unknown = null,
        shownCompile: unknown = null;
      context.subscribe(() => {
        const changes = context.changes(),
          compile = context.compile();
        if (changes === shownChanges && compile === shownCompile) return;
        const changed = changes !== shownChanges;
        shownChanges = changes;
        shownCompile = compile;
        if (changed && current) void open(current);
        else {
          showList();
          if (current && root !== undefined) showDocument(0);
        }
      });
      showList();
    },
    reveal(document: string, pointer: string) {
      highlight = pointer;
      void open(document).then(() => {
        if (root === undefined) return;
        // Open every container on the way to the diagnostic.
        const at = nearestPointer(root, pointer);
        let path = '';
        for (const token of at.split('/').slice(1)) {
          opened.add(path);
          path = `${path}/${token}`;
        }
        opened.add(path);
        highlight = at;
        showDocument(0);
      });
    },
  };
  return module;
}
