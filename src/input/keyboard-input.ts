import type { DrivingInput } from '../vehicle/driving-input.js';
import { PedalInputArbiter, type PedalChannel } from './pedal-input-arbiter.js';
import { SteeringInputArbiter, type SteeringDirection } from './steering-input-arbiter.js';

/** Driving aliases owned by the input adapter; browser product shortcuts are composed above it. */
const DRIVING_KEYS = Object.freeze({
  left: 'ArrowLeft',
  right: 'ArrowRight',
  throttle: 'ArrowUp',
  throttleAlias: 'KeyX',
  brake: 'ArrowDown',
  brakeAlias: 'KeyZ',
});

export class KeyboardInput {
  private suspended = false;
  constructor(
    target: Window = window,
    visibilityDocument: Document = document,
    private readonly pedals = new PedalInputArbiter(),
    private readonly steering = new SteeringInputArbiter(),
  ) {
    target.addEventListener('keydown', (event) => this.onKey(event, true), { passive: false });
    target.addEventListener('keyup', (event) => this.onKey(event, false), { passive: false });
    target.addEventListener('blur', () => this.reset());
    target.addEventListener('pagehide', () => this.reset());
    visibilityDocument.addEventListener('visibilitychange', () => {
      if (visibilityDocument.visibilityState === 'hidden') this.reset();
    });
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (suspended) this.reset();
  }

  sample(): DrivingInput {
    const pedals = this.pedals.sample();
    return {
      steering: this.steering.sample(),
      ...pedals,
    };
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    if (this.suspended || (down && event.repeat)) return;
    switch (event.code) {
      case DRIVING_KEYS.left:
      case DRIVING_KEYS.right:
        this.setSteering(event, down);
        event.preventDefault();
        break;
      case DRIVING_KEYS.throttle:
      case DRIVING_KEYS.throttleAlias:
        this.setPedal(event.code, 'throttle', down);
        event.preventDefault();
        break;
      case DRIVING_KEYS.brake:
      case DRIVING_KEYS.brakeAlias:
        this.setPedal(event.code, 'brake', down);
        event.preventDefault();
        break;
    }
  }

  private setSteering(event: KeyboardEvent, down: boolean): void {
    const owner = `keyboard:${event.code}`;
    if (!down) {
      this.steering.release(owner);
      return;
    }
    if (event.repeat) return;
    const direction: SteeringDirection = event.code === DRIVING_KEYS.left ? -1 : 1;
    this.steering.press(owner, direction);
  }

  private setPedal(code: string, pedal: PedalChannel, down: boolean): void {
    this.pedals.setOwner(`keyboard:${code}`, pedal, down);
  }

  private reset(): void {
    this.steering.reset();
    this.pedals.reset();
  }
}
