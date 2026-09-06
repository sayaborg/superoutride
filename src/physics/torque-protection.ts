import { deriveTireSlip, solveWheelOmega, wheelRequiredNetTorque, validateWheelSolveInput,
  type WheelSolveInput, type WheelSolveResult } from './tire-wheel.js';
import { VEHICLE_GRAVITY, type BodyKinematics, type ContactObservation } from './vehicle-dynamics.js';
import type { CompiledArcadeVehicleProfile } from './vehicle-profiles.js';
import { evaluateVehicleWrench, type VehicleWrench } from './vehicle-wrench.js';
import { WORLD_UP, add3, cross3, dot3, scale3, sub3 } from './vehicle-math3.js';

/** Composition policy, not controller memory and not a tire coefficient. */
export interface TorqueProtectionPolicy {
  readonly wheelSlip: boolean;
  /** Fraction of static suspension compression reserved against pitch-induced separation. */
  readonly supportReserve: number | null;
}
export const UNPROTECTED_TORQUE_POLICY: Readonly<TorqueProtectionPolicy> =
  Object.freeze({ wheelSlip: false, supportReserve: null });
export const ROAD_TORQUE_POLICY: Readonly<TorqueProtectionPolicy> =
  Object.freeze({ wheelSlip: true, supportReserve: null });
export const TWO_WHEEL_TORQUE_POLICY: Readonly<TorqueProtectionPolicy> =
  Object.freeze({ wheelSlip: true, supportReserve: 0.08 });

export function resolveTorqueProtectionPolicy(policy: TorqueProtectionPolicy): Readonly<TorqueProtectionPolicy> {
  if (typeof policy.wheelSlip !== 'boolean' || (policy.supportReserve !== null
    && (!Number.isFinite(policy.supportReserve) || policy.supportReserve <= 0 || policy.supportReserve >= 1))) {
    throw new RangeError('torque policy needs boolean wheelSlip and null or (0,1) support reserve');
  }
  return Object.freeze({ wheelSlip: policy.wheelSlip, supportReserve: policy.supportReserve });
}

/** Independent station torque projection. No force cap, Omega clamp, feedback gain or redistribution.
 * P is an explicitly selected control boundary (not a claim of a universal optimal slip).
 * Below tire v0 ABS leaves the ordinary signed brake atom responsible for stopping/holding.
 */
export function limitWheelTorques(input: WheelSolveInput): WheelSolveInput {
  validateWheelSolveInput(input);
  let drive = input.driveTorque, brake = input.brakeTorque;
  if (!(drive >= 0) || !(brake >= 0) || !Number.isFinite(drive + brake)) {
    throw new RangeError('protected requested torques must be finite nonnegative magnitudes');
  }
  if (!(input.normalLoad > 0) || !(input.gripFactor > 0)) return input;
  const tire = input.characteristics ?? input.tire;
  const { referenceSpeed } = deriveTireSlip(input.omegaPrevious, input.rollingRadius,
    input.longitudinalVelocity, input.lateralVelocity, input.tire.lowSpeedRegularization);
  const slip = input.gripFactor * (2 - tire.rhoKnee) * tire.muX / tire.kX;
  const vx = input.longitudinalVelocity, radius = input.rollingRadius;
  if (vx >= 0) {
    const upper = (vx + slip * referenceSpeed) / radius;
    const torqueUpper = wheelRequiredNetTorque(input, upper);
    drive = Math.max(0, Math.min(drive, torqueUpper + brake));
  }
  if (Math.abs(vx) > input.tire.lowSpeedRegularization) {
    const minimumRolling = (Math.abs(vx) - slip * referenceSpeed) / radius;
    if (minimumRolling > 0) {
      const direction = Math.sign(vx);
      const boundary = wheelRequiredNetTorque(input, direction * minimumRolling);
      brake = Math.max(0, Math.min(brake, direction * (drive - boundary)));
    }
  }
  // If brake release changed the upper net-torque bound, reapply TCS. This can only reduce drive.
  if (vx >= 0 && drive > 0) {
    const upper = (vx + slip * referenceSpeed) / radius;
    drive = Math.max(0, Math.min(drive, wheelRequiredNetTorque(input, upper) + brake));
  }
  return { ...input, driveTorque: drive, brakeTorque: brake };
}

