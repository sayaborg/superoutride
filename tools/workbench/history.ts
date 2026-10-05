/** The session's changes: each changed path's bytes, or null for a deleted file. */
export type Changes = ReadonlyMap<string, Uint8Array<ArrayBuffer> | null>;

/** At most this many steps are kept; the oldest go first. */
export const HISTORY_STEPS = 200;
/** At most this many bytes of distinct file versions are kept; the oldest steps go first. */
export const HISTORY_BYTES = 128 * 1024 * 1024;

interface Step {
  readonly changes: Changes;
  readonly label: string;
}

/**
 * The workbench's undo history: a list of states of the changes, one per edit, with a position. An edit after an undo
 * drops the steps ahead. Steps share unchanged bytes.
 */
export function createHistory() {
  let steps: Step[] = [{ changes: new Map(), label: 'Open' }],
    position = 0;
  const bytes = () => {
    const seen = new Set<ArrayBuffer>();
    let total = 0;
    for (const step of steps)
      for (const value of step.changes.values())
        if (value && !seen.has(value.buffer)) {
          seen.add(value.buffer);
          total += value.byteLength;
        }
    return total;
  };
  return {
    get changes(): Changes {
      return steps[position]!.changes;
    },
    get canUndo() {
      return position > 0;
    },
    get canRedo() {
      return position < steps.length - 1;
    },
    /** The labels of the step to undo and to redo. */
    get labels() {
      return { undo: position > 0 ? steps[position]!.label : null, redo: steps[position + 1]?.label ?? null };
    },
    /** One edit: the new state of the changes. */
    push(changes: Changes, label: string) {
      steps = [...steps.slice(0, position + 1), { changes, label }];
      position = steps.length - 1;
      while (steps.length > 1 && (steps.length > HISTORY_STEPS || bytes() > HISTORY_BYTES)) {
        steps.shift();
        position--;
      }
    },
    undo() {
      if (position > 0) position--;
    },
    redo() {
      if (position < steps.length - 1) position++;
    },
  };
}
