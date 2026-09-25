import type { CompiledDrivingDefinition } from '../compiled-driving-definition.js';
import { TIRE_LOW_SPEED_REGULARIZATION, STEERING_LOW_SPEED_REGULARIZATION } from './numerical-constants.js';
import { createSurfaceGeometryWorkspace } from './vehicle-dynamics.js';
import { createPlanProjectionWorkspace } from '../../course/geometry/plan-coordinate.js';
import { type Writable } from '../../core/writable.js';
import { publishVehicleTireObservation } from './vehicle-tire-observation.js';
import { clamp, wrapAngle } from '../../core/math.js';
import type { DrivingInput } from '../driving-input.js';
import { createAutomaticPowertrainState, updateAutomaticPowertrain } from './automatic-powertrain.js';
import {
  createDrivingActuatorState,
  updateDrivingActuators,
  type DrivingActuatorState,
  type DrivingActuatorDefinition,
} from './driving-actuator.js';
import { createSteeringLimitWorkspace, limitSteeringInput } from './steering-input-limiter.js';
import { type VehicleTireFrictionCalibrationState } from './tire-friction-calibration.js';
import { regularizedTireSlipAngle, type WheelSolveInput } from './tire-wheel.js';
import {
  steeringAutomaticMax,
  type VehicleSteeringCalibrationInput,
  type VehicleSteeringCalibrationState,
} from './vehicle-calibration.js';
import type { VehicleWorld } from '../../course/vehicle-world.js';
import {
  VEHICLE_SUBSTEPS,
  bodyFrameVelocity,
  createVehicleControlState,
  createContactWorkspace,
  deriveContactObservation,
  initializePlanCoordinateObservation,
  refreshPlanCoordinateObservation,
  reorientContactObservation,
  representativeSurfaceType,
  sampleSurfaceGeometryAtCoordinate,
  vehicleSpeed,
  type BodyKinematics,
  type ContactObservation,
  type VehicleDynamicsState,
} from './vehicle-dynamics.js';
import { WORLD_UP, add3, cross3, dot3, normalize3, scale3 } from '../../core/vector3.js';
import { drivenWheelOmega, type CompiledVehicle } from './vehicle-definitions.js';
import {
  resolveTorqueProtectionPolicy,
  solveProtectedWheelPair,
  createProtectedWheelPairWorkspace,
  type TorqueProtectionPolicy,
} from './torque-protection.js';

/** One authoritative state shape for every compiled vehicle. */
export interface VehicleState extends VehicleDynamicsState {
  readonly compiledVehicle: CompiledVehicle;
  readonly drivingActuator: DrivingActuatorDefinition;
  yaw: number;
  pitch: number;
  yawRate: number;
  pitchRate: number;
  frontSteerAngle: number;
  /** Sole current runtime authority for the selectable M/D/T steering calibration. */
  readonly steeringCalibration: VehicleSteeringCalibrationState;
  /** Sole runtime authority for the selected tire characteristic calibration. */
  tireFrictionCalibration: Readonly<VehicleTireFrictionCalibrationState>;
  frontWheelOmega: number;
  rearWheelOmega: number;
  readonly actuator: DrivingActuatorState;
  readonly torqueProtection: Readonly<TorqueProtectionPolicy>;

  /** Derived-output caches only; the next mechanics solve never consumes them as authority. */
  frontNormalLoad: number;
  rearNormalLoad: number;
  frontGap: number;
  rearGap: number;
  frontSupportAvailable: boolean;
  rearSupportAvailable: boolean;

  readonly speed: number;
  readonly verticalSpeed: number;
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
  readonly steerAngle: number;
  readonly supported: boolean;
  readonly sprungPitch: number;
  readonly renderY: number;
}

interface VehicleSpawnOptions {
  readonly s: number;
  readonly l: number;
  readonly initialSpeed: number;
  readonly steeringCalibration?: VehicleSteeringCalibrationInput;
  readonly tireFrictionCalibration?: Readonly<VehicleTireFrictionCalibrationState>;
  readonly drivingDefinition: CompiledDrivingDefinition;
  readonly supportReserve: number | null;
}

