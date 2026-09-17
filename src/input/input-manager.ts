import type { DrivingInput } from './driving-input.js';
import { KeyboardInput } from './keyboard-input.js';
import { PedalInputArbiter } from './pedal-input-arbiter.js';
import { SteeringInputArbiter } from './steering-input-arbiter.js';
import { TouchInput } from './touch-input.js';

export class InputManager {
  private readonly touch: TouchInput;
  private readonly pedals = new PedalInputArbiter();
  private readonly steering = new SteeringInputArbiter();

  constructor() {
    new KeyboardInput(window, document, this.pedals, this.steering);
    this.touch = new TouchInput(window, document, this.pedals, this.steering);
  }

  sample(): DrivingInput {
    return this.touch.sample();
  }
}
