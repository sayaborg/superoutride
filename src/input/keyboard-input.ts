import type { DrivingInput } from './driving-input.js';
import { PedalInputArbiter, type PedalChannel } from './pedal-input-arbiter.js';

export function digitalKeyboardSteering(left: boolean, right: boolean): -1 | 0 | 1 {
  return left === right ? 0 : left ? -1 : 1;
}

export class KeyboardInput {
  private readonly pressedCodes = new Set<string>();

  constructor(
    target: Window = window,
    visibilityDocument: Document = document,
    private readonly pedals = new PedalInputArbiter(),
  ) {
    target.addEventListener('keydown', (event) => this.onKey(event, true), { passive: false });
    target.addEventListener('keyup', (event) => this.onKey(event, false), { passive: false });
    target.addEventListener('blur', () => this.reset());
    target.addEventListener('pagehide', () => this.reset());
    visibilityDocument.addEventListener('visibilitychange', () => {
      if (visibilityDocument.visibilityState === 'hidden') this.reset();
    });
  }

  update(_dt: number): void {
    // Input devices publish digital intent. Vehicle control owns actuator travel over time.
  }

  sample(): DrivingInput {
    const pedals = this.pedals.sample();
    return {
      steering: digitalKeyboardSteering(
        this.pressedCodes.has('ArrowLeft'),
        this.pressedCodes.has('ArrowRight'),
      ),
      ...pedals,
    };
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    switch (event.code) {
      case 'ArrowLeft':
      case 'ArrowRight':
        if (down) this.pressedCodes.add(event.code);
        else this.pressedCodes.delete(event.code);
        event.preventDefault();
        break;
      case 'ArrowUp':
      case 'KeyX':
        this.setPedal(event.code, 'throttle', down);
        event.preventDefault();
        break;
      case 'ArrowDown':
      case 'KeyZ':
        this.setPedal(event.code, 'brake', down);
        event.preventDefault();
        break;
    }
  }

  private setPedal(code: string, pedal: PedalChannel, down: boolean): void {
    this.pedals.setSource(`keyboard:${code}`, pedal, down);
  }

  private reset(): void {
    this.pressedCodes.clear();
    this.pedals.reset();
  }
}
