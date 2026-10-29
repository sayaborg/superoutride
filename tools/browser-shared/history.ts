import type { WorkingFile } from './working-state.js';

/** At most this many steps are kept; the oldest go first. */
export const HISTORY_STEPS = 200;
/** At most this many bytes of distinct file versions are kept; the oldest steps go first. */
export const HISTORY_BYTES = 128 * 1024 * 1024;

/** A file's content in an edit: its bytes, null when deleted, or `build` for the build's own. */
export type EditedBytes = Uint8Array<ArrayBuffer> | null | 'build';

/** One file an edit changed: its digest in the build, and its bytes and content before and after. */
export interface EditedFile {
  readonly path: string;
  readonly base: string | null;
  readonly before: EditedBytes;
  readonly beforeContent: string;
  readonly after: EditedBytes;
  readonly afterContent: string;
}

/** A file's content as the working state holds it, or the build's own when the state does not hold it. */
export const editedBytes = (file: WorkingFile | undefined): EditedBytes => (file ? file.bytes : 'build');

interface Step {
  readonly label: string;
  readonly files: readonly EditedFile[];
  /** Each file's epoch when the step was made; the step can be undone or redone only in that epoch. */
  readonly epochs: ReadonlyMap<string, number>;
}

/**
 * One page's undo history over the shared working state: its own edits, each file's content before and after. The
 * page keeps the revision it last left each file at, so an undo or redo is refused when another page has written the
 * file since; and once this page edits a file another page wrote, the file's epoch moves on, closing the older steps
 * on that file, whose undo would reach across the other page's change. An edit after an undo drops the steps ahead.
 */
export function createHistory() {
  let steps: Step[] = [],
    // The number of steps done; the step to undo is the one before it.
    position = 0;
  const mine = new Map<string, number>(),
    epochs = new Map<string, number>();
  const bytes = () => {
    const seen = new Set<ArrayBuffer>();
    let total = 0;
    for (const step of steps)
      for (const file of step.files)
        for (const value of [file.before, file.after])
          if (value instanceof Uint8Array && !seen.has(value.buffer)) {
            seen.add(value.buffer);
            total += value.byteLength;
          }
    return total;
  };
  const leave = (files: readonly EditedFile[], revisions: (file: EditedFile) => number) => {
    for (const file of files) mine.set(file.path, revisions(file));
  };
  return {
    get canUndo() {
      return position > 0;
    },
    get canRedo() {
      return position < steps.length;
    },
    /** The labels of the step to undo and to redo. */
    get labels() {
      return { undo: steps[position - 1]?.label ?? null, redo: steps[position]?.label ?? null };
    },
    /** The step an undo would reverse, or null. */
    get toUndo(): Readonly<Step> | null {
      return steps[position - 1] ?? null;
    },
    /** The step a redo would make again, or null. */
    get toRedo(): Readonly<Step> | null {
      return steps[position] ?? null;
    },
    /** The revision this page last left `path` at, or null when it has not written it. */
    mine: (path: string) => mine.get(path) ?? null,
    /** The first file of `step` whose epoch has moved on since it was made, or null. */
    closed: (step: Readonly<Step>) =>
      step.files.find((file) => step.epochs.get(file.path) !== epochs.get(file.path)) ?? null,
    /**
     * One edit, done: `found` is each file's revision just before it, `revision` the one it wrote. A file another page
     * wrote since this page last left it starts a new epoch.
     */
    push(label: string, files: readonly EditedFile[], found: (path: string) => number, revision: number) {
      for (const file of files)
        if (mine.get(file.path) !== found(file.path)) epochs.set(file.path, (epochs.get(file.path) ?? 0) + 1);
      const step = { label, files, epochs: new Map(files.map((file) => [file.path, epochs.get(file.path) ?? 0])) };
      steps = [...steps.slice(0, position), step];
      position = steps.length;
      leave(files, (file) => (file.after === 'build' ? 0 : revision));
      while (steps.length > 1 && (steps.length > HISTORY_STEPS || bytes() > HISTORY_BYTES)) {
        steps.shift();
        position--;
      }
    },
    /** The step to undo was undone at `revision`. */
    undone(revision: number) {
      const step = steps[--position]!;
      leave(step.files, (file) => (file.before === 'build' ? 0 : revision));
    },
    /** The step to redo was done again at `revision`. */
    redone(revision: number) {
      const step = steps[position++]!;
      leave(step.files, (file) => (file.after === 'build' ? 0 : revision));
    },
    /** Forget every step: the working state was replaced. */
    clear() {
      steps = [];
      position = 0;
      mine.clear();
      epochs.clear();
    },
  };
}
