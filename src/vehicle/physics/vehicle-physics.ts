import { createSurfaceGeometryWorkspace, sampleSurfaceGeometryAtCoordinate } from './vehicle-surface-sampling.js';
import { createPlanProjectionWorkspace } from '../../course/geometry/plan-coordinate.js';
import { type Writable } from '../../core/writable.js';
import {
  createVehicleTireObservation,
  recordVehicleTireObservation,
  type VehicleTireObservation,
} from './vehicle-tire-observation.js';
import { clamp, wrapAngle } from '../../core/math.js';
import { assertExclusivePedalInput, type DrivingInput } from '../driving-input.js';
import {
  boundedOpening,
  completeAutomaticPowertrain,
  createAutomaticPowertrainState,
  createPowertrainStep,
  powertrainWheelTorque,
  prepareAutomaticPowertrain,
} from './automatic-powertrain.js';
import { createDrivingActuatorState, updateDrivingActuators, type DrivingActuatorState } from './driving-actuator.js';
import type { WheelSolveInput } from './tire-wheel.js';
import { VEHICLE_SUBSTEPS, type VehicleModel } from './vehicle-model.js';
import type { DriverSteering } from './vehicle-calibration.js';
import { effectiveTireLoad, lateralSlipAtDemand, radialKneeInverse } from './tire-friction-calibration.js';
import type { VehicleWorld } from '../../course/vehicle-world.js';
import {
  bodyFrameVelocity,
  createVehicleControlObservation,
  initializePlanCoordinateObservation,
  refreshPlanCoordinateObservation,
  vehicleSpeed,
  type BodyKinematics,
  type VehicleDynamicsState,
  VEHICLE_GRAVITY,
} from './vehicle-state.js';
import { createContactWorkspace, deriveContactObservation, reorientContactObservation } from './vehicle-contact.js';
import { applySuspensionBumpStops, createBumpStopWorkspace } from './suspension-bump-stop.js';

/**
 * m/s: smooth the travel-direction steering angle at standstill. A value the author chose, not derived: it decides how
 * the front wheel turns at walking pace (docs/vehicle-physics.md).
 */
const STEERING_LOW_SPEED_REGULARIZATION = 1.0;
import { WORLD_UP, add3, cross3, dot3, normalize3, scale3, type Vec3 } from '../../core/vector3.js';
import { drivenWheelOmega } from './vehicle-definitions.js';
import {
  createDriveTorqueBounds,
  solveDriveTorqueBounds,
  solveProtectedWheelPair,
  createProtectedWheelPairWorkspace,
} from './torque-protection.js';

/** Dynamic values and observations only; the vehicle model supplies every definition value. */
export interface VehicleState extends VehicleDynamicsState {
  yaw: number;
  pitch: number;
  yawRate: number;
  pitchRate: number;
  frontSteerAngle: number;
  frontWheelOmega: number;
  rearWheelOmega: number;
  readonly actuator: DrivingActuatorState;
  /** Tire observations of the last substep of every update; recovery reinitializes them. */
  readonly tires: VehicleTireObservation;

  readonly speed: number;
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
  readonly steerAngle: number;
  readonly supported: boolean;
  readonly sprungPitch: number;
  /** Observation: CG height minus the model's desired CG height, written with every pose change. */
  renderY: number;
}

interface VehicleSpawnOptions {
  readonly s: number;
  readonly l: number;
  readonly initialSpeed: number;
}

/**
 * The one check of a spawn or recovery target: (s, l) lies within the coordinate domain and on a surface
 * material. Targets are race-made, so a violation is an internal invariant failure.
 */
export function supportedTargetSurface({ coordinates, height, surfaces }: VehicleWorld, s: number, l: number) {
  const bounds = coordinates.domain.lateralAt(s, { left: 0, right: 0 });
  if (!(l >= bounds.left && l <= bounds.right))
    throw new Error(`driving target (${s}, ${l}) lies outside the coordinate domain`);
  const surface = sampleSurfaceGeometryAtCoordinate(
    coordinates,
    height,
    surfaces,
    { s, l, inDomain: true },
    createSurfaceGeometryWorkspace(),
  );
  if (surface.material === null) throw new Error(`driving target (${s}, ${l}) has no surface material`);
  return surface;
}

