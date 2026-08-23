import { clampSteering } from './driving-input.js';
import { KeyboardInput } from './keyboard-input.js';
import { TouchInput } from './touch-input.js';
export function mergeDrivingInput(keyboard, touch, touchSteeringActive) {
    return {
        steering: clampSteering(touchSteeringActive ? touch.steering : keyboard.steering),
        throttle: keyboard.throttle || touch.throttle,
        brake: keyboard.brake || touch.brake,
    };
}
export class InputManager {
    keyboard;
    touch;
    constructor(steeringPad, throttleButton, brakeButton) {
        this.keyboard = new KeyboardInput();
        this.touch = new TouchInput(steeringPad, throttleButton, brakeButton);
    }
    update(dt) {
        this.keyboard.update(dt);
    }
    sample() {
        const keyboard = this.keyboard.sample();
        const touch = this.touch.sample();
        return mergeDrivingInput(keyboard, touch, this.touch.steeringActive);
    }
}
