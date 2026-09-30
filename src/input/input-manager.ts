import type { DrivingInput } from '../vehicle/driving-input.js';
import type { DrivingInputPublisher } from './driving-input-publisher.js';
import { GamepadInput } from './gamepad-input.js';
import { KeyboardInput } from './keyboard-input.js';
import { PedalInputArbiter } from './pedal-input-arbiter.js';
import { SteeringInputArbiter } from './steering-input-arbiter.js';
import { TouchInput, type TouchArea, type TouchObservation } from './touch-input.js';

const NEUTRAL_DRIVING_INPUT: Readonly<DrivingInput> = Object.freeze({
  steering: 0,
  throttle: false,
  brake: false,
  steeringApplyMethod: 'RATE_LIMITED',
  pedalApplyMethod: 'RATE_LIMITED',
});

/**
 * The one driving-input authority: it owns the steering and pedal arbiters, suspension, the lifecycle
 * resets and the final sample. Adapters publish through it and keep only their local held state.
 */
export class InputManager {
  private readonly pedals = new PedalInputArbiter();
  private readonly steering = new SteeringInputArbiter();
  private readonly touchInput: TouchInput;
  private readonly gamepadInput: GamepadInput;
  private suspended = false;
  private last: Readonly<DrivingInput> = NEUTRAL_DRIVING_INPUT;

  constructor(target: Window, visibilityDocument: Document, touchArea: () => TouchArea) {
    const publisher: DrivingInputPublisher = {
      setSteering: (owner, value) => this.accept(() => this.steering.set(owner, value)),
      releaseSteering: (owner) => this.accept(() => this.steering.release(owner)),
      setPedal: (owner, pedal, request) => this.accept(() => this.pedals.set(owner, pedal, request)),
      releasePedal: (owner) => this.accept(() => this.pedals.release(owner)),
    };
    new KeyboardInput(target, publisher);
    this.touchInput = new TouchInput(target, publisher, touchArea);
    this.gamepadInput = new GamepadInput(target, publisher);
    target.addEventListener('blur', () => this.reset());
    target.addEventListener('pagehide', () => this.reset());
    visibilityDocument.addEventListener('visibilitychange', () => {
      if (visibilityDocument.visibilityState === 'hidden') this.reset();
    });
  }

  /** The latest final sample; neutral after a reset. */
  get lastSample(): Readonly<DrivingInput> {
    return this.last;
  }

  /** The touch pointers' observation for the shell's indicators. */
  get touch(): TouchObservation {
    return this.touchInput.observation;
  }

  /** Suspension resets every input and rejects publications until resumed. */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (suspended) this.reset();
  }

  /**
   * Poll the gamepads, then build one final sample from the arbiters; each apply method is the winning
   * owner's, else RATE_LIMITED.
   */
  sample(): Readonly<DrivingInput> {
    this.gamepadInput.poll();
    const pedals = this.pedals.sample();
    this.last = Object.freeze({
      steering: this.steering.sample(),
      throttle: pedals.throttle,
      brake: pedals.brake,
      steeringApplyMethod: this.steering.activeOwner()?.applyMethod ?? 'RATE_LIMITED',
      pedalApplyMethod: this.pedals.activeOwner()?.applyMethod ?? 'RATE_LIMITED',
    });
    return this.last;
  }

  private accept(publish: () => void): boolean {
    if (this.suspended) return false;
    publish();
    return true;
  }

  private reset(): void {
    this.steering.reset();
    this.pedals.reset();
    this.touchInput.reset();
    this.gamepadInput.reset();
    this.last = NEUTRAL_DRIVING_INPUT;
  }
}