export function createVehicle(
  model: VehicleModel,
  world: VehicleWorld,
  { s, l, initialSpeed }: VehicleSpawnOptions,
): VehicleState {
  const { compiledVehicle } = model;
  const { coordinates } = world;
  const surface = supportedTargetSurface(world, s, l);
  const yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z);
  const pitch = surface.gradeAngle;
  const position = add3(surface.point, scale3(surface.normal, compiledVehicle.desiredCgHeight));
  const initialVelocity = scale3(surface.tangent, initialSpeed);
  const frontOmega = initialSpeed / compiledVehicle.frontStation.rollingRadius;
  const rearOmega = initialSpeed / compiledVehicle.rearStation.rollingRadius;
  const state = {
    x: position.x,
    y: position.y,
    z: position.z,
    velocityX: initialVelocity.x,
    velocityY: initialVelocity.y,
    velocityZ: initialVelocity.z,
    yaw,
    pitch,
    yawRate: 0,
    pitchRate: 0,
    frontSteerAngle: 0,
    frontWheelOmega: frontOmega,
    rearWheelOmega: rearOmega,
    actuator: createDrivingActuatorState(),
    course: initializePlanCoordinateObservation(coordinates, position.x, position.z, s),
    longitudinalAcceleration: 0,
    lateralAcceleration: 0,
    control: createVehicleControlObservation(),
    powertrain: createAutomaticPowertrainState(
      compiledVehicle.powertrain,
      model.powertrain,
      drivenWheelOmega(compiledVehicle, frontOmega, rearOmega),
    ),
    tires: createVehicleTireObservation(),
  } as VehicleState;
  installVehicleDerivedAccessors(state);
  publishVehicleRenderY(state, model);
  return state;
}

/** Refreshes the render-height observation after any pose change outside an update. */
export function publishVehicleRenderY(vehicle: VehicleState, model: VehicleModel): void {
  vehicle.renderY = vehicle.y - model.compiledVehicle.desiredCgHeight;
}

/** What a held vehicle's update reads and writes: its actuators, powertrain, wheel speeds and control observation. */
export type HeldVehicleState = Pick<
  VehicleState,
  'actuator' | 'powertrain' | 'frontWheelOmega' | 'rearWheelOmega' | 'control'
>;

/** A vehicle standing still with its engine at idle, to be held, as SELECT VEHICLE's ENGINE page revs it. */
export function createHeldVehicle(model: VehicleModel): HeldVehicleState {
  return {
    actuator: createDrivingActuatorState(),
    powertrain: createAutomaticPowertrainState(model.compiledVehicle.powertrain, model.powertrain),
    frontWheelOmega: 0,
    rearWheelOmega: 0,
    control: createVehicleControlObservation(),
  };
}

/**
 * One fixed step of a held vehicle: its body and wheels keep their pose and motion and its gear holds, while its
 * actuators follow the input and its powertrain runs with the clutch open (zero capacity), so the engine revs freely
 * with the throttle under its ordinary law, fuel cut and idle holding still bounding the opening. A race's READY phase
 * holds its vehicles through `updateVehicle`, which steps them here; SELECT VEHICLE's ENGINE page revs its engine here.
 */
export function updateHeldVehicle(vehicle: HeldVehicleState, model: VehicleModel, input: DrivingInput): void {
  assertExclusivePedalInput(input);
  const { compiledVehicle, substep } = model;
  const workspace = stepWorkspace(vehicle, model);
  for (let step = 0; step < VEHICLE_SUBSTEPS; step += 1) {
    updateDrivingActuators(vehicle.actuator, input, substep, model.actuator);
    const powertrainStep = prepareAutomaticPowertrain(
      vehicle.powertrain,
      compiledVehicle.powertrain,
      model.powertrain,
      drivenWheelOmega(compiledVehicle, vehicle.frontWheelOmega, vehicle.rearWheelOmega),
      false,
      substep,
      workspace.powertrain,
      0,
    );
    completeAutomaticPowertrain(vehicle.powertrain, powertrainStep, vehicle.actuator.throttle, UNBOUNDED_DRIVE);
  }
  vehicle.control.throttleActuator = vehicle.actuator.throttle;
  vehicle.control.brakeActuator = vehicle.actuator.brake;
  vehicle.control.frontBrakeApplied = 1;
  vehicle.control.rearBrakeApplied = 1;
}

const NO_EXTERNAL_FORCE: Readonly<Vec3> = Object.freeze({ x: 0, y: 0, z: 0 });

