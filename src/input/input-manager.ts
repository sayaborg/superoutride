import type { DrivingInput } from './driving-input.js';
import { KeyboardInput } from './keyboard-input.js';
import { PedalInputArbiter } from './pedal-input-arbiter.js';
import { SteeringInputArbiter } from './steering-input-arbiter.js';
import { TouchInput } from './touch-input.js';

export class InputManager {
  private readonly keyboard: KeyboardInput;
  private readonly touch: TouchInput;
  private readonly pedals = new PedalInputArbiter();
  private readonly steering = new SteeringInputArbiter();

  constructor(
    steerLeftButton: HTMLElement,
    steerRightButton: HTMLElement,
    throttleButton: HTMLElement,
    brakeButton: HTMLElement,
  ) {
    this.keyboard = new KeyboardInput(window, document, this.pedals, this.steering);
    this.touch = new TouchInput(
      steerLeftButton,
      steerRightButton,
      throttleButton,
      brakeButton,
      window,
      document,
      this.pedals,
      this.steering,
    );
  }

  update(dt: number): void {
    this.keyboard.update(dt);
  }

  sample(): DrivingInput {
    return this.touch.sample();
  }
}
