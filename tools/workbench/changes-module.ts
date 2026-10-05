import { formatSavedJson } from '../../src/content/saved-json.js';
import type { WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { make } from './dom.js';

/** Lines shown on each side of a difference at most. */
const DIFF_LINES = 400;

/** The text of UTF-8 bytes, or null for other bytes. */
function text(bytes: Uint8Array | null): string | null {
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** A JSON text in the saved layout, or null when it is not JSON. */
function saved(json: string): string | null {
  try {
    return formatSavedJson(JSON.parse(json));
  } catch {
    return null;
  }
}

/** The changed lines between two texts: their common beginning and end removed. */
function difference(before: string, after: string): HTMLElement {
  const a = before.split('\n'),
    b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const box = make('div', '', { class: 'diff' });
  box.append(make('span', `@@ line ${start + 1}\n`));
  const side = (lines: string[], sign: string, kind: string) => {
    const shown = lines.slice(0, DIFF_LINES);
    for (const line of shown) box.append(make('span', `${sign} ${line}\n`, { class: kind }));
    if (lines.length > shown.length) box.append(make('span', `${sign} … ${lines.length - shown.length} more lines\n`));
  };
  side(a.slice(start, a.length - end), '-', 'removed');
  side(b.slice(start, b.length - end), '+', 'added');
  return box;
}

/**
 * The changes: every changed, added or deleted path with its difference from the build and a revert, and the generic
 * file edits (set a file's bytes, delete a file).
 */
export const changesModule: WorkbenchModule = {
  id: 'changes',
  title: 'Changes',
  mount(element: HTMLElement, context: WorkbenchContext) {
    const path = make('input', '', {
      type: 'text',
      placeholder: 'path under content/, e.g. music/new.json',
      size: '48',
    });
    const file = make('input', '', { type: 'file' });
    const set = make('button', 'Set file…', { type: 'button' });
    const remove = make('button', 'Delete file', { type: 'button' });
    set.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      file.value = '';
      const target = path.value.trim() || chosen?.name;
      if (chosen && target) context.setFile(target, new Uint8Array(await chosen.arrayBuffer()));
    });
    remove.addEventListener('click', () => {
      const target = path.value.trim();
      if (target) context.setFile(target, null);
    });
    file.hidden = true;
    const list = make('ul', '', { class: 'changes' });
    element.append(make('h2', 'Changes'), make('p', '', {}), list, make('h2', 'Files'));
    element.append(make('p', 'Set a file’s bytes from a file on disk, or delete a file, at a path under content/.'));
    element.append(path, ' ', set, ' ', remove, file);
    const summary = element.querySelector('p')!;
    let shown: unknown = null;
    const render = async () => {
      const changes = context.changes();
      if (changes === shown) return;
      shown = changes;
      const items = [];
      for (const [changed, bytes] of [...changes].sort(([a], [b]) => (a < b ? -1 : 1))) {
        const original = await context.published.read(changed).catch(() => null);
        const kind = bytes === null ? 'deleted' : original === null ? 'added' : 'changed';
        const item = make('li');
        const revert = make('button', 'Revert', { type: 'button' });
        revert.addEventListener('click', () => context.revert(changed));
        const details = make('details');
        details.append(make('summary', `${kind} · ${changed}`));
        const before = text(original),
          after = text(bytes);
        // Documents compare by value in the saved layout.
        const [layoutBefore, layoutAfter] = [before, after].map((value) => (value === null ? null : saved(value)));
        if (layoutBefore && layoutAfter) details.append(difference(layoutBefore, layoutAfter));
        else if (before !== null && after !== null) details.append(difference(before, after));
        else
          details.append(
            make('p', `${original?.byteLength ?? 0} bytes in the build → ${bytes?.byteLength ?? 0} bytes now`),
          );
        item.append(revert, ' ', details);
        items.push(item);
      }
      if (shown !== changes) return;
      summary.textContent = items.length ? `${items.length} changed paths` : 'No changes.';
      list.replaceChildren(...items);
    };
    context.subscribe(() => void render());
    void render();
  },
};