/**
 * One fixed step of a vehicle. A `held` vehicle, as in a race's READY phase, is constrained explicitly: it takes
 * `updateHeldVehicle`'s step. The next free step uses the fixed capacity again.
 * `externalForce` is a world force (N) from outside the vehicle, held through the step: it acts at the centre of mass,
 * so it adds no moment, and every substep integrates it with the vehicle's own forces. A held vehicle ignores it.
 * `steering` is the rule of whoever drives the vehicle this step: its steering and its torque protection.
 */
export function updateVehicle(
  { coordinates, height, surfaces }: VehicleWorld,
  vehicle: VehicleState,
  model: VehicleModel,
  input: DrivingInput,
  steering: DriverSteering,
  held = false,
  externalForce: Readonly<Vec3> = NO_EXTERNAL_FORCE,
): void {
  assertExclusivePedalInput(input);
  const { compiledVehicle, substep } = model;
  if (held) {
    updateHeldVehicle(vehicle, model, input);
    return;
  }
  const workspace = stepWorkspace(vehicle, model);
  const velocityBeforeX = vehicle.velocityX,
    velocityBeforeY = vehicle.velocityY,
    velocityBeforeZ = vehicle.velocityZ;
  const { maxRoadWheelSteer } = model.steering;
  const { lever, utilization } = steering;
  let shiftAvailable = true;

  for (let step = 0; step < VEHICLE_SUBSTEPS; step += 1) {
    updateDrivingActuators(vehicle.actuator, input, substep, model.actuator);
    const body = vehicleBodyKinematics(vehicle, workspace.body);
    const frontBeforeSteer = deriveContactObservation(
      coordinates,
      height,
      surfaces,
      body,
      compiledVehicle.frontStation,
      vehicle.frontSteerAngle,
      vehicle.course.s,
      workspace.front,
    );
    // The driver's input sets the front tire's pure-lateral slip at the steering utilization on the material under the
    // front wheel (unit grip where there is none), measured from the front reach point's travel direction; the lever
    // turns that direction back by the yaw rate's departure from the steady flat turn the input asks for, a part of the
    // tightest one the vehicle holds within its grip and its rack.
    const grip = frontBeforeSteer.surface.material?.gripFactor ?? 1;
    const limit = steeringSlip(model, steering, grip, 1);
    const automaticMax = maxRoadWheelSteer - limit;
    const askedYawRate =
      vehicle.actuator.steering *
      tightestSteadyYawRate(
        dot3(body.velocity, body.forward),
        dot3(body.velocity, body.right),
        utilization * grip * model.tire.muY * VEHICLE_GRAVITY,
        automaticMax,
        compiledVehicle.frontAxle + compiledVehicle.rearAxle,
      );
    const travelDirection = vehicleTravelDirection(
      body,
      frontBeforeSteer.reachVelocity,
      lever * (vehicle.yawRate - askedYawRate),
      STEERING_LOW_SPEED_REGULARIZATION,
    );
    vehicle.frontSteerAngle =
      clamp(travelDirection, -automaticMax, automaticMax) +
      steeringSlip(model, steering, grip, vehicle.actuator.steering);
    const front = reorientContactObservation(frontBeforeSteer, body, vehicle.frontSteerAngle, workspace.front);
    const rear = deriveContactObservation(
      coordinates,
      height,
      surfaces,
      body,
      compiledVehicle.rearStation,
      0,
      vehicle.course.s,
      workspace.rear,
    );

    const gearBefore = vehicle.powertrain.gear;
    const powertrainStep = prepareAutomaticPowertrain(
      vehicle.powertrain,
      compiledVehicle.powertrain,
      model.powertrain,
      drivenWheelOmega(compiledVehicle, vehicle.frontWheelOmega, vehicle.rearWheelOmega),
      shiftAvailable,
      substep,
      workspace.powertrain,
    );
    if (vehicle.powertrain.gear !== gearBefore) shiftAvailable = false;
    const frontRequest = workspace.frontRequest;
    frontRequest.omegaPrevious = vehicle.frontWheelOmega;
    frontRequest.inertia = compiledVehicle.frontStation.wheelInertia;
    frontRequest.rollingRadius = front.effectiveRollingRadius;
    frontRequest.longitudinalVelocity = front.longitudinalVelocity;
    frontRequest.lateralVelocity = front.lateralVelocity;
    // The wheel solve reads the tire's effective load; suspension and body keep the contact's normal load.
    frontRequest.normalLoad = front.tireFrameValid
      ? effectiveTireLoad(model.tire, front.normalLoad, compiledVehicle.frontStation.suspension.staticLoad)
      : 0;
    frontRequest.gripFactor = front.surface.material?.gripFactor ?? 0;
    frontRequest.characteristics = model.tire;
    frontRequest.rollingResistance = front.tireFrameValid ? (front.surface.material?.rollingResistance ?? 0) : 0;
    frontRequest.driveTorque = 0;
    frontRequest.brakeTorque = vehicle.actuator.brake * compiledVehicle.frontStation.maxBrakeTorque;
    frontRequest.dt = substep;
    const rearRequest = workspace.rearRequest;
    rearRequest.omegaPrevious = vehicle.rearWheelOmega;
    rearRequest.inertia = compiledVehicle.rearStation.wheelInertia;
    rearRequest.rollingRadius = rear.effectiveRollingRadius;
    rearRequest.longitudinalVelocity = rear.longitudinalVelocity;
    rearRequest.lateralVelocity = rear.lateralVelocity;
    rearRequest.normalLoad = rear.tireFrameValid
      ? effectiveTireLoad(model.tire, rear.normalLoad, compiledVehicle.rearStation.suspension.staticLoad)
      : 0;
    rearRequest.gripFactor = rear.surface.material?.gripFactor ?? 0;
    rearRequest.characteristics = model.tire;
    rearRequest.rollingResistance = rear.tireFrameValid ? (rear.surface.material?.rollingResistance ?? 0) : 0;
    rearRequest.driveTorque = 0;
    rearRequest.brakeTorque = vehicle.actuator.brake * compiledVehicle.rearStation.maxBrakeTorque;
    rearRequest.dt = substep;

    // The tires bound drive torque first; the bounds only limit the effective opening.
    const requestedOpening = vehicle.actuator.throttle;
    const driveTorqueBounds = solveDriveTorqueBounds(
      compiledVehicle,
      body,
      front,
      rear,
      frontRequest,
      rearRequest,
      steering.torqueProtection,
      Math.max(0, powertrainWheelTorque(powertrainStep, boundedOpening(powertrainStep, requestedOpening))),
      powertrainStep.coupledInertia,
      workspace.pair,
      workspace.driveTorqueBounds,
    );
    const driveTorque = completeAutomaticPowertrain(
      vehicle.powertrain,
      powertrainStep,
      requestedOpening,
      driveTorqueBounds,
    );
    // Signed drive torque, engine braking included, reaches the wheels untrimmed, the locked engine's inertia with it.
    const resolved = solveProtectedWheelPair(
      compiledVehicle,
      body,
      front,
      rear,
      frontRequest,
      rearRequest,
      steering.torqueProtection,
      driveTorque,
      powertrainStep.coupledInertia,
      workspace.pair,
    );
    const { frontWheel, rearWheel } = resolved;
    vehicle.frontWheelOmega = frontWheel.omega;
    vehicle.rearWheelOmega = rearWheel.omega;

    const { force: totalForce, moment: totalMoment } = resolved.wrench;

    vehicle.velocityX += ((totalForce.x + externalForce.x) / compiledVehicle.mass) * substep;
    vehicle.velocityY += ((totalForce.y + externalForce.y) / compiledVehicle.mass) * substep;
    vehicle.velocityZ += ((totalForce.z + externalForce.z) / compiledVehicle.mass) * substep;
    vehicle.yawRate += (totalMoment.y / compiledVehicle.yawInertia) * substep;
    vehicle.pitchRate -= (dot3(totalMoment, body.right) / compiledVehicle.pitchInertia) * substep;
    applySuspensionBumpStops(vehicle, compiledVehicle, body, front, rear, substep, workspace.bumpStop);
    vehicle.x += vehicle.velocityX * substep;
    vehicle.y += vehicle.velocityY * substep;
    vehicle.z += vehicle.velocityZ * substep;
    vehicle.yaw = wrapAngle(vehicle.yaw + vehicle.yawRate * substep);
    vehicle.pitch = wrapAngle(vehicle.pitch + vehicle.pitchRate * substep);
    refreshPlanCoordinateObservation(coordinates, vehicle, workspace.projection);

    // Output-only cache: observers consume one completed outer update, never an inner trial.
    if (step === VEHICLE_SUBSTEPS - 1) {
      vehicle.control.steeringActuator = vehicle.actuator.steering;
      vehicle.control.throttleActuator = vehicle.actuator.throttle;
      vehicle.control.brakeActuator = vehicle.actuator.brake;
      vehicle.control.frontBrakeApplied = appliedShare(resolved.frontInput.brakeTorque, frontRequest.brakeTorque);
      vehicle.control.rearBrakeApplied = appliedShare(resolved.rearInput.brakeTorque, rearRequest.brakeTorque);
      recordVehicleTireObservation(vehicle.tires, model.tire.rhoKnee, front, frontWheel, rear, rearWheel);
    }
  }
  const velocityDelta = workspace.velocityDelta;
  velocityDelta.x = vehicle.velocityX - velocityBeforeX;
  velocityDelta.y = vehicle.velocityY - velocityBeforeY;
  velocityDelta.z = vehicle.velocityZ - velocityBeforeZ;
  const finalBody = vehicleBodyKinematics(vehicle, workspace.body);
  vehicle.longitudinalAcceleration = dot3(velocityDelta, finalBody.forward) / model.step;
  vehicle.lateralAcceleration = dot3(velocityDelta, finalBody.right) / model.step;
  publishVehicleRenderY(vehicle, model);
}

