import type { FrameLoop } from './frame-loop.js';

interface ReadyFrame {
  release(): void;
}
type ReadyFrameState = 'idle' | 'loading' | 'ready' | 'failed' | 'disposed';

/** Stop the common scheduler while replacing a pinned frame. No rollback, catch-up or partial presentation. */
export class ReadyFrameController<T extends ReadyFrame> {
  readonly #loop: FrameLoop;
  readonly #present: (frame: T) => void;
  readonly #suspend: (suspended: boolean) => void;
  #state: ReadyFrameState = 'idle';
  #error: unknown = null;
  #current: T | null = null;
  #pending: AbortController | null = null;
  #load: ((signal: AbortSignal) => Promise<T>) | null = null;

  constructor(loop: FrameLoop, present: (frame: T) => void, suspend: (suspended: boolean) => void) {
    this.#loop = loop;
    this.#present = present;
    this.#suspend = suspend;
  }

  get state(): ReadyFrameState {
    return this.#state;
  }
  get error(): unknown {
    return this.#error;
  }

  async replace(load: (signal: AbortSignal) => Promise<T>): Promise<boolean> {
    if (this.#state === 'disposed') throw new Error('ready-frame controller is disposed');
    this.#loop.stop();
    this.#suspend(true);
    this.#pending?.abort();
    const request = new AbortController();
    this.#pending = request;
    this.#load = load;
    this.#state = 'loading';
    this.#error = null;
    let incoming: T | null = null;
    try {
      incoming = await load(request.signal);
      if (request.signal.aborted) {
        incoming.release();
        return false;
      }
      this.#present(incoming);
      if (request.signal.aborted) {
        incoming.release();
        return false;
      }
      const previous = this.#current;
      this.#current = incoming;
      incoming = null;
      previous?.release();
      if (request.signal.aborted) return false;
      this.#state = 'ready';
      this.#suspend(false);
      if (request.signal.aborted) return false;
      this.#pending = null;
      this.#loop.start();
      return true;
    } catch (error) {
      incoming?.release();
      if (request.signal.aborted) return false;
      this.#pending = null;
      this.#error = error;
      this.#state = 'failed';
      return false;
    }
  }

  retry(): Promise<boolean> {
    if (this.#state !== 'failed' || !this.#load) throw new Error('no failed ready-frame request to retry');
    return this.replace(this.#load);
  }

  dispose(): void {
    if (this.#state === 'disposed') return;
    this.#loop.stop();
    this.#suspend(true);
    this.#pending?.abort();
    this.#pending = null;
    this.#current?.release();
    this.#current = null;
    this.#load = null;
    this.#state = 'disposed';
  }
}
