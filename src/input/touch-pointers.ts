/** One touch pointer event in client CSS px. */
export interface TouchPointer {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
}

/** A consumer of touch pointers: a press, its moves, and its release or cancellation. */
export interface TouchPointerListener {
  begin(pointer: TouchPointer): void;
  move(pointer: TouchPointer): void;
  end(pointerId: number): void;
}

/**
 * The page's one reader of touch pointers: it listens to the window's pointer events once and passes touch pointers to
 * its listeners. A press on an element marked `data-driving-input="ignore"` (UI-owned gestures such as scrolling,
 * sliders and the corner buttons) starts no pointer for any listener.
 */
export class TouchPointers {
  private readonly listeners: TouchPointerListener[] = [];

  constructor(target: Window) {
    target.addEventListener('pointerdown', (event) => this.begin(event), true);
    target.addEventListener('pointermove', (event) => this.move(event), true);
    target.addEventListener('pointerup', (event) => this.end(event), true);
    target.addEventListener('pointercancel', (event) => this.end(event), true);
  }

  subscribe(listener: TouchPointerListener): void {
    this.listeners.push(listener);
  }

  private begin(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    if (event.composedPath?.().some((target) => (target as Element).getAttribute?.('data-driving-input') === 'ignore'))
      return;
    const pointer = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    for (const listener of this.listeners) listener.begin(pointer);
  }

  private move(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    const pointer = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    for (const listener of this.listeners) listener.move(pointer);
  }

  private end(event: PointerEvent): void {
    for (const listener of this.listeners) listener.end(event.pointerId);
  }
}
