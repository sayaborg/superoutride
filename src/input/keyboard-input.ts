import type { DrivingInput } from './driving-input.js';

export function digitalKeyboardSteering(left: boolean, right: boolean): -1 | 0 | 1 {
  return left === right ? 0 : left ? -1 : 1;
}

export class KeyboardInput {
  private readonly pressedCodes = new Set<string>();

  constructor(target: Window = window, visibilityDocument: Document = document) {
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
    return {
      steering: digitalKeyboardSteering(
        this.pressedCodes.has('ArrowLeft'),
        this.pressedCodes.has('ArrowRight'),
      ),
      throttle: this.pressedCodes.has('ArrowUp') || this.pressedCodes.has('KeyX'),
      brake: this.pressedCodes.has('ArrowDown') || this.pressedCodes.has('KeyZ'),
    };
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    switch (event.code) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
      case 'KeyX':
      case 'KeyZ':
        if (down) this.pressedCodes.add(event.code);
        else this.pressedCodes.delete(event.code);
        event.preventDefault();
        break;
    }
  }

  private reset(): void {
    this.pressedCodes.clear();
  }
}