export interface ProtectedWheelPair {
  readonly frontInput: WheelSolveInput;
  readonly rearInput: WheelSolveInput;
  readonly frontWheel: WheelSolveResult;
  readonly rearWheel: WheelSolveResult;
  readonly wrench: VehicleWrench;
  readonly supportScale: number;
  readonly supportFeasible: boolean;
}

/** Local tangent-plane compression barrier using the SAME wrench as the physical update.
 * q'' + 2*w*q' + w*w*(q-reserve*qStatic) >= 0, w from the existing suspension frequency.
 * No synthetic normal load; gravity, wheel reaction and current angular motion are retained.
 */
export function supportCompressionMargin(profile: CompiledArcadeVehicleProfile, body: BodyKinematics,
  contact: ContactObservation, wrench: VehicleWrench, reserve: number): number {
  const yawRate = dot3(body.omegaWorld, WORLD_UP);
  const omegaRight = dot3(body.omegaWorld, body.right);
  const angularAcceleration = add3(add3(
    scale3(WORLD_UP, wrench.moment.y / profile.yawInertia),
    scale3(body.right, dot3(wrench.moment, body.right) / profile.pitchInertia)),
    scale3(cross3(WORLD_UP, body.right), yawRate * omegaRight));
  const offset = sub3(contact.reachPoint, body.position);
  const reachAcceleration = add3(scale3(wrench.force, 1 / profile.mass), add3(
    cross3(angularAcceleration, offset), cross3(body.omegaWorld, cross3(body.omegaWorld, offset))));
  const qAcceleration = -dot3(reachAcceleration, contact.surface.normal);
  const qVelocity = -dot3(contact.reachVelocity, contact.surface.normal);
  const qStatic = contact.profile.suspension.qStatic;
  const frequency = Math.sqrt(VEHICLE_GRAVITY / qStatic);
  return qAcceleration + 2 * frequency * qVelocity
    + frequency * frequency * (-contact.gap - reserve * qStatic);
}

/** One delivered-torque owner. The lower tire/wheel law never branches on vehicle identity. */
export function solveProtectedWheelPair(profile: CompiledArcadeVehicleProfile, body: BodyKinematics,
  front: ContactObservation, rear: ContactObservation, frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput, policy: TorqueProtectionPolicy): ProtectedWheelPair {
  const evaluate = (scale: number): ProtectedWheelPair => {
    const prepare = (input: WheelSolveInput) => {
      const request = scale === 1 ? input : { ...input,
        driveTorque: input.driveTorque * scale, brakeTorque: input.brakeTorque * scale };
      return policy.wheelSlip ? limitWheelTorques(request) : request;
    };
    const frontInput = prepare(frontRequest), rearInput = prepare(rearRequest);
    const frontWheel = solveWheelOmega(frontInput), rearWheel = solveWheelOmega(rearInput);
    return { frontInput, rearInput, frontWheel, rearWheel,
      wrench: evaluateVehicleWrench(profile, body, front, rear, frontWheel, rearWheel),
      supportScale: scale, supportFeasible: true };
  };
  const requested = evaluate(1);
  const reserve = policy.supportReserve;
  if (reserve === null) return requested;
  // No artificial attachment through a crest or VOID. A grounded opposite station is necessary.
  const checkFront = frontRequest.driveTorque + rearRequest.driveTorque > 0
    && front.supportAvailable && front.tireFrameValid && rear.normalLoad > 0
    && dot3(body.up, front.surface.normal) > 0;
  const checkRear = frontRequest.brakeTorque + rearRequest.brakeTorque > 0
    && rear.supportAvailable && rear.tireFrameValid && front.normalLoad > 0
    && dot3(body.up, rear.surface.normal) > 0;
  const safe = (value: ProtectedWheelPair) =>
    (!checkFront || supportCompressionMargin(profile, body, front, value.wrench, reserve) >= 0)
    && (!checkRear || supportCompressionMargin(profile, body, rear, value.wrench, reserve) >= 0);
  if (safe(requested)) return requested;
  let accepted = evaluate(0);
  if (!safe(accepted)) return { ...accepted, supportFeasible: false };
  // Bracket a feasible release-connected boundary; do NOT claim global monotonicity/optimality.
  let lower = 0, upper = 1;
  for (let i = 0; i < 12; i += 1) {
    const scale = (lower + upper) * 0.5;
    const candidate = evaluate(scale);
    if (safe(candidate)) { lower = scale; accepted = candidate; } else upper = scale;
  }
  return accepted;
}
