import { clampSteering, type DrivingInput } from './driving-input.js';
import { KeyboardInput } from './keyboard-input.js';
import { TouchInput } from './touch-input.js';

export function mergeDrivingInput(
  keyboard: DrivingInput,
  touch: DrivingInput,
  touchSteeringActive: boolean,
): DrivingInput {
  return {
    steering: clampSteering(touchSteeringActive ? touch.steering : keyboard.steering),
    throttle: keyboard.throttle || touch.throttle,
    brake: keyboard.brake || touch.brake,
  };
}

export class InputManager {
  private readonly keyboard: KeyboardInput;
  private readonly touch: TouchInput;

  constructor(steeringPad: HTMLElement, throttleButton: HTMLElement, brakeButton: HTMLElement) {
    this.keyboard = new KeyboardInput();
    this.touch = new TouchInput(steeringPad, throttleButton, brakeButton);
  }

  update(dt: number): void {
    this.keyboard.update(dt);
  }

  sample(): DrivingInput {
    const keyboard = this.keyboard.sample();
    const touch = this.touch.sample();

    return mergeDrivingInput(keyboard, touch, this.touch.steeringActive);
  }
}