/** The share of a requested brake torque that is applied; 1 without a request. */
function appliedShare(applied: number, requested: number): number {
  return requested > 0 ? Math.min(1, applied / requested) : 1;
}

const UNBOUNDED_DRIVE = Object.freeze({ upper: Infinity, lower: -Infinity });

/**
 * The front tire's pure-lateral slip angle that steering input `input` asks under `steering` on `grip`, within the rack:
 * the slip at which its lateral force is the part `|input| X` of its bound, the part of the yaw rate the input asks, with
 * the input's sign. Full input gives the rule's limit `L`.
 */
function steeringSlip(model: VehicleModel, steering: DriverSteering, grip: number, input: number): number {
  const demand = radialKneeInverse(model.tire.rhoKnee, Math.abs(input) * steering.utilization);
  return (
    Math.sign(input) *
    Math.min(model.steering.maxRoadWheelSteer, Math.atan(lateralSlipAtDemand(model.tire, grip, demand)))
  );
}

/**
 * The yaw rate of the tightest steady turn on flat ground at forward speed `forward` and lateral speed `lateral`: the
 * looser of the grip's turn, at the lateral acceleration `lateralAcceleration`, and the rack's, in which the front
 * wheel's travel direction with the rear wheel rolling stands at `rackAngle` (`tan(rackAngle) = wheelbase*w/forward`).
 * Speeds are regularized at standstill.
 */
