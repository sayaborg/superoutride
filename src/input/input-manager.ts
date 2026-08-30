import {
  assertExclusivePedalInput,
  clampSteering,
  type DrivingInput,
  type PedalInput,
} from './driving-input.js';
import { KeyboardInput } from './keyboard-input.js';
import { PedalInputArbiter } from './pedal-input-arbiter.js';
import { TouchInput } from './touch-input.js';

export function mergeDrivingInput(
  keyboard: DrivingInput,
  touch: DrivingInput,
  touchSteeringActive: boolean,
  pedals: PedalInput,
): DrivingInput {
  assertExclusivePedalInput(pedals);
  return {
    steering: clampSteering(touchSteeringActive ? touch.steering : keyboard.steering),
    throttle: pedals.throttle,
    brake: pedals.brake,
  };
}

export class InputManager {
  private readonly keyboard: KeyboardInput;
  private readonly touch: TouchInput;
  private readonly pedals = new PedalInputArbiter();

  constructor(
    steerLeftButton: HTMLElement,
    steerRightButton: HTMLElement,
    throttleButton: HTMLElement,
    brakeButton: HTMLElement,
  ) {
    this.keyboard = new KeyboardInput(window, document, this.pedals);
    this.touch = new TouchInput(
      steerLeftButton,
      steerRightButton,
      throttleButton,
      brakeButton,
      window,
      document,
      this.pedals,
    );
  }

  update(dt: number): void {
    this.keyboard.update(dt);
  }

  sample(): DrivingInput {
    const keyboard = this.keyboard.sample();
    const touch = this.touch.sample();

    return mergeDrivingInput(
      keyboard,
      touch,
      this.touch.steeringActive,
      this.pedals.sample(),
    );
  }
}
