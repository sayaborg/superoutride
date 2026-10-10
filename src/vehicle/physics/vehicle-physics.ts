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
import { effectiveTireLoad, lateralSlipAtDemand } from './tire-friction-calibration.js';
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

/** m/s: smooth the travel-direction steering angle at standstill. */
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

const NO_EXTERNAL_FORCE: Readonly<Vec3> = Object.freeze({ x: 0, y: 0, z: 0 });

/**
 * One fixed step of a vehicle. A `held` vehicle, as in a race's READY phase, is constrained explicitly: its body and
 * wheels keep their pose and motion and its gear holds, while its actuators follow the input and its powertrain runs
 * with the clutch open (zero capacity), so the engine revs freely with the throttle under its ordinary law, fuel cut
 * and idle holding still bounding the opening. The next free step uses the fixed capacity again.
 * `externalForce` is a world force (N) from outside the vehicle, held through the step: it acts at the centre of mass,
 * so it adds no moment, and every substep integrates it with the vehicle's own forces. A held vehicle ignores it.
 */
export function updateVehicle(
  { coordinates, height, surfaces }: VehicleWorld,
  vehicle: VehicleState,
  model: VehicleModel,
  input: DrivingInput,
  held = false,
  externalForce: Readonly<Vec3> = NO_EXTERNAL_FORCE,
): void {
  assertExclusivePedalInput(input);
  const { compiledVehicle, substep } = model;
  const workspace = stepWorkspace(vehicle, model);
  if (held) {
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
    return;
  }
  const velocityBeforeX = vehicle.velocityX,
    velocityBeforeY = vehicle.velocityY,
    velocityBeforeZ = vehicle.velocityZ;
  const { maxRoadWheelSteer, reference, utilization, limitDemand } = model.steering;
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
      model.suspensionProgression,
      vehicle.frontSteerAngle,
      vehicle.course.s,
      workspace.front,
    );
    // The driver's input is a fraction of the steering limit: the front tire's pure-lateral slip at the steering
    // utilization on the material under the front wheel (unit grip where there is none), as an angle from the travel
    // direction of the reference point. `turn` adds the front axle's angle on the tightest steady flat turn at the
    // utilization and the current speed.
    const grip = frontBeforeSteer.surface.material?.gripFactor ?? 1;
    const travelDirection = vehicleTravelDirection(
      body,
      reference === 'front' ? frontBeforeSteer.reachVelocity : body.velocity,
      STEERING_LOW_SPEED_REGULARIZATION,
    );
    const slipAngle = Math.atan(lateralSlipAtDemand(model.tire, grip, limitDemand));
    const limit = Math.min(
      maxRoadWheelSteer,
      reference === 'turn'
        ? slipAngle +
            steadyTurnFrontAngle(
              body,
              compiledVehicle.frontAxle,
              utilization * grip * model.tire.muY * VEHICLE_GRAVITY,
              STEERING_LOW_SPEED_REGULARIZATION,
            )
        : slipAngle,
    );
    const automaticMax = maxRoadWheelSteer - limit;
    vehicle.frontSteerAngle = clamp(travelDirection, -automaticMax, automaticMax) + vehicle.actuator.steering * limit;
    const front = reorientContactObservation(frontBeforeSteer, body, vehicle.frontSteerAngle, workspace.front);
    const rear = deriveContactObservation(
      coordinates,
      height,
      surfaces,
      body,
      compiledVehicle.rearStation,
      model.suspensionProgression,
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
      model.torqueProtection,
      Math.max(0, powertrainWheelTorque(powertrainStep, boundedOpening(powertrainStep, requestedOpening))),
      workspace.pair,
      workspace.driveTorqueBounds,
    );
    const driveTorque = completeAutomaticPowertrain(
      vehicle.powertrain,
      powertrainStep,
      requestedOpening,
      driveTorqueBounds,
    );
    // Signed drive torque, engine braking included, reaches the wheels untrimmed.
    frontRequest.driveTorque = driveTorque * compiledVehicle.frontDriveTorqueFraction;
    rearRequest.driveTorque = driveTorque - frontRequest.driveTorque;
    const resolved = solveProtectedWheelPair(
      compiledVehicle,
      body,
      front,
      rear,
      frontRequest,
      rearRequest,
      model.torqueProtection,
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
      recordVehicleTireObservation(vehicle.tires, front, frontWheel, rear, rearWheel);
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

const UNBOUNDED_DRIVE = Object.freeze({ upper: Infinity, lower: -Infinity });

/**
 * The front axle's angle `atan(frontAxle/Rmin)` on the tightest steady turn at the body's planar speed, where
 * `Rmin = V^2/lateralAcceleration` with `V^2` regularized at standstill.
 */
function steadyTurnFrontAngle(
  body: BodyKinematics,
  frontAxle: number,
  lateralAcceleration: number,
  lowSpeedRegularization: number,
): number {
  const longitudinal = dot3(body.velocity, body.forward);
  const lateral = dot3(body.velocity, body.right);
  return Math.atan(
    (frontAxle * lateralAcceleration) /
      (longitudinal * longitudinal + lateral * lateral + lowSpeedRegularization * lowSpeedRegularization),
  );
}

/** The travel direction of a point moving at `velocity`, in the body-pitch plane; finite and zero at rest. */
function vehicleTravelDirection(body: BodyKinematics, velocity: Vec3, lowSpeedRegularization: number): number {
  const longitudinal = dot3(velocity, body.forward);
  const lateral = dot3(velocity, body.right);
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

const stepWorkspaces = new WeakMap<VehicleState, ReturnType<typeof createStepWorkspace>>();
function stepWorkspace(vehicle: VehicleState, model: VehicleModel) {
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
