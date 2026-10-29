/**
 * The one shape of an edit in progress, for fields and drags alike: until the author confirms, the pending value is the
 * screen's alone (shown, never stored); confirming commits it once, which a module turns into one `replace`, one step
 * of the history; cancelling drops it. Modules hold no other in-progress state.
 */

/**
 * A field confirmed with Enter or by leaving it. Its text is the pending value; a text `parse` rejects (null) stays in
 * the field, marked invalid, and commits nothing.
 */
export function confirmField<T>(
  input: HTMLInputElement | HTMLSelectElement,
  parse: (text: string) => T | null,
  commit: (value: T) => void,
) {
  input.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') input.blur();
  });
  input.addEventListener('change', () => {
    const value = parse(input.value);
    input.classList.toggle('invalid', value === null);
    if (value !== null) commit(value);
  });
}

/** A number field's text as a finite number, else null. */
export const finiteNumber = (text: string) =>
  text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : null;

/**
 * A pointer drag on `target`: `start` makes the pending value from the press (null ignores it), `move` the next from
 * each movement, `show` draws it (null when the drag ends), and the release commits it once. Escape or a cancelled
 * pointer drops it.
 */
export function pointerDrag<T>(
  target: HTMLElement,
  drag: {
    start(event: PointerEvent): T | null;
    move(pending: T, event: PointerEvent): T;
    show(pending: T | null): void;
    commit(pending: T): void;
  },
) {
  let pending: T | null = null;
  const end = (commit: boolean) => {
    const value = pending;
    pending = null;
    drag.show(null);
    if (commit && value !== null) drag.commit(value);
  };
  target.addEventListener('pointerdown', (event) => {
    pending = drag.start(event);
    if (pending === null) return;
    target.setPointerCapture(event.pointerId);
    drag.show(pending);
  });
  target.addEventListener('pointermove', (event) => {
    if (pending === null) return;
    pending = drag.move(pending, event);
    drag.show(pending);
  });
  target.addEventListener('pointerup', () => end(true));
  target.addEventListener('pointercancel', () => end(false));
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pending !== null) end(false);
  });
}