export function createVehicle(
  compiledVehicle: CompiledVehicle,
  { coordinates, height, surfaces }: VehicleWorld,
  {
    s,
    l,
    initialSpeed,
    steeringCalibration,
    tireFrictionCalibration,
    drivingDefinition,
    supportReserve,
  }: VehicleSpawnOptions,
): VehicleState {
  const driving = drivingDefinition.settings;
  const resolvedSteeringCalibration = { ...(steeringCalibration ?? driving.steeringCalibration) };
  const resolvedTireFrictionCalibration = tireFrictionCalibration ?? driving.tireFrictionCalibration;
  const bounds = coordinates.domain.lateralAt(s, { left: 0, right: 0 });
  if (l < bounds.left || l > bounds.right) throw new RangeError('vehicle spawn requires an in-domain coordinate');
  const coordinate = {
    s,
    l,
    inDomain: true,
  };
  const surface = sampleSurfaceGeometryAtCoordinate(
    coordinates,
    height,
    surfaces,
    coordinate,
    createSurfaceGeometryWorkspace(),
  );
  if (!surface.material.supported) throw new Error('vehicle spawn requires supported surface');
  const yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z);
  const pitch = surface.gradeAngle;
  const position = add3(surface.point, scale3(surface.normal, compiledVehicle.desiredCgHeight));
  const initialVelocity = scale3(surface.tangent, initialSpeed);
  const frontOmega = initialSpeed / compiledVehicle.frontStation.rollingRadius;
  const rearOmega = initialSpeed / compiledVehicle.rearStation.rollingRadius;
  const state = {
    compiledVehicle,
    drivingActuator: driving.actuator,
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
    steeringCalibration: resolvedSteeringCalibration,
    tireFrictionCalibration: resolvedTireFrictionCalibration,
    frontWheelOmega: frontOmega,
    rearWheelOmega: rearOmega,
    actuator: createDrivingActuatorState(),
    torqueProtection: resolveTorqueProtectionPolicy({ wheelSlip: drivingDefinition.source.wheelSlip, supportReserve }),
    course: initializePlanCoordinateObservation(coordinates, position.x, position.z, s),
    surfaceType: surface.surfaceType,
    longitudinalAcceleration: 0,
    lateralAcceleration: 0,
    control: createVehicleControlState(),
    powertrain: createAutomaticPowertrainState(
      compiledVehicle.powertrain,
      drivenWheelOmega(compiledVehicle, frontOmega, rearOmega),
    ),
    frontNormalLoad: 0,
    rearNormalLoad: 0,
    frontGap: 0,
    rearGap: 0,
    frontSupportAvailable: true,
    rearSupportAvailable: true,
  } as VehicleState;
  return installVehicleDerivedAccessors(state);
}

