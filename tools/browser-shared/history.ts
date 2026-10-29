import type { WorkingFile } from './working-state.js';

/** At most this many steps are kept; the oldest go first. */
export const HISTORY_STEPS = 200;
/** At most this many bytes of distinct file versions are kept; the oldest steps go first. */
export const HISTORY_BYTES = 128 * 1024 * 1024;

/** A file's content in an edit: its bytes, null when deleted, or `build` for the build's own. */
export type EditedBytes = Uint8Array<ArrayBuffer> | null | 'build';

/** One file an edit changed: its content before and after, and its digest in the build. */
export interface EditedFile {
  readonly path: string;
  readonly base: string | null;
  readonly before: EditedBytes;
  readonly after: EditedBytes;
}

/** A file's content as a working file holds it, or the build's own when the state does not hold it. */
export const editedBytes = (file: WorkingFile | undefined): EditedBytes => (file ? file.bytes : 'build');

interface Step {
  readonly label: string;
  readonly files: readonly EditedFile[];
  /** The revision the step's files are at in the working state since it was last done or undone. */
  revision: number;
}

/**
 * One page's undo history over the shared working state: its own edits, each with its files before and after and
 * the revision it left them at, so an undo or redo can be refused when another page has changed a file since. An edit
 * after an undo drops the steps ahead.
 */
export function createHistory() {
  let steps: Step[] = [],
    // The number of steps done; the step to undo is the one before it.
    position = 0;
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
    /** One edit, done, its files at `revision`. */
    push(label: string, files: readonly EditedFile[], revision: number) {
      steps = [...steps.slice(0, position), { label, files, revision }];
      position = steps.length;
      while (steps.length > 1 && (steps.length > HISTORY_STEPS || bytes() > HISTORY_BYTES)) {
        steps.shift();
        position--;
      }
    },
    /** The step to undo was undone, its files now at `revision`. */
    undone(revision: number) {
      steps[--position]!.revision = revision;
    },
    /** The step to redo was done again, its files now at `revision`. */
    redone(revision: number) {
      steps[position++]!.revision = revision;
    },
    /** Forget every step: the working state was replaced. */
    clear() {
      steps = [];
      position = 0;
    },
  };
}
