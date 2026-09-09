import { clamp } from '../core/math.js';
import type { BodyKinematics, ContactObservation } from './vehicle-dynamics.js';
import type { CompiledTireCharacteristics } from './tire-friction-calibration.js';
import { cross3, dot3, scale3, sub3 } from './vehicle-math3.js';

/** Stateless input reduction. Automatic alignment is an immutable baseline, not a target to optimize. */
export function limitSteeringInput(
  automatic: number, requestedOffset: number, mechanicalMax: number,
  body: BodyKinematics, contact: ContactObservation, tire: CompiledTireCharacteristics,
): number {
  if (requestedOffset === 0 || !contact.forceTransmitting || !contact.tireFrameValid
    || !(contact.surface.material.gripFactor > 0)) return requestedOffset;
  const n = contact.surface.normal;
  // The projection from the body steering plane must have a valid inverse on the contact plane.
  if (!(dot3(body.up, n) > 1e-8)) return requestedOffset;
  const a = sub3(body.forward, scale3(n, dot3(body.forward, n)));
  const b = sub3(body.right, scale3(n, dot3(body.right, n)));
  const v = contact.reachVelocity, v0 = contact.profile.tire.lowSpeedRegularization;
  const ax = dot3(v, a), bx = dot3(v, b);
  const ay = dot3(v, cross3(n, a)), by = dot3(v, cross3(n, b));
  const aa = dot3(a, a), ab = dot3(a, b), bb = dot3(b, b);
  const ca = Math.cos(automatic), sa = Math.sin(automatic);
  const baseX = ax * ca + bx * sa, baseY = ay * ca + by * sa;
  const baseNorm2 = aa * ca * ca + 2 * ab * ca * sa + bb * sa * sa;
  const baseSlip = Math.abs(baseY) / Math.sqrt(baseX * baseX + v0 * v0 * baseNorm2);
  // Pure-lateral capacity-onset budget: m*PY. Never shrinks to zero merely because a wheel locks.
  // If alignment itself exceeds it, input may not worsen that baseline's absolute slip.
  const slip = Math.max(baseSlip,
    contact.surface.material.gripFactor * (2 - tire.rhoKnee) * tire.muY / tire.kY);
  const s2 = slip * slip, z = v0 * v0;
  const A = ay * ay - s2 * (ax * ax + z * aa);
  const B = by * by - s2 * (bx * bx + z * bb);
  const C = ay * by - s2 * (ax * bx + z * ab);
  // q(delta) = c0 + cc*cos(2delta) + cs*sin(2delta) <= 0.
  // Normalization avoids a speed-dependent numerical threshold.
  const scale = Math.max(Math.abs(A), Math.abs(B), Math.abs(C));
  if (scale === 0) return requestedOffset;
  const c0 = (A / scale + B / scale) / 2;
  const cc = (A / scale - B / scale) / 2, cs = C / scale;
  const radius = Math.hypot(cc, cs);
  if (c0 + radius <= 1e-14 || radius === 0) return requestedOffset;
  const phase = Math.atan2(cs, cc), arc = Math.acos(clamp(-c0 / radius, -1, 1));
  let low = -mechanicalMax, high = mechanicalMax;
  // Two root families; only these three periods can meet (-pi/2,pi/2).
  for (const sign of [-1, 1]) {
    const root = (phase + sign * arc) / 2;
    const slope = -sign * Math.sin(arc);
    if (Math.abs(slope) < 1e-14) continue; // Tangency does not leave the feasible component.
    for (let period = -1; period <= 1; period += 1) {
      const r = root + period * Math.PI;
      if (slope > 0 && r >= automatic - 1e-12) high = Math.min(high, Math.max(automatic, r));
      if (slope < 0 && r <= automatic + 1e-12) low = Math.max(low, Math.min(automatic, r));
    }
  }
  const target = clamp(automatic + requestedOffset, low, high);
  // Explicit one-sided reduction: never invent, reverse or amplify the driver's offset.
  return clamp(target - automatic, Math.min(0, requestedOffset), Math.max(0, requestedOffset));
}
