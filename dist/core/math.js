export const TAU = Math.PI * 2;
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
export function wrapPositive(value, period) {
    if (!(period > 0))
        throw new RangeError('period must be > 0');
    const wrapped = value % period;
    return wrapped < 0 ? wrapped + period : wrapped;
}
// Core §5: normalize to (-period/2, +period/2].
export function wrapSigned(delta, period) {
    if (!(period > 0))
        throw new RangeError('period must be > 0');
    const half = period * 0.5;
    let wrapped = wrapPositive(delta + half, period) - half;
    if (wrapped <= -half)
        wrapped = half;
    return wrapped;
}
export function wrapAngle(angle) {
    return wrapSigned(angle, TAU);
}
export function tangentFromHeading(heading) {
    return { x: Math.sin(heading), z: Math.cos(heading) };
}
export function normalFromHeading(heading) {
    return { x: Math.cos(heading), z: -Math.sin(heading) };
}
export function headingFromDelta(dx, dz) {
    return Math.atan2(dx, dz);
}
export function dot(a, b) {
    return a.x * b.x + a.z * b.z;
}
export function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz;
}
export function add(a, b) {
    return { x: a.x + b.x, z: a.z + b.z };
}
export function subtract(a, b) {
    return { x: a.x - b.x, z: a.z - b.z };
}
export function scale(v, scalar) {
    return { x: v.x * scalar, z: v.z * scalar };
}
