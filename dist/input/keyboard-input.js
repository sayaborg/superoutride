import { stepKeyboardSteering } from './steering-filter.js';
export class KeyboardInput {
    left = false;
    right = false;
    throttle = false;
    brake = false;
    steering = 0;
    constructor(target = window) {
        target.addEventListener('keydown', (event) => this.onKey(event, true), { passive: false });
        target.addEventListener('keyup', (event) => this.onKey(event, false), { passive: false });
        target.addEventListener('blur', () => this.reset());
    }
    update(dt) {
        this.steering = stepKeyboardSteering(this.steering, this.left, this.right, dt);
    }
    sample() {
        return {
            steering: this.steering,
            throttle: this.throttle,
            brake: this.brake,
        };
    }
    onKey(event, down) {
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
        if (handled)
            event.preventDefault();
    }
    reset() {
        this.left = false;
        this.right = false;
        this.throttle = false;
        this.brake = false;
        this.steering = 0;
    }
}
