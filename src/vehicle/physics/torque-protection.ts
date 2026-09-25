import { TIRE_LOW_SPEED_REGULARIZATION } from './numerical-constants.js';
import { type Writable } from '../../core/writable.js';
const PITCH_BISECTION_ITERATIONS = 12;
// Rad/s: critically damped response of the pitch barrier; sets how early protection anticipates the limit.
const PITCH_BARRIER_FREQUENCY = 6;

import {
  createTireForceScratch,
  createWheelSolveResult,
  solveWheelOmega,
  validateWheelSolveInput,
  wheelRequiredNetTorque,
  type WheelSolveInput,
  type WheelSolveResult,
} from './tire-wheel.js';
import type { BodyKinematics, ContactObservation } from './vehicle-dynamics.js';
import { cross3, dot3, normalize3, sub3, type Vec3 } from '../../core/vector3.js';
import type { CompiledVehicle } from './vehicle-definitions.js';
import { createWrenchWorkspace, evaluateVehicleWrench, type VehicleWrench } from './vehicle-wrench.js';

/** Composition policy, not controller memory and not a tire coefficient. */
export interface TorqueProtectionPolicy {
  readonly wheelSlip: boolean;
  /** Radians: nose-up and nose-down pitch limit against the road line under the wheels. */
  readonly pitchLimit: number;
}
export function resolveTorqueProtectionPolicy(policy: TorqueProtectionPolicy): Readonly<TorqueProtectionPolicy> {
  if (
    typeof policy.wheelSlip !== 'boolean' ||
    !Number.isFinite(policy.pitchLimit) ||
    !(policy.pitchLimit > 0 && policy.pitchLimit < Math.PI / 2)
  ) {
    throw new RangeError('torque policy needs boolean wheelSlip and a pitch limit in (0,pi/2)');
  }
  return Object.freeze({ wheelSlip: policy.wheelSlip, pitchLimit: policy.pitchLimit });
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

/** MSR: the most negative drive torque keeping a forward-moving station at or above its minimum
 * rolling speed, after its ABS-limited brake at zero drive takes its share first. Unbounded at or
 * below tire v0 and without force. */
function msrDriveTorqueBound(
  input: WheelSolveInput,
  scratch: ReturnType<typeof createTireForceScratch>,
  residual: Float64Array,
): number {
  const vx = input.longitudinalVelocity;
  if (!(input.normalLoad > 0) || !(input.gripFactor > 0) || !(vx > TIRE_LOW_SPEED_REGULARIZATION)) return -Infinity;
  const referenceSpeed = Math.hypot(vx, TIRE_LOW_SPEED_REGULARIZATION);
  const minimumRolling = (vx - boundarySlip(input) * referenceSpeed) / input.rollingRadius;
  if (!(minimumRolling > 0)) return -Infinity;
  const boundary = wheelRequiredNetTorque(input, minimumRolling, scratch, residual);
  return Math.min(0, boundary + absBrakeTorque(input, 0, scratch, residual));
}

/** Drive torque is signed (negative is engine braking); brake is a magnitude. */
function assertProtectedRequest(input: WheelSolveInput): void {
  validateWheelSolveInput(input);
  if (!(input.brakeTorque >= 0) || !Number.isFinite(input.driveTorque + input.brakeTorque)) {
    throw new RangeError('protected requests need finite drive torque and a finite nonnegative brake magnitude');
  }
}

/** Total drive-wheel torque bounds; each only limits the effective opening. */
export interface DriveTorqueBounds {
  upper: number;
  lower: number;
}

export function createDriveTorqueBounds(): DriveTorqueBounds {
  return { upper: Infinity, lower: -Infinity };
}

interface ProtectedWheelPair {
  readonly frontInput: WheelSolveInput;
  readonly rearInput: WheelSolveInput;
  readonly frontWheel: WheelSolveResult;
  readonly rearWheel: WheelSolveResult;
  readonly wrench: VehicleWrench;
  readonly pitchBrakeScale: number;
  readonly pitchFeasible: boolean;
}

/**
 * Pitch against the road line: the angle of the body's forward axis to the line joining the road
 * points under the front and rear contacts (suspension attitude included), positive nose up, and its
 * rate, the body pitch rate minus the line's rotation from the contacts' along-road velocities.
 * Inactive in the air (neither contact loaded) or when a road point is outside the coordinate domain.
 */
export interface RoadPitch {
  active: boolean;
  angle: number;
  rate: number;
}
export function createRoadPitch(): RoadPitch {
  return { active: false, angle: 0, rate: 0 };
}
export function observeRoadPitch(
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  out: RoadPitch,
  scratch: { a: Writable<Vec3>; b: Writable<Vec3>; c: Writable<Vec3> },
): RoadPitch {
  out.active =
    (front.normalLoad > 0 || rear.normalLoad > 0) &&
    front.surface.coordinate.inDomain &&
    rear.surface.coordinate.inDomain;
  if (!out.active) {
    out.angle = out.rate = 0;
    return out;
  }
  const chord = sub3(front.surface.point, rear.surface.point, scratch.a);
  const length = Math.hypot(chord.x, chord.y, chord.z);
  const along = normalize3(chord, scratch.a);
  const lineUp = normalize3(cross3(along, body.right, scratch.b), scratch.b);
  out.angle = Math.atan2(dot3(body.forward, lineUp), dot3(body.forward, along));
  const frontRate = alongRoadVelocity(front, lineUp),
    rearRate = alongRoadVelocity(rear, lineUp);
  out.rate = -dot3(body.omegaWorld, body.right) - (frontRate - rearRate) / length;
  return out;
}
/** Line-normal velocity of the road point under a contact, which follows the contact along the road. */
function alongRoadVelocity(contact: ContactObservation, lineUp: Vec3): number {
  const n = contact.surface.normal,
    v = contact.reachVelocity;
  const normal = dot3(v, n);
  return (v.x - n.x * normal) * lineUp.x + (v.y - n.y * normal) * lineUp.y + (v.z - n.z * normal) * lineUp.z;
}

/**
 * Critically damped barrier h''+2w*h'+w^2*h >= 0 on the remaining angle h to one limit, with the
 * body pitch acceleration of the SAME wrench as the physical update (line acceleration neglected).
 * direction +1 guards nose up (h = limit-angle), -1 guards nose down (h = angle+limit).
 */
function pitchMargin(
  compiledVehicle: CompiledVehicle,
  body: BodyKinematics,
  pitch: RoadPitch,
  wrench: VehicleWrench,
  limit: number,
  direction: 1 | -1,
): number {
  const acceleration = -dot3(wrench.moment, body.right) / compiledVehicle.pitchInertia;
  const w = PITCH_BARRIER_FREQUENCY;
  return -direction * (acceleration + 2 * w * pitch.rate) + w * w * (limit - direction * pitch.angle);
}

export function createProtectedWheelPairWorkspace(front: WheelSolveInput, rear: WheelSolveInput) {
  const candidate = () => ({
    value: {
      frontInput: front,
      rearInput: rear,
      frontWheel: createWheelSolveResult(),
      rearWheel: createWheelSolveResult(),
      wrench: createWrenchWorkspace().value,
      pitchBrakeScale: 1,
      pitchFeasible: true,
    },
    frontInput: { ...front },
    rearInput: { ...rear },
    wrench: createWrenchWorkspace(),
    tire: createTireForceScratch(),
    residual: new Float64Array(1),
  });
  const v = () => ({ x: 0, y: 0, z: 0 });
  return {
    first: candidate(),
    second: candidate(),
    pitch: createRoadPitch(),
    pitchScratch: { a: v(), b: v(), c: v() },
  };
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
  out.pitchBrakeScale = brakeScale;
  out.pitchFeasible = true;
  return out;
}

/**
 * Bounds on total drive-wheel torque, computed from the tires before the powertrain chooses its
 * opening. Requests carry the brake request and zero drive. Each driven station's bound is divided
 * by its fixed drive fraction and the tighter station bounds the total. TCS gives the upper bound
 * and MSR the lower bound (engine braking). The nose-up side of pitch protection bisects positive
 * total drive torque, brake fixed, until the pitch barrier holds; the requested drive torque caps
 * that search. The bounds only limit the effective opening; drive
 * torque is never trimmed after the powertrain.
 */
export function solveDriveTorqueBounds(
  compiledVehicle: CompiledVehicle,
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput,
  policy: TorqueProtectionPolicy,
  requestedDriveTorque: number,
  workspace: ReturnType<typeof createProtectedWheelPairWorkspace>,
  out: DriveTorqueBounds,
): DriveTorqueBounds {
  assertProtectedRequest(frontRequest);
  assertProtectedRequest(rearRequest);
  const slot = workspace.first;
  const frontFraction = compiledVehicle.frontDriveTorqueFraction;
  let lower = -Infinity;
  if (policy.wheelSlip) {
    if (frontFraction > 0)
      lower = Math.max(lower, msrDriveTorqueBound(frontRequest, slot.tire, slot.residual) / frontFraction);
    if (frontFraction < 1)
      lower = Math.max(lower, msrDriveTorqueBound(rearRequest, slot.tire, slot.residual) / (1 - frontFraction));
  }
  out.lower = lower;
  out.upper = driveTorqueUpperBound(
    compiledVehicle,
    body,
    front,
    rear,
    frontRequest,
    rearRequest,
    policy,
    requestedDriveTorque,
    observeRoadPitch(body, front, rear, workspace.pitch, workspace.pitchScratch),
    slot,
  );
  return out;
}

function driveTorqueUpperBound(
  compiledVehicle: CompiledVehicle,
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput,
  policy: TorqueProtectionPolicy,
  requestedDriveTorque: number,
  pitch: RoadPitch,
  slot: PairCandidate,
): number {
  const frontFraction = compiledVehicle.frontDriveTorqueFraction;
  let upper = Infinity;
  if (policy.wheelSlip) {
    if (frontFraction > 0)
      upper = Math.min(upper, tcsDriveTorqueBound(frontRequest, slot.tire, slot.residual) / frontFraction);
    if (frontFraction < 1)
      upper = Math.min(upper, tcsDriveTorqueBound(rearRequest, slot.tire, slot.residual) / (1 - frontFraction));
  }
  const requested = Math.min(requestedDriveTorque, upper);
  if (!(requested > 0) || !pitch.active) return upper;
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
    return pitchMargin(compiledVehicle, body, pitch, value.wrench, policy.pitchLimit, 1) >= 0;
  };
  if (safe(requested)) return upper;
  if (!safe(0)) return 0;
  let lower = 0,
    unsafe = requested;
  for (let i = 0; i < PITCH_BISECTION_ITERATIONS; i++) {
    const drive = (lower + unsafe) * 0.5;
    if (safe(drive)) lower = drive;
    else unsafe = drive;
  }
  return lower;
}

/**
 * One wheel-pair solve with the powertrain's drive torque delivered as requested. ABS limits each
 * brake; the nose-down side of pitch protection bisects one brake scale until the pitch barrier
 * holds. Every trial uses the unchanged solve and wrench.
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
  const pitch = observeRoadPitch(body, front, rear, workspace.pitch, workspace.pitchScratch);
  if (!(frontRequest.brakeTorque + rearRequest.brakeTorque > 0) || !pitch.active) return requested;
  const safe = (value: ProtectedWheelPair) =>
    pitchMargin(compiledVehicle, body, pitch, value.wrench, policy.pitchLimit, -1) >= 0;
  if (safe(requested)) return requested;
  const accepted = evaluate(0, acceptedSlot);
  if (!safe(accepted)) {
    accepted.pitchFeasible = false;
    return accepted;
  }
  let lower = 0,
    upper = 1;
  for (let i = 0; i < PITCH_BISECTION_ITERATIONS; i++) {
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
