/** How a voice's worklet kept up with real time since its last report. */
export interface ProcessingReport {
  /** Render blocks processed. */
  readonly blocks: number;
  /** Blocks whose processing took longer than the audio they produced. */
  readonly overruns: number;
  /** The longest block's processing time, in whole milliseconds. */
  readonly maxMilliseconds: number;
}

/** A measuring worklet reports once per this many milliseconds of wall time. */
const REPORT_MILLISECONDS = 1000;

/**
 * DEV measurement inside a worklet processor: off until its voice sends `{ measure: true }`, then it times each render
 * block and posts a {@link ProcessingReport} about once a second. `Date.now()` is the only clock every worklet scope
 * has, so times are whole milliseconds and an overrun counts only when a block's measured time exceeds its duration.
 * Off, it reads no clock.
 */
export class ProcessingMeter {
  private measuring = false;
  private blocks = 0;
  private overruns = 0;
  private maxMilliseconds = 0;
  private reportAt = 0;

  constructor(
    private readonly port: MessagePort,
    private readonly sampleRate: number,
  ) {}

  /** Take a `{ measure }` message; true when the message was one. */
  receive(data: unknown): boolean {
    if (typeof data !== 'object' || data === null || !Object.hasOwn(data, 'measure')) return false;
    this.measuring = (data as { measure: unknown }).measure === true;
    this.blocks = this.overruns = this.maxMilliseconds = this.reportAt = 0;
    return true;
  }

  /** The block's start, or 0 when not measuring. */
  begin(): number {
    return this.measuring ? Date.now() : 0;
  }

  end(started: number, frames: number): void {
    if (!this.measuring) return;
    const now = Date.now(),
      milliseconds = now - started;
    this.blocks += 1;
    if (milliseconds > (frames / this.sampleRate) * 1000) this.overruns += 1;
    this.maxMilliseconds = Math.max(this.maxMilliseconds, milliseconds);
    if (now < this.reportAt) return;
    if (this.reportAt !== 0) {
      const report: ProcessingReport = {
        blocks: this.blocks,
        overruns: this.overruns,
        maxMilliseconds: this.maxMilliseconds,
      };
      this.port.postMessage(report);
    }
    this.blocks = this.overruns = this.maxMilliseconds = 0;
    this.reportAt = now + REPORT_MILLISECONDS;
  }
}
