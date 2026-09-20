import { hypot2 } from '../core/norm.js';
import { type Writable } from '../core/writable.js';
const SUPPORT_BISECTION_ITERATIONS = 12;

import {
  createTireForceScratch,
  createWheelSolveResult,
  solveWheelOmega,
  validateWheelSolveInput,
  wheelRequiredNetTorque,
  type WheelSolveInput,
  type WheelSolveResult,
} from './tire-wheel.js';
import { VEHICLE_GRAVITY, type BodyKinematics, type ContactObservation } from './vehicle-dynamics.js';
import { add3, cross3, dot3, scale3, sub3, WORLD_UP } from '../core/vector3.js';
import type { CompiledArcadeVehicleProfile } from './vehicle-profiles.js';
import { createWrenchWorkspace, evaluateVehicleWrench, type VehicleWrench } from './vehicle-wrench.js';

/** Composition policy, not controller memory and not a tire coefficient. */
export interface TorqueProtectionPolicy {
  readonly wheelSlip: boolean;
  /** Fraction of static suspension compression reserved against pitch-induced separation. */
  readonly supportReserve: number | null;
}
export const UNPROTECTED_TORQUE_POLICY: Readonly<TorqueProtectionPolicy> = Object.freeze({
  wheelSlip: false,
  supportReserve: null,
});
export const ROAD_TORQUE_POLICY: Readonly<TorqueProtectionPolicy> = Object.freeze({
  wheelSlip: true,
  supportReserve: null,
});
export const TWO_WHEEL_TORQUE_POLICY: Readonly<TorqueProtectionPolicy> = Object.freeze({
  wheelSlip: true,
  supportReserve: 0.08,
});

export function resolveTorqueProtectionPolicy(policy: TorqueProtectionPolicy): Readonly<TorqueProtectionPolicy> {
  if (
    typeof policy.wheelSlip !== 'boolean' ||
    (policy.supportReserve !== null &&
      (!Number.isFinite(policy.supportReserve) || policy.supportReserve <= 0 || policy.supportReserve >= 1))
  ) {
    throw new RangeError('torque policy needs boolean wheelSlip and null or (0,1) support reserve');
  }
  return Object.freeze({ wheelSlip: policy.wheelSlip, supportReserve: policy.supportReserve });
}

/** Independent station torque projection. No force cap, Omega clamp, feedback gain or redistribution.
 * P is an explicitly selected control boundary (not a claim of a universal optimal slip).
 * Below tire v0 ABS leaves the ordinary signed brake atom responsible for stopping/holding.
 */
export function limitWheelTorques(
  input: WheelSolveInput,
  out: Writable<WheelSolveInput>,
  scratch: ReturnType<typeof createTireForceScratch>,
  residual: Float64Array,
): WheelSolveInput {
  validateWheelSolveInput(input);
  let drive = input.driveTorque,
    brake = input.brakeTorque;
  if (!(drive >= 0) || !(brake >= 0) || !Number.isFinite(drive + brake)) {
    throw new RangeError('protected requested torques must be finite nonnegative magnitudes');
  }
  if (!(input.normalLoad > 0) || !(input.gripFactor > 0)) return input;
  const tire = input.characteristics ?? input.tire;
  const referenceSpeed = hypot2(input.longitudinalVelocity, input.tire.lowSpeedRegularization);
  const slip = (input.gripFactor * (2 - tire.rhoKnee) * tire.muX) / tire.kX;
  const vx = input.longitudinalVelocity,
    radius = input.rollingRadius;
  let torqueUpper = 0;
  if (vx >= 0) {
    const upper = (vx + slip * referenceSpeed) / radius;
    torqueUpper = wheelRequiredNetTorque(input, upper, scratch, residual);
    drive = Math.max(0, Math.min(drive, torqueUpper + brake));
  }
  if (Math.abs(vx) > input.tire.lowSpeedRegularization) {
    const minimumRolling = (Math.abs(vx) - slip * referenceSpeed) / radius;
    if (minimumRolling > 0) {
      const direction = Math.sign(vx);
      const boundary = wheelRequiredNetTorque(input, direction * minimumRolling, scratch, residual);
      brake = Math.max(0, Math.min(brake, direction * (drive - boundary)));
    }
  }
  // If brake release changed the upper net-torque bound, reapply TCS. This can only reduce drive.
  if (vx >= 0 && drive > 0) {
    drive = Math.max(0, Math.min(drive, torqueUpper + brake));
  }
  if (drive === input.driveTorque && brake === input.brakeTorque) return input;
  const result = out;
  if (result !== input) Object.assign(result, input);
  result.driveTorque = drive;
  result.brakeTorque = brake;
  return result;
}

