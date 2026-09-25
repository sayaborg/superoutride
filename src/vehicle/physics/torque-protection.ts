import { TIRE_LOW_SPEED_REGULARIZATION } from './numerical-constants.js';
import { type Writable } from '../../core/writable.js';
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
import { add3, cross3, dot3, scale3, sub3, WORLD_UP } from '../../core/vector3.js';
import type { CompiledVehicle } from './vehicle-definitions.js';
import { createWrenchWorkspace, evaluateVehicleWrench, type VehicleWrench } from './vehicle-wrench.js';

/** Composition policy, not controller memory and not a tire coefficient. */
export interface TorqueProtectionPolicy {
  readonly wheelSlip: boolean;
  /** Fraction of static suspension compression reserved against pitch-induced separation. */
  readonly supportReserve: number | null;
}
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

/** Pure-axis slip at the control boundary. P is an explicitly selected control boundary, not a
 * claim of a universal optimal slip. */
function boundarySlip(input: WheelSolveInput): number {
  const tire = input.characteristics;
  return (input.gripFactor * (2 - tire.rhoKnee) * tire.muX) / tire.kX;
}

/** ABS: the largest brake magnitude keeping the station at or above its minimum rolling speed
 * with the given drive torque. Below tire v0 the ordinary signed brake atom stops and holds. */
function absBrakeTorque(
  input: WheelSolveInput,
  driveTorque: number,
  scratch: ReturnType<typeof createTireForceScratch>,
  residual: Float64Array,
): number {
  const brake = input.brakeTorque;
  const vx = input.longitudinalVelocity;
  if (!(input.normalLoad > 0) || !(input.gripFactor > 0) || !(Math.abs(vx) > TIRE_LOW_SPEED_REGULARIZATION))
    return brake;
  const referenceSpeed = Math.hypot(vx, TIRE_LOW_SPEED_REGULARIZATION);
  const minimumRolling = (Math.abs(vx) - boundarySlip(input) * referenceSpeed) / input.rollingRadius;
  if (!(minimumRolling > 0)) return brake;
  const direction = Math.sign(vx);
  const boundary = wheelRequiredNetTorque(input, direction * minimumRolling, scratch, residual);
  return Math.max(0, Math.min(brake, direction * (driveTorque - boundary)));
}

/** TCS: the largest drive torque keeping a forward-moving station at or below its maximum rolling
 * speed, against the station's ABS-limited brake at zero drive. Unbounded without force. */
function tcsDriveTorqueBound(
  input: WheelSolveInput,
  scratch: ReturnType<typeof createTireForceScratch>,
  residual: Float64Array,
): number {
  const vx = input.longitudinalVelocity;
  if (!(input.normalLoad > 0) || !(input.gripFactor > 0) || !(vx >= 0)) return Infinity;
  const referenceSpeed = Math.hypot(vx, TIRE_LOW_SPEED_REGULARIZATION);
  const upper = (vx + boundarySlip(input) * referenceSpeed) / input.rollingRadius;
  const torqueUpper = wheelRequiredNetTorque(input, upper, scratch, residual);
  return Math.max(0, torqueUpper + absBrakeTorque(input, 0, scratch, residual));
}

