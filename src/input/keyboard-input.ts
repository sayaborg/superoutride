import type { DrivingInput } from './driving-input.js';
import { stepKeyboardSteering } from './steering-filter.js';

export class KeyboardInput {
  private left = false;
  private right = false;
  private throttle = false;
  private brake = false;
  private steering = 0;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (event) => this.onKey(event, true), { passive: false });
    target.addEventListener('keyup', (event) => this.onKey(event, false), { passive: false });
    target.addEventListener('blur', () => this.reset());
  }

  update(dt: number): void {
    this.steering = stepKeyboardSteering(this.steering, this.left, this.right, dt);
  }

  sample(): DrivingInput {
    return {
      steering: this.steering,
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
    this.steering = 0;
  }
}
