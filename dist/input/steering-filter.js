import { clampSteering } from './driving-input.js';
export const KEYBOARD_STEERING_PRESS_RATE = 4.0;
export const KEYBOARD_STEERING_RELEASE_RATE = 6.0;
export function moveToward(current, target, maxDelta) {
    if (current < target)
        return Math.min(current + maxDelta, target);
    if (current > target)
        return Math.max(current - maxDelta, target);
    return target;
}
export function stepKeyboardSteering(current, left, right, dt) {
    const target = left === right ? 0 : left ? -1 : 1;
    const rate = target === 0 ? KEYBOARD_STEERING_RELEASE_RATE : KEYBOARD_STEERING_PRESS_RATE;
    return clampSteering(moveToward(current, target, rate * Math.max(0, dt)));
}