export function updateVehicle(
  { coordinates, height, surfaces }: VehicleWorld,
  vehicle: VehicleState,
  input: DrivingInput,
  dt: number,
): void {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('vehicle dt must be finite and > 0');
  const compiledVehicle = vehicle.compiledVehicle;
  let workspace = stepWorkspaces.get(vehicle);
  if (!workspace) {
    workspace = createStepWorkspace(vehicle);
    stepWorkspaces.set(vehicle, workspace);
  }
  const velocityBeforeX = vehicle.velocityX,
    velocityBeforeY = vehicle.velocityY,
    velocityBeforeZ = vehicle.velocityZ;
  const substep = dt / VEHICLE_SUBSTEPS;
  const calibration = vehicle.steeringCalibration;
  const automaticMax = steeringAutomaticMax(calibration);
  const steeringRequest = clamp(input.steering, -1, 1);
  let finalFront: ContactObservation | null = null;
  let finalRear: ContactObservation | null = null;

  for (let step = 0; step < VEHICLE_SUBSTEPS; step += 1) {
    updateDrivingActuators(
      vehicle.actuator,
      input,
      substep,
      vehicle.drivingActuator,
      vehicle.steeringCalibration.steeringActuatorResponse,
    );
    const body = vehicleBodyKinematics(vehicle, workspace.body);
    const bodyTravelDirection = vehicleBodyTravelDirection(body, STEERING_LOW_SPEED_REGULARIZATION);
    const steeringOffset = vehicle.actuator.steering * vehicle.steeringCalibration.steeringOffsetMax;
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
    const automaticSteer = clamp(bodyTravelDirection, -automaticMax, automaticMax);
    const deliveredOffset = limitSteeringInput(
      automaticSteer,
      steeringOffset,
      body,
      frontBeforeSteer,
      vehicle.tireFrictionCalibration.front,
      workspace.steering,
    );
    const target = clamp(
      automaticSteer + deliveredOffset,
      -calibration.maxRoadWheelSteer,
      calibration.maxRoadWheelSteer,
    );
    vehicle.frontSteerAngle = target;
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

    const driveTorque = updateAutomaticPowertrain(
      vehicle.powertrain,
      compiledVehicle.powertrain,
      drivenWheelOmega(compiledVehicle, vehicle.frontWheelOmega, vehicle.rearWheelOmega),
      vehicle.actuator.throttle,
      substep,
    );
    const frontDriveTorque = driveTorque * compiledVehicle.frontDriveTorqueFraction;
    const rearDriveTorque = driveTorque - frontDriveTorque;
    const frontBrakeTorque = vehicle.actuator.brake * compiledVehicle.frontStation.maxBrakeTorque;
    const rearBrakeTorque = vehicle.actuator.brake * compiledVehicle.rearStation.maxBrakeTorque;
    const frontRequest = workspace.frontRequest;
    frontRequest.omegaPrevious = vehicle.frontWheelOmega;
    frontRequest.inertia = compiledVehicle.frontStation.wheelInertia;
    frontRequest.rollingRadius = front.effectiveRollingRadius;
    frontRequest.longitudinalVelocity = front.longitudinalVelocity;
    frontRequest.lateralVelocity = front.lateralVelocity;
    frontRequest.normalLoad = front.tireFrameValid ? front.normalLoad : 0;
    frontRequest.gripFactor = front.surface.material.gripFactor;
    frontRequest.characteristics = vehicle.tireFrictionCalibration.front;
    frontRequest.rollingResistance = front.tireFrameValid ? front.surface.material.rollingResistance : 0;
    frontRequest.driveTorque = frontDriveTorque;
    frontRequest.brakeTorque = frontBrakeTorque;
    frontRequest.dt = substep;
    const rearRequest = workspace.rearRequest;
    rearRequest.omegaPrevious = vehicle.rearWheelOmega;
    rearRequest.inertia = compiledVehicle.rearStation.wheelInertia;
    rearRequest.rollingRadius = rear.effectiveRollingRadius;
    rearRequest.longitudinalVelocity = rear.longitudinalVelocity;
    rearRequest.lateralVelocity = rear.lateralVelocity;
    rearRequest.normalLoad = rear.tireFrameValid ? rear.normalLoad : 0;
    rearRequest.gripFactor = rear.surface.material.gripFactor;
    rearRequest.characteristics = vehicle.tireFrictionCalibration.rear;
    rearRequest.rollingResistance = rear.tireFrameValid ? rear.surface.material.rollingResistance : 0;
    rearRequest.driveTorque = rearDriveTorque;
    rearRequest.brakeTorque = rearBrakeTorque;
    rearRequest.dt = substep;
    const resolved = solveProtectedWheelPair(
      compiledVehicle,
      body,
      front,
      rear,
      frontRequest,
      rearRequest,
      vehicle.torqueProtection,
      workspace.pair,
    );
    const { frontWheel, rearWheel } = resolved;
    vehicle.frontWheelOmega = frontWheel.omega;
    vehicle.rearWheelOmega = rearWheel.omega;

    const { force: totalForce, moment: totalMoment } = resolved.wrench;

    vehicle.velocityX += (totalForce.x / compiledVehicle.mass) * substep;
    vehicle.velocityY += (totalForce.y / compiledVehicle.mass) * substep;
    vehicle.velocityZ += (totalForce.z / compiledVehicle.mass) * substep;
    vehicle.yawRate += (totalMoment.y / compiledVehicle.yawInertia) * substep;
    vehicle.pitchRate -= (dot3(totalMoment, body.right) / compiledVehicle.pitchInertia) * substep;
    vehicle.x += vehicle.velocityX * substep;
    vehicle.y += vehicle.velocityY * substep;
    vehicle.z += vehicle.velocityZ * substep;
    vehicle.yaw = wrapAngle(vehicle.yaw + vehicle.yawRate * substep);
    vehicle.pitch = wrapAngle(vehicle.pitch + vehicle.pitchRate * substep);
    refreshPlanCoordinateObservation(coordinates, vehicle, workspace.projection);

    // Output-only cache: observers consume one completed outer update, never an inner trial.
    if (step === VEHICLE_SUBSTEPS - 1) {
      vehicle.control.steeringRequest = steeringRequest;
      vehicle.control.steeringActuator = vehicle.actuator.steering;
      vehicle.control.automaticSteerAngle = automaticSteer;
      vehicle.control.requestedSteerOffset = steeringOffset;
      vehicle.control.deliveredSteerOffset = deliveredOffset;
      vehicle.control.targetSteerAngle = automaticSteer + deliveredOffset;
      vehicle.control.throttleActuator = vehicle.actuator.throttle;
      vehicle.control.brakeActuator = vehicle.actuator.brake;
      vehicle.control.actualSteerAngle = vehicle.frontSteerAngle;
      vehicle.control.frontSlipAngle =
        front.forceTransmitting && front.tireFrameValid
          ? regularizedTireSlipAngle(front.longitudinalVelocity, front.lateralVelocity, TIRE_LOW_SPEED_REGULARIZATION)
          : 0;
      vehicle.control.deliveredDriveTorque =
        driveTorque -
        (frontDriveTorque - resolved.frontInput.driveTorque) -
        (rearDriveTorque - resolved.rearInput.driveTorque);
      vehicle.control.requestedFrontDriveTorque = frontDriveTorque;
      vehicle.control.requestedRearDriveTorque = rearDriveTorque;
      vehicle.control.frontDriveTorque = resolved.frontInput.driveTorque;
      vehicle.control.rearDriveTorque = resolved.rearInput.driveTorque;
      vehicle.control.requestedFrontBrakeTorque = frontBrakeTorque;
      vehicle.control.requestedRearBrakeTorque = rearBrakeTorque;
      vehicle.control.frontBrakeTorque = resolved.frontInput.brakeTorque;
      vehicle.control.rearBrakeTorque = resolved.rearInput.brakeTorque;
      vehicle.control.supportTorqueScale = resolved.supportScale;
      vehicle.control.supportFeasible = resolved.supportFeasible;
      publishVehicleTireObservation(vehicle, front, frontWheel, rear, rearWheel);
      vehicle.control.frontWheelLocked = frontWheel.locked;
      vehicle.control.rearWheelLocked = rearWheel.locked;
      vehicle.control.frontUtilization = Number.isFinite(frontWheel.tire.rho) ? frontWheel.tire.rho : 0;
      vehicle.control.rearUtilization = Number.isFinite(rearWheel.tire.rho) ? rearWheel.tire.rho : 0;
    }

    finalFront = front;
    finalRear = rear;
  }

  if (finalFront && finalRear) {
    updateContactTelemetry(vehicle, finalFront, finalRear);
    vehicle.surfaceType = representativeSurfaceType(workspace.contacts);
  }
  const velocityDelta = workspace.velocityDelta;
  velocityDelta.x = vehicle.velocityX - velocityBeforeX;
  velocityDelta.y = vehicle.velocityY - velocityBeforeY;
  velocityDelta.z = vehicle.velocityZ - velocityBeforeZ;
  const finalBody = vehicleBodyKinematics(vehicle, workspace.body);
  vehicle.longitudinalAcceleration = dot3(velocityDelta, finalBody.forward) / dt;
  vehicle.lateralAcceleration = dot3(velocityDelta, finalBody.right) / dt;
}