function tightestSteadyYawRate(
  forward: number,
  lateral: number,
  lateralAcceleration: number,
  rackAngle: number,
  wheelbase: number,
): number {
  const grip = lateralAcceleration / Math.hypot(forward, lateral, STEERING_LOW_SPEED_REGULARIZATION);
  const rack = (Math.hypot(forward, STEERING_LOW_SPEED_REGULARIZATION) * Math.tan(rackAngle)) / wheelbase;
  return Math.min(grip, rack);
}

/**
 * The yaw rate full steering input asks of `model`'s vehicle under `steering` at forward speed `forward` and lateral
 * speed `lateral` (m/s) on a front surface of `grip`: the step reads an input as that part of it. A driver inverts it.
 */
export function fullSteeringYawRate(
  model: VehicleModel,
  steering: DriverSteering,
  grip: number,
  forward: number,
  lateral: number,
): number {
  const { compiledVehicle } = model;
  return tightestSteadyYawRate(
    forward,
    lateral,
    steering.utilization * grip * model.tire.muY * VEHICLE_GRAVITY,
    model.steering.maxRoadWheelSteer - steeringSlip(model, steering, grip, 1),
    compiledVehicle.frontAxle + compiledVehicle.rearAxle,
  );
}

/**
 * The travel direction of a point moving at `velocity`, its lateral speed less `lateralOffset`, in the body-pitch plane;
 * finite and zero at rest.
 */
function vehicleTravelDirection(
  body: BodyKinematics,
  velocity: Vec3,
  lateralOffset: number,
  lowSpeedRegularization: number,
): number {
  const longitudinal = dot3(velocity, body.forward);
  const lateral = dot3(velocity, body.right) - lateralOffset;
  return Math.atan2(lateral, Math.hypot(longitudinal, lowSpeedRegularization));
}

