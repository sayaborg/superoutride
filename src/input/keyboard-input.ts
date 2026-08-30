import type { DrivingInput } from './driving-input.js';

export function digitalKeyboardSteering(left: boolean, right: boolean): -1 | 0 | 1 {
  return left === right ? 0 : left ? -1 : 1;
}

export class KeyboardInput {
  private left = false;
  private right = false;
  private throttle = false;
  private brake = false;

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
      steering: digitalKeyboardSteering(this.left, this.right),
      throttle: this.throttle,
      brake: this.brake,
    };
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    let handled = true;
    switch (event.code) {
      case 'ArrowLeft':
        this.left = down;
        break;
      case 'ArrowRight':
        this.right = down;
        break;
      case 'ArrowUp':
        this.throttle = down;
        break;
      case 'ArrowDown':
        this.brake = down;
        break;
      default:
        handled = false;
    }

    if (handled) event.preventDefault();
  }

  private reset(): void {
    this.left = false;
    this.right = false;
    this.throttle = false;
    this.brake = false;
  }
}
