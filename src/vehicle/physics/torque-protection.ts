import { TIRE_LOW_SPEED_REGULARIZATION } from './tire-wheel.js';
import { type Writable } from '../../core/writable.js';
const PITCH_BISECTION_ITERATIONS = 12;
// Rad/s: critically damped response of the pitch barrier; sets how early protection anticipates the limit. A value the
// author chose, not derived (docs/vehicle-physics.md).
const PITCH_BARRIER_FREQUENCY = 6;
// N m: the coupled locked-engine solve stops once its bracket on the inertia torque is this narrow.
const COUPLED_INERTIA_TORQUE_TOLERANCE = 1e-6;

import {
  createTireForceScratch,
  createWheelSolveResult,
  solveWheelOmega,
  validateWheelSolveInput,
  wheelRequiredNetTorque,
  type WheelSolveInput,
  type WheelSolveResult,
} from './tire-wheel.js';
import type { BodyKinematics } from './vehicle-state.js';
import type { ContactObservation } from './vehicle-contact.js';
import { cross3, dot3, normalize3, sub3, type Vec3 } from '../../core/vector3.js';
import type { CompiledVehicle } from './vehicle-definitions.js';
import { createWrenchWorkspace, evaluateVehicleWrench, type VehicleWrench } from './vehicle-wrench.js';

/**
 * Wheel slip protection by side: `drive`, TCS and MSR, bounds the engine's effective opening, and `brake`, ABS, bounds
 * the pedal brake.
 */
export interface WheelSlipProtection {
  readonly drive: boolean;
  readonly brake: boolean;
}

