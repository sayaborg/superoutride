import { clampSteering } from './driving-input.js';
export function steeringFromPointerX(clientX, left, width) {
    if (width <= 0)
        return 0;
    const normalized = (clientX - left) / width;
    return clampSteering(normalized * 2 - 1);
}
export class TouchInput {
    steeringPad;
    steering = 0;
    steeringPointer = null;
    throttlePointers = new Set();
    brakePointers = new Set();
    constructor(steeringPad, throttleButton, brakeButton) {
        this.steeringPad = steeringPad;
        this.bindSteering(steeringPad);
        this.bindMomentary(throttleButton, 'throttle');
        this.bindMomentary(brakeButton, 'brake');
    }
    get steeringActive() {
        return this.steeringPointer !== null;
    }
    sample() {
        return {
            steering: this.steering,
            throttle: this.throttlePointers.size > 0,
            brake: this.brakePointers.size > 0,
        };
    }
    bindSteering(element) {
        element.addEventListener('pointerdown', (event) => {
            if (this.steeringPointer !== null)
                return;
            this.steeringPointer = event.pointerId;
            element.setPointerCapture(event.pointerId);
            this.updateSteeringFromPointer(event);
            event.preventDefault();
        });
        element.addEventListener('pointermove', (event) => {
            if (event.pointerId !== this.steeringPointer)
                return;
            this.updateSteeringFromPointer(event);
            event.preventDefault();
        });
        const release = (event) => {
            if (event.pointerId !== this.steeringPointer)
                return;
            this.steeringPointer = null;
            this.steering = 0;
            event.preventDefault();
        };
        element.addEventListener('pointerup', release);
        element.addEventListener('pointercancel', release);
        element.addEventListener('lostpointercapture', (event) => {
            if (event.pointerId === this.steeringPointer) {
                this.steeringPointer = null;
                this.steering = 0;
            }
        });
    }
    updateSteeringFromPointer(event) {
        const rect = this.steeringPad.getBoundingClientRect();
        this.steering = steeringFromPointerX(event.clientX, rect.left, rect.width);
    }
    bindMomentary(element, key) {
        const pointers = key === 'throttle' ? this.throttlePointers : this.brakePointers;
        element.addEventListener('pointerdown', (event) => {
            pointers.add(event.pointerId);
            element.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        const release = (event) => {
            pointers.delete(event.pointerId);
            event.preventDefault();
        };
        element.addEventListener('pointerup', release);
        element.addEventListener('pointercancel', release);
        element.addEventListener('lostpointercapture', (event) => {
            pointers.delete(event.pointerId);
        });
    }
}
