import { clamp } from '../core/math.js';
import type { BodyKinematics, ContactObservation } from './vehicle-dynamics.js';
import type { CompiledTireCharacteristics } from './tire-friction-calibration.js';
import { cross3, dot3, scale3, sub3 } from './vehicle-math3.js';

/** Stateless input reduction. Automatic alignment is an immutable baseline, not a target to optimize. */
export function limitSteeringInput(
  automatic: number, requestedOffset: number,
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
  // One fixed pure-lateral onset. Automatic steering never raises this budget.
  const slip = contact.surface.material.gripFactor * (2 - tire.rhoKnee) * tire.muY / tire.kY;
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
  if (radius === 0) return requestedOffset;
  const cos2 = ca * ca - sa * sa, sin2 = 2 * ca * sa;
  const value = c0 + cc * cos2 + cs * sin2;
  const slope = -2 * cc * sin2 + 2 * cs * cos2;
  // q(b+e) <= Q(e) = value + slope*e + 2*radius*e^2, since |q''| <= 4*radius.
  // Minimize positive excess max(0,Q): its minimizers are an interval, or its vertex.
  const center = -slope / (4 * radius);
  const width = Math.sqrt(Math.max(0, center * center - value / (2 * radius)));
  // Include zero so an already-outside baseline permits partial correction without inventing input.
  return clamp(requestedOffset, Math.min(0, center - width), Math.max(0, center + width));
}