/** Composition policy, not controller memory and not a tire coefficient. */
export interface TorqueProtectionPolicy {
  readonly wheelSlip: Readonly<WheelSlipProtection>;
  /** Radians: nose-up and nose-down pitch limit against the road line under the wheels. */
  readonly pitchLimit: number;
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

/** The brake a station takes at zero drive: its ABS-limited brake where ABS acts (`abs`), else its pedal brake. */
function zeroDriveBrake(
  input: WheelSolveInput,
  abs: boolean,
  scratch: ReturnType<typeof createTireForceScratch>,
  residual: Float64Array,
): number {
  return abs ? absBrakeTorque(input, 0, scratch, residual) : input.brakeTorque;
}

/** TCS: the largest drive torque keeping a forward-moving station at or below its maximum rolling
 * speed, against the brake it takes at zero drive. Unbounded without force. */
function tcsDriveTorqueBound(
  input: WheelSolveInput,
  abs: boolean,
  scratch: ReturnType<typeof createTireForceScratch>,
  residual: Float64Array,
): number {
  const vx = input.longitudinalVelocity;
  if (!(input.normalLoad > 0) || !(input.gripFactor > 0) || !(vx >= 0)) return Infinity;
  const referenceSpeed = Math.hypot(vx, TIRE_LOW_SPEED_REGULARIZATION);
  const upper = (vx + boundarySlip(input) * referenceSpeed) / input.rollingRadius;
  const torqueUpper = wheelRequiredNetTorque(input, upper, scratch, residual);
  return Math.max(0, torqueUpper + zeroDriveBrake(input, abs, scratch, residual));
}

/** MSR: the most negative drive torque keeping a forward-moving station at or above its minimum
 * rolling speed, after the brake it takes at zero drive takes its share first. Unbounded at or
 * below tire v0 and without force. */
function msrDriveTorqueBound(
  input: WheelSolveInput,
  abs: boolean,
  scratch: ReturnType<typeof createTireForceScratch>,
  residual: Float64Array,
): number {
  const vx = input.longitudinalVelocity;
  if (!(input.normalLoad > 0) || !(input.gripFactor > 0) || !(vx > TIRE_LOW_SPEED_REGULARIZATION)) return -Infinity;
  const referenceSpeed = Math.hypot(vx, TIRE_LOW_SPEED_REGULARIZATION);
  const minimumRolling = (vx - boundarySlip(input) * referenceSpeed) / input.rollingRadius;
  if (!(minimumRolling > 0)) return -Infinity;
  const boundary = wheelRequiredNetTorque(input, minimumRolling, scratch, residual);
  return Math.min(0, boundary + zeroDriveBrake(input, abs, scratch, residual));
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
function createRoadPitch(): RoadPitch {
  return { active: false, angle: 0, rate: 0 };
}
function observeRoadPitch(
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
    coupled: { front, rear, inertia: 0, frontCopy: { ...front }, rearCopy: { ...rear } },
    /** The last split-drive inertia torque solved, where the next solve starts. */
    inertiaTorque: { value: 0 },
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
  if (policy.wheelSlip.brake) out.brakeTorque = absBrakeTorque(out, driveTorque, scratch, residual);
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
 * The requests and the coupled inertia left for the engine-term solve. With one driven wheel the locked engine's
 * reflected inertia adds exactly to that wheel's own (copies of the requests carry it), and nothing is left to couple;
 * otherwise the requests are unchanged and the full coupled inertia remains.
 */
function coupledPair(
  compiledVehicle: CompiledVehicle,
  frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput,
  coupledInertia: number,
  workspace: ReturnType<typeof createProtectedWheelPairWorkspace>,
) {
  const f = compiledVehicle.frontDriveTorqueFraction;
  const out = workspace.coupled;
  if (coupledInertia === 0 || (f > 0 && f < 1)) {
    out.front = frontRequest;
    out.rear = rearRequest;
    out.inertia = coupledInertia;
    return out;
  }
  Object.assign(out.frontCopy, frontRequest);
  Object.assign(out.rearCopy, rearRequest);
  if (f === 1) out.frontCopy.inertia += coupledInertia;
  else out.rearCopy.inertia += coupledInertia;
  out.front = out.frontCopy;
  out.rear = out.rearCopy;
  out.inertia = 0;
  return out;
}

/**
 * The wheel pair driven by an engine term: the engine's own torque at the wheels, `engineTorque * G *
 * drivelineEfficiency`. A locked engine turns at G times the drive-split wheel speed, so its inertia reflected through
 * the ratio, `coupledInertia = engineInertia * G^2` (0 unlocked), joins the pair through the fixed split without loss:
 * the delivered drive is the engine term less `coupledInertia * (f*omegaDotF + (1-f)*omegaDotR)`, solved in the same
 * implicit step. With one driven wheel, coupledPair has already added it to that wheel's own. Otherwise the inertia
 * torque x is the root of `x - coupledInertia * (f*omegaDotF + (1-f)*omegaDotR)` at delivered drive
 * `engineTorque - x`, which increases with slope at least 1; solveIncreasingRoot finds it to the tolerance from the
 * last root solved, each trial running the unchanged wheel solves.
 */
function evaluateEnginePair(
  compiledVehicle: CompiledVehicle,
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput,
  policy: TorqueProtectionPolicy,
  engineTorque: number,
  coupledInertia: number,
  brakeScale: number,
  candidate: PairCandidate,
  guess: { value: number },
) {
  const f = compiledVehicle.frontDriveTorqueFraction;
  const atInertiaTorque = (inertiaTorque: number) =>
    evaluatePair(
      compiledVehicle,
      body,
      front,
      rear,
      frontRequest,
      rearRequest,
      policy,
      (engineTorque - inertiaTorque) * f,
      (engineTorque - inertiaTorque) * (1 - f),
      brakeScale,
      candidate,
    );
  if (coupledInertia === 0) return atInertiaTorque(0);
  let evaluated = NaN;
  const residual = (inertiaTorque: number) => {
    evaluated = inertiaTorque;
    return inertiaTorque - coupledInertiaTorque(compiledVehicle, atInertiaTorque(inertiaTorque), coupledInertia);
  };
  const root = solveIncreasingRoot(residual, guess.value, COUPLED_INERTIA_TORQUE_TOLERANCE);
  guess.value = root;
  return evaluated === root ? candidate.value : atInertiaTorque(root);
}

/**
 * The root of a residual that increases with slope at least 1, to within `tolerance`: the residual at the guess `x0`
 * brackets the root between `x0` and `x0 - r(x0)`, and Illinois regula falsi narrows the bracket, bisecting whenever
 * its secant point leaves it. A residual within the tolerance of zero puts its point within the tolerance of the root.
 */
function solveIncreasingRoot(residual: (x: number) => number, x0: number, tolerance: number): number {
  const r0 = residual(x0);
  if (!(Math.abs(r0) > tolerance)) return x0;
  const x1 = x0 - r0,
    r1 = residual(x1);
  if (!(Math.abs(r1) > tolerance)) return x1;
  let low = Math.min(x0, x1),
    high = Math.max(x0, x1),
    rLow = x0 < x1 ? r0 : r1,
    rHigh = x0 < x1 ? r1 : r0,
    lastReplaced = 0;
  while (high - low > tolerance) {
    let x = (low * rHigh - high * rLow) / (rHigh - rLow);
    if (!(x > low && x < high)) x = (low + high) * 0.5;
    const r = residual(x);
    if (!(Math.abs(r) > tolerance)) return x;
    // Illinois: when the same end is replaced twice in a row, the kept end's residual is halved, so the secant passes it.
    if (r < 0) {
      low = x;
      rLow = r;
      if (lastReplaced === -1) rHigh *= 0.5;
      lastReplaced = -1;
    } else {
      high = x;
      rHigh = r;
      if (lastReplaced === 1) rLow *= 0.5;
      lastReplaced = 1;
    }
  }
  return (low + high) * 0.5;
}

/** The reflected engine inertia's torque at the wheels for a solved pair: `coupledInertia` times the split's omegaDot. */
function coupledInertiaTorque(
  compiledVehicle: CompiledVehicle,
  pair: ProtectedWheelPair,
  coupledInertia: number,
): number {
  const f = compiledVehicle.frontDriveTorqueFraction;
  return coupledInertia * (pair.frontWheel.omegaDot * f + pair.rearWheel.omegaDot * (1 - f));
}

/**
 * The engine term that delivers a total drive torque: the drive plus the coupled inertia's torque of the pair it
 * drives. Monotone in the drive, so it maps a drive bound to an engine-term bound; the identity when unlocked.
 */
function engineTorqueForDrive(
  compiledVehicle: CompiledVehicle,
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput,
  policy: TorqueProtectionPolicy,
  drive: number,
  coupledInertia: number,
  candidate: PairCandidate,
): number {
  if (coupledInertia === 0 || !Number.isFinite(drive)) return drive;
  const f = compiledVehicle.frontDriveTorqueFraction;
  const pair = evaluatePair(
    compiledVehicle,
    body,
    front,
    rear,
    frontRequest,
    rearRequest,
    policy,
    drive * f,
    drive * (1 - f),
    1,
    candidate,
  );
  return drive + coupledInertiaTorque(compiledVehicle, pair, coupledInertia);
}

/**
 * Bounds on the engine term (the engine's own torque at the wheels), computed from the tires before the powertrain
 * chooses its opening. Requests carry the brake request and zero drive. Each driven station's bound on the delivered
 * total drive is divided by its fixed drive fraction and the tighter station bounds the total. TCS gives the upper
 * bound and MSR the lower bound (engine braking). The nose-up side of pitch protection bisects positive delivered
 * drive, brake fixed, until the pitch barrier holds; the requested engine term's delivered drive caps that search.
 * Each delivered-drive bound becomes the engine term that delivers it with the locked engine's `coupledInertia`
 * (see evaluateEnginePair). The bounds only limit the effective opening; drive torque is never
 * trimmed after the powertrain.
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
  coupledInertia: number,
  workspace: ReturnType<typeof createProtectedWheelPairWorkspace>,
  out: DriveTorqueBounds,
): DriveTorqueBounds {
  // Once per wheel and substep: every later trial reuses these requests with solver-chosen torques.
  validateWheelSolveInput(frontRequest);
  validateWheelSolveInput(rearRequest);
  const coupled = coupledPair(compiledVehicle, frontRequest, rearRequest, coupledInertia, workspace);
  frontRequest = coupled.front;
  rearRequest = coupled.rear;
  coupledInertia = coupled.inertia;
  const slot = workspace.first;
  const frontFraction = compiledVehicle.frontDriveTorqueFraction;
  let lower = -Infinity;
  const { wheelSlip } = policy;
  if (wheelSlip.drive) {
    if (frontFraction > 0)
      lower = Math.max(
        lower,
        msrDriveTorqueBound(frontRequest, wheelSlip.brake, slot.tire, slot.residual) / frontFraction,
      );
    if (frontFraction < 1)
      lower = Math.max(
        lower,
        msrDriveTorqueBound(rearRequest, wheelSlip.brake, slot.tire, slot.residual) / (1 - frontFraction),
      );
  }
  out.lower = engineTorqueForDrive(
    compiledVehicle,
    body,
    front,
    rear,
    frontRequest,
    rearRequest,
    policy,
    lower,
    coupledInertia,
    slot,
  );
  out.upper = driveTorqueUpperBound(
    compiledVehicle,
    body,
    front,
    rear,
    frontRequest,
    rearRequest,
    policy,
    requestedDriveTorque,
    coupledInertia,
    observeRoadPitch(body, front, rear, workspace.pitch, workspace.pitchScratch),
    slot,
    workspace.inertiaTorque,
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
  coupledInertia: number,
  pitch: RoadPitch,
  slot: PairCandidate,
  guess: { value: number },
): number {
  const frontFraction = compiledVehicle.frontDriveTorqueFraction;
  let upperDrive = Infinity;
  const { wheelSlip } = policy;
  if (wheelSlip.drive) {
    if (frontFraction > 0)
      upperDrive = Math.min(
        upperDrive,
        tcsDriveTorqueBound(frontRequest, wheelSlip.brake, slot.tire, slot.residual) / frontFraction,
      );
    if (frontFraction < 1)
      upperDrive = Math.min(
        upperDrive,
        tcsDriveTorqueBound(rearRequest, wheelSlip.brake, slot.tire, slot.residual) / (1 - frontFraction),
      );
  }
  const engineTorqueFor = (drive: number) =>
    engineTorqueForDrive(
      compiledVehicle,
      body,
      front,
      rear,
      frontRequest,
      rearRequest,
      policy,
      drive,
      coupledInertia,
      slot,
    );
  const upper = engineTorqueFor(upperDrive);
  const requested = Math.min(requestedDriveTorque, upper);
  if (!(requested > 0) || !pitch.active) return upper;
  const safe = (value: ProtectedWheelPair) =>
    pitchMargin(compiledVehicle, body, pitch, value.wrench, policy.pitchLimit, 1) >= 0;
  const atEngineTorque = (engineTorque: number) =>
    evaluateEnginePair(
      compiledVehicle,
      body,
      front,
      rear,
      frontRequest,
      rearRequest,
      policy,
      engineTorque,
      coupledInertia,
      1,
      slot,
      guess,
    );
  const deliveredDrive = (engineTorque: number, value: ProtectedWheelPair) =>
    engineTorque - coupledInertiaTorque(compiledVehicle, value, coupledInertia);
  const requestedPair = atEngineTorque(requested);
  if (safe(requestedPair)) return upper;
  let unsafe = deliveredDrive(requested, requestedPair);
  const closedPair = atEngineTorque(0);
  if (!safe(closedPair)) return 0;
  let lower = deliveredDrive(0, closedPair);
  for (let i = 0; i < PITCH_BISECTION_ITERATIONS; i++) {
    const drive = (lower + unsafe) * 0.5;
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
    if (safe(value)) lower = drive;
    else unsafe = drive;
  }
  return engineTorqueFor(lower);
}

/**
 * One wheel-pair solve with the powertrain's engine term delivered as requested, the locked engine's
 * `coupledInertia` included. ABS limits each brake; the nose-down side of pitch protection bisects one brake scale
 * until the pitch barrier holds. Every trial uses the unchanged solve and wrench.
 */
export function solveProtectedWheelPair(
  compiledVehicle: CompiledVehicle,
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  frontRequest: WheelSolveInput,
  rearRequest: WheelSolveInput,
  policy: TorqueProtectionPolicy,
  engineTorque: number,
  coupledInertia: number,
  workspace: ReturnType<typeof createProtectedWheelPairWorkspace>,
): ProtectedWheelPair {
  // The requests were checked by solveDriveTorqueBounds; only the powertrain's engine term is new.
  if (!Number.isFinite(engineTorque)) throw new RangeError('drive torque must be finite');
  const coupled = coupledPair(compiledVehicle, frontRequest, rearRequest, coupledInertia, workspace);
  frontRequest = coupled.front;
  rearRequest = coupled.rear;
  coupledInertia = coupled.inertia;
  let acceptedSlot = workspace.first,
    trialSlot = workspace.second;
  const evaluate = (brakeScale: number, slot: PairCandidate) =>
    evaluateEnginePair(
      compiledVehicle,
      body,
      front,
      rear,
      frontRequest,
      rearRequest,
      policy,
      engineTorque,
      coupledInertia,
      brakeScale,
      slot,
      workspace.inertiaTorque,
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