export function createBodyKinematicsWorkspace() {
  const v = () => ({ x: 0, y: 0, z: 0 });
  return { position: v(), velocity: v(), right: v(), up: v(), forward: v(), omegaWorld: v() };
}
export function vehicleBodyKinematics(
  vehicle: VehicleState,
  out: ReturnType<typeof createBodyKinematicsWorkspace>,
): BodyKinematics {
  const sinYaw = Math.sin(vehicle.yaw),
    cosYaw = Math.cos(vehicle.yaw);
  const sinPitch = Math.sin(vehicle.pitch),
    cosPitch = Math.cos(vehicle.pitch);
  const { right, forward, up, omegaWorld } = out;
  right.x = cosYaw;
  right.y = 0;
  right.z = -sinYaw;
  forward.x = sinYaw * cosPitch;
  forward.y = sinPitch;
  forward.z = cosYaw * cosPitch;
  normalize3(forward, forward);
  normalize3(cross3(forward, right, up), up);
  omegaWorld.x = WORLD_UP.x * vehicle.yawRate + right.x * -vehicle.pitchRate;
  omegaWorld.y = WORLD_UP.y * vehicle.yawRate + right.y * -vehicle.pitchRate;
  omegaWorld.z = WORLD_UP.z * vehicle.yawRate + right.z * -vehicle.pitchRate;
  out.position.x = vehicle.x;
  out.position.y = vehicle.y;
  out.position.z = vehicle.z;
  out.velocity.x = vehicle.velocityX;
  out.velocity.y = vehicle.velocityY;
  out.velocity.z = vehicle.velocityZ;
  return out;
}

const stepWorkspaces = new WeakMap<HeldVehicleState, ReturnType<typeof createStepWorkspace>>();
function stepWorkspace(vehicle: HeldVehicleState, model: VehicleModel) {
  let workspace = stepWorkspaces.get(vehicle);
  if (!workspace) {
    workspace = createStepWorkspace(model);
    stepWorkspaces.set(vehicle, workspace);
  }
  return workspace;
}
function createStepWorkspace(model: VehicleModel) {
  const front = createContactWorkspace(model.compiledVehicle.frontStation),
    rear = createContactWorkspace(model.compiledVehicle.rearStation);
  const request = (characteristics: WheelSolveInput['characteristics']): Writable<WheelSolveInput> => ({
    omegaPrevious: 0,
    inertia: 1,
    rollingRadius: 1,
    longitudinalVelocity: 0,
    lateralVelocity: 0,
    normalLoad: 0,
    gripFactor: 0,
    rollingResistance: 0,
    driveTorque: 0,
    brakeTorque: 0,
    dt: 1,
    characteristics,
  });
  const frontRequest = request(model.tire),
    rearRequest = request(model.tire);
  return {
    projection: createPlanProjectionWorkspace(),
    velocityDelta: { x: 0, y: 0, z: 0 },
    body: createBodyKinematicsWorkspace(),
    front,
    rear,
    frontRequest,
    rearRequest,
    pair: createProtectedWheelPairWorkspace(frontRequest, rearRequest),
    powertrain: createPowertrainStep(),
    driveTorqueBounds: createDriveTorqueBounds(),
    bumpStop: createBumpStopWorkspace(),
  };
}

const derivedWorkspaces = new WeakMap<VehicleState, ReturnType<typeof createBodyKinematicsWorkspace>>();
// Shared accessor functions retain identical public descriptors and a common object layout across actors.
const derivedProperties: PropertyDescriptorMap = {
  speed: {
    enumerable: true,
    get(this: VehicleState) {
      return vehicleSpeed(this);
    },
  },
  longitudinalSpeed: {
    enumerable: true,
    get(this: VehicleState) {
      const body = vehicleBodyKinematics(this, derivedWorkspaces.get(this)!);
      return bodyFrameVelocity(this, body.forward, body.right).longitudinal;
    },
  },
  lateralSpeed: {
    enumerable: true,
    get(this: VehicleState) {
      const body = vehicleBodyKinematics(this, derivedWorkspaces.get(this)!);
      return bodyFrameVelocity(this, body.forward, body.right).lateral;
    },
  },
  steerAngle: {
    enumerable: true,
    get(this: VehicleState) {
      return this.frontSteerAngle;
    },
  },
  supported: {
    enumerable: true,
    get(this: VehicleState) {
      return this.tires.front.load > 0 || this.tires.rear.load > 0;
    },
  },
  sprungPitch: {
    enumerable: true,
    get(this: VehicleState) {
      return this.pitch;
    },
  },
  renderY: {
    enumerable: true,
    writable: true,
    value: 0,
  },
};
function installVehicleDerivedAccessors(vehicle: VehicleState): VehicleState {
  derivedWorkspaces.set(vehicle, createBodyKinematicsWorkspace());
  Object.defineProperties(vehicle, derivedProperties);
  return vehicle;
}
