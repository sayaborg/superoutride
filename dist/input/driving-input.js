export function clampSteering(value) {
    return Math.max(-1, Math.min(1, value));
}
export const ZERO_DRIVING_INPUT = Object.freeze({
    steering: 0,
    throttle: false,
    brake: false,
});