interface ProtectedWheelPair {
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
export function supportCompressionMargin(
  profile: CompiledArcadeVehicleProfile,
  body: BodyKinematics,
  contact: ContactObservation,
  wrench: VehicleWrench,
  reserve: number,
): number {
  const yawRate = dot3(body.omegaWorld, WORLD_UP);
  const omegaRight = dot3(body.omegaWorld, body.right);
  const angularAcceleration = add3(
    add3(
      scale3(WORLD_UP, wrench.moment.y / profile.yawInertia),
      scale3(body.right, dot3(wrench.moment, body.right) / profile.pitchInertia),
    ),
    scale3(cross3(WORLD_UP, body.right), yawRate * omegaRight),
  );
  const offset = sub3(contact.reachPoint, body.position);
  const reachAcceleration = add3(
    scale3(wrench.force, 1 / profile.mass),
    add3(cross3(angularAcceleration, offset), cross3(body.omegaWorld, cross3(body.omegaWorld, offset))),
  );
  const qAcceleration = -dot3(reachAcceleration, contact.surface.normal);
  const qVelocity = -dot3(contact.reachVelocity, contact.surface.normal);
  const qStatic = contact.profile.suspension.qStatic;
  const frequency = Math.sqrt(VEHICLE_GRAVITY / qStatic);
  return qAcceleration + 2 * frequency * qVelocity + frequency * frequency * (-contact.gap - reserve * qStatic);
}

export function createProtectedWheelPairWorkspace(front: WheelSolveInput, rear: WheelSolveInput) {
  const candidate = () => ({
    value: {
      frontInput: front,
      rearInput: rear,
      frontWheel: createWheelSolveResult(),
      rearWheel: createWheelSolveResult(),
      wrench: createWrenchWorkspace().value,
      supportScale: 1,
      supportFeasible: true,
    },
    frontInput: { ...front },
    rearInput: { ...rear },
    wrench: createWrenchWorkspace(),
    tire: createTireForceScratch(),
    residual: new Float64Array(1),
  });
  return { first: candidate(), second: candidate() };
}
type PairCandidate = ReturnType<typeof createProtectedWheelPairWorkspace>['first'];
function prepareWheel(
  input: WheelSolveInput,
  scale: number,
  policy: TorqueProtectionPolicy,
  out: Writable<WheelSolveInput>,
  scratch: ReturnType<typeof createTireForceScratch>,
  residual: Float64Array,
) {
  out.omegaPrevious = input.omegaPrevious;
  out.inertia = input.inertia;
  out.rollingRadius = input.rollingRadius;
  out.longitudinalVelocity = input.longitudinalVelocity;
  out.lateralVelocity = input.lateralVelocity;
  out.normalLoad = input.normalLoad;
  out.gripFactor = input.gripFactor;
  out.characteristics = input.characteristics;
  out.rollingResistance = input.rollingResistance;
  out.driveTorque = input.driveTorque;
  out.brakeTorque = input.brakeTorque;
  out.dt = input.dt;
  out.tire = input.tire;
  if (scale !== 1) {
    out.driveTorque = input.driveTorque * scale;
    out.brakeTorque = input.brakeTorque * scale;
  }
  return policy.wheelSlip ? limitWheelTorques(out, out, scratch, residual) : out;
}
function evaluatePair(
  profile: CompiledArcadeVehicleProfile,
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput,
  policy: TorqueProtectionPolicy,
  scale: number,
  candidate: PairCandidate,
) {
  const out = candidate.value;
  out.frontInput = prepareWheel(frontRequest, scale, policy, candidate.frontInput, candidate.tire, candidate.residual);
  out.rearInput = prepareWheel(rearRequest, scale, policy, candidate.rearInput, candidate.tire, candidate.residual);
  solveWheelOmega(out.frontInput, out.frontWheel, candidate.residual, candidate.tire);
  solveWheelOmega(out.rearInput, out.rearWheel, candidate.residual, candidate.tire);
  evaluateVehicleWrench(profile, body, front, rear, out.frontWheel, out.rearWheel, candidate.wrench);
  out.wrench = candidate.wrench.value;
  out.supportScale = scale;
  out.supportFeasible = true;
  return out;
}

/** One delivered-torque owner. Every trial uses the unchanged solve and wrench. */
export function solveProtectedWheelPair(
  profile: CompiledArcadeVehicleProfile,
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput,
  policy: TorqueProtectionPolicy,
  workspace: ReturnType<typeof createProtectedWheelPairWorkspace>,
): ProtectedWheelPair {
  let acceptedSlot = workspace.first,
    trialSlot = workspace.second;
  const requested = evaluatePair(profile, body, front, rear, frontRequest, rearRequest, policy, 1, acceptedSlot);
  const reserve = policy.supportReserve;
  if (reserve === null) return requested;
  const checkFront =
    frontRequest.driveTorque + rearRequest.driveTorque > 0 &&
    front.supportAvailable &&
    front.tireFrameValid &&
    rear.normalLoad > 0 &&
    dot3(body.up, front.surface.normal) > 0;
  const checkRear =
    frontRequest.brakeTorque + rearRequest.brakeTorque > 0 &&
    rear.supportAvailable &&
    rear.tireFrameValid &&
    front.normalLoad > 0 &&
    dot3(body.up, rear.surface.normal) > 0;
  const safe = (value: ProtectedWheelPair) =>
    (!checkFront || supportCompressionMargin(profile, body, front, value.wrench, reserve) >= 0) &&
    (!checkRear || supportCompressionMargin(profile, body, rear, value.wrench, reserve) >= 0);
  if (safe(requested)) return requested;
  const accepted = evaluatePair(profile, body, front, rear, frontRequest, rearRequest, policy, 0, acceptedSlot);
  if (!safe(accepted)) {
    accepted.supportFeasible = false;
    return accepted;
  }
  let lower = 0,
    upper = 1;
  for (let i = 0; i < SUPPORT_BISECTION_ITERATIONS; i++) {
    const scale = (lower + upper) * 0.5;
    const candidate = evaluatePair(profile, body, front, rear, frontRequest, rearRequest, policy, scale, trialSlot);
    if (safe(candidate)) {
      lower = scale;
      const swap = acceptedSlot;
      acceptedSlot = trialSlot;
      trialSlot = swap;
    } else upper = scale;
  }
  return acceptedSlot.value;
}