/** Body-CG travel direction in the body-pitch plane; finite and zero at rest. */
function vehicleBodyTravelDirection(body: BodyKinematics, lowSpeedRegularization: number): number {
  if (!(lowSpeedRegularization > 0) || !Number.isFinite(lowSpeedRegularization)) {
    throw new RangeError('vehicle travel-direction regularization must be finite and > 0');
  }
  const longitudinal = dot3(body.velocity, body.forward);
  const lateral = dot3(body.velocity, body.right);
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
function createStepWorkspace(vehicle: VehicleState) {
  const front = createContactWorkspace(vehicle.compiledVehicle.frontStation),
    rear = createContactWorkspace(vehicle.compiledVehicle.rearStation);
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
  const frontRequest = request(vehicle.tireFrictionCalibration.front),
    rearRequest = request(vehicle.tireFrictionCalibration.rear);
  return {
    projection: createPlanProjectionWorkspace(),
    velocityDelta: { x: 0, y: 0, z: 0 },
    body: createBodyKinematicsWorkspace(),
    steering: createSteeringLimitWorkspace(),
    front,
    rear,
    contacts: [front.value, rear.value],
    frontRequest,
    rearRequest,
    pair: createProtectedWheelPairWorkspace(frontRequest, rearRequest),
  };
}

function updateContactTelemetry(vehicle: VehicleState, front: ContactObservation, rear: ContactObservation): void {
  vehicle.frontNormalLoad = front.normalLoad;
  vehicle.rearNormalLoad = rear.normalLoad;
  vehicle.frontGap = front.gap;
  vehicle.rearGap = rear.gap;
  vehicle.frontSupportAvailable = front.supportAvailable;
  vehicle.rearSupportAvailable = rear.supportAvailable;
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
  verticalSpeed: {
    enumerable: true,
    get(this: VehicleState) {
      return this.velocityY;
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
      return this.frontNormalLoad > 0 || this.rearNormalLoad > 0;
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
    get(this: VehicleState) {
      return this.y - this.compiledVehicle.desiredCgHeight;
    },
  },
};
function installVehicleDerivedAccessors(vehicle: VehicleState): VehicleState {
  derivedWorkspaces.set(vehicle, createBodyKinematicsWorkspace());
  Object.defineProperties(vehicle, derivedProperties);
  return vehicle;
}