function assertProtectedRequest(input: WheelSolveInput): void {
  validateWheelSolveInput(input);
  if (
    !(input.driveTorque >= 0) ||
    !(input.brakeTorque >= 0) ||
    !Number.isFinite(input.driveTorque + input.brakeTorque)
  ) {
    throw new RangeError('protected requested torques must be finite nonnegative magnitudes');
  }
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
function supportCompressionMargin(
  compiledVehicle: CompiledVehicle,
  body: BodyKinematics,
  contact: ContactObservation,
  wrench: VehicleWrench,
  reserve: number,
): number {
  const yawRate = dot3(body.omegaWorld, WORLD_UP);
  const omegaRight = dot3(body.omegaWorld, body.right);
  const angularAcceleration = add3(
    add3(
      scale3(WORLD_UP, wrench.moment.y / compiledVehicle.yawInertia),
      scale3(body.right, dot3(wrench.moment, body.right) / compiledVehicle.pitchInertia),
    ),
    scale3(cross3(WORLD_UP, body.right), yawRate * omegaRight),
  );
  const offset = sub3(contact.reachPoint, body.position);
  const reachAcceleration = add3(
    scale3(wrench.force, 1 / compiledVehicle.mass),
    add3(cross3(angularAcceleration, offset), cross3(body.omegaWorld, cross3(body.omegaWorld, offset))),
  );
  const qAcceleration = -dot3(reachAcceleration, contact.surface.normal);
  const qVelocity = -dot3(contact.reachVelocity, contact.surface.normal);
  const qStatic = contact.station.suspension.qStatic;
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
/** Copies a request with the given drive torque and scaled brake, then applies ABS to the brake. */
function prepareWheel(
  input: WheelSolveInput,
  driveTorque: number,
  brakeScale: number,
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
  out.driveTorque = driveTorque;
  out.brakeTorque = input.brakeTorque * brakeScale;
  out.dt = input.dt;
  if (policy.wheelSlip) out.brakeTorque = absBrakeTorque(out, driveTorque, scratch, residual);
  return out;
}
function evaluatePair(
  compiledVehicle: CompiledVehicle,
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput,
  policy: TorqueProtectionPolicy,
  frontDriveTorque: number,
  rearDriveTorque: number,
  brakeScale: number,
  candidate: PairCandidate,
) {
  const out = candidate.value;
  out.frontInput = prepareWheel(
    frontRequest,
    frontDriveTorque,
    brakeScale,
    policy,
    candidate.frontInput,
    candidate.tire,
    candidate.residual,
  );
  out.rearInput = prepareWheel(
    rearRequest,
    rearDriveTorque,
    brakeScale,
    policy,
    candidate.rearInput,
    candidate.tire,
    candidate.residual,
  );
  solveWheelOmega(out.frontInput, out.frontWheel, candidate.residual, candidate.tire);
  solveWheelOmega(out.rearInput, out.rearWheel, candidate.residual, candidate.tire);
  evaluateVehicleWrench(compiledVehicle, body, front, rear, out.frontWheel, out.rearWheel, candidate.wrench);
  out.wrench = candidate.wrench.value;
  out.supportScale = brakeScale;
  out.supportFeasible = true;
  return out;
}

/**
 * Upper bound on total drive-wheel torque, computed from the tires before the powertrain chooses
 * its opening. Requests carry the brake request and zero drive. TCS bounds each driven station;
 * dividing by the station's fixed drive fraction and taking the tighter station bounds the
 * total. With a support reserve, the drive side of anti-wheelie bisects total drive torque, brake
 * fixed, until the front support margin holds; the requested drive torque caps that search. The
 * bound only limits the effective opening; drive torque is never trimmed after the powertrain.
 */
export function solveDriveTorqueUpperBound(
  compiledVehicle: CompiledVehicle,
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput,
  policy: TorqueProtectionPolicy,
  requestedDriveTorque: number,
  workspace: ReturnType<typeof createProtectedWheelPairWorkspace>,
): number {
  assertProtectedRequest(frontRequest);
  assertProtectedRequest(rearRequest);
  const slot = workspace.first;
  const frontFraction = compiledVehicle.frontDriveTorqueFraction;
  let upper = Infinity;
  if (policy.wheelSlip) {
    if (frontFraction > 0)
      upper = Math.min(upper, tcsDriveTorqueBound(frontRequest, slot.tire, slot.residual) / frontFraction);
    if (frontFraction < 1)
      upper = Math.min(upper, tcsDriveTorqueBound(rearRequest, slot.tire, slot.residual) / (1 - frontFraction));
  }
  const reserve = policy.supportReserve;
  const requested = Math.min(requestedDriveTorque, upper);
  if (
    reserve === null ||
    !(requested > 0) ||
    !front.supportAvailable ||
    !front.tireFrameValid ||
    !(rear.normalLoad > 0) ||
    !(dot3(body.up, front.surface.normal) > 0)
  )
    return upper;
  const safe = (drive: number) => {
    const value = evaluatePair(
      compiledVehicle,
      body,
      front,
      rear,
      frontRequest,
      rearRequest,
      policy,
      drive * frontFraction,
      drive * (1 - frontFraction),
      1,
      slot,
    );
    return supportCompressionMargin(compiledVehicle, body, front, value.wrench, reserve) >= 0;
  };
  if (safe(requested)) return upper;
  if (!safe(0)) return 0;
  let lower = 0,
    unsafe = requested;
  for (let i = 0; i < SUPPORT_BISECTION_ITERATIONS; i++) {
    const drive = (lower + unsafe) * 0.5;
    if (safe(drive)) lower = drive;
    else unsafe = drive;
  }
  return lower;
}

/**
 * One wheel-pair solve with the powertrain's drive torque delivered as requested. ABS limits each
 * brake; with a support reserve, the brake side of anti-wheelie bisects one brake scale until
 * the rear support margin holds. Every trial uses the unchanged solve and wrench.
 */
export function solveProtectedWheelPair(
  compiledVehicle: CompiledVehicle,
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput,
  policy: TorqueProtectionPolicy,
  workspace: ReturnType<typeof createProtectedWheelPairWorkspace>,
): ProtectedWheelPair {
  assertProtectedRequest(frontRequest);
  assertProtectedRequest(rearRequest);
  let acceptedSlot = workspace.first,
    trialSlot = workspace.second;
  const evaluate = (brakeScale: number, slot: PairCandidate) =>
    evaluatePair(
      compiledVehicle,
      body,
      front,
      rear,
      frontRequest,
      rearRequest,
      policy,
      frontRequest.driveTorque,
      rearRequest.driveTorque,
      brakeScale,
      slot,
    );
  const requested = evaluate(1, acceptedSlot);
  const reserve = policy.supportReserve;
  if (
    reserve === null ||
    !(frontRequest.brakeTorque + rearRequest.brakeTorque > 0) ||
    !rear.supportAvailable ||
    !rear.tireFrameValid ||
    !(front.normalLoad > 0) ||
    !(dot3(body.up, rear.surface.normal) > 0)
  )
    return requested;
  const safe = (value: ProtectedWheelPair) =>
    supportCompressionMargin(compiledVehicle, body, rear, value.wrench, reserve) >= 0;
  if (safe(requested)) return requested;
  const accepted = evaluate(0, acceptedSlot);
  if (!safe(accepted)) {
    accepted.supportFeasible = false;
    return accepted;
  }
  let lower = 0,
    upper = 1;
  for (let i = 0; i < SUPPORT_BISECTION_ITERATIONS; i++) {
    const scale = (lower + upper) * 0.5;
    const candidate = evaluate(scale, trialSlot);
    if (safe(candidate)) {
      lower = scale;
      const swap = acceptedSlot;
      acceptedSlot = trialSlot;
      trialSlot = swap;
    } else upper = scale;
  }
  return acceptedSlot.value;
}
