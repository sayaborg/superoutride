import type { DrivingInput } from '../input/driving-input.js';
import { clamp } from '../core/math.js';
import type { GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { SurfaceMapReader } from './surface-map.js';
import {
  createAutomaticPowertrainState,
  updateAutomaticPowertrain,
  type AutomaticPowertrainProfile,
} from './automatic-powertrain.js';
import {
  VEHICLE_GRAVITY,
  VEHICLE_SUBSTEPS,
  bodyFrameVelocity,
  compileSuspensionStation,
  contactForceWorld,
  createVehicleControlState,
  deriveContactObservation,
  initializeGuideObservation,
  momentAboutCg,
  refreshGuideObservation,
  representativeSurfaceType,
  sampleSurfaceGeometryAtCoordinate,
  vehicleSpeed,
  type BodyKinematics,
  type ContactObservation,
  type ContactStationProfile,
  type VehicleDynamicsState,
} from './vehicle-dynamics.js';
import {
  solveWheelOmega,
  tireLinearDemand,
  usefulLateralCapacity,
  validateCompiledTireProfile,
  type CompiledTireProfile,
} from './tire-wheel.js';
import {
  WORLD_UP,
  add3,
  bodyBasisFromQuaternion,
  cross3,
  dot3,
  integrateQuaternionBody,
  inverseRotateVector,
  leanFromBasis,
  normalize3,
  quaternionFromYawPitchLean,
  rotateVector,
  scale3,
  type Quaternion,
  type Vec3,
} from './vehicle-math3.js';

export interface MotorcyclePhysicsProfile {
  readonly mass: number;
  readonly wheelbase: number;
  readonly frontWeightFraction: number;
  readonly desiredCgHeight: number;
  readonly rollInertia: number;
  readonly pitchInertia: number;
  readonly yawInertia: number;

  readonly frontRideFrequency: number;
  readonly rearRideFrequency: number;
  readonly frontDampingRatio: number;
  readonly rearDampingRatio: number;
  readonly frontQBump: number;
  readonly rearQBump: number;
  readonly frontQTravel: number;
  readonly rearQTravel: number;
  readonly frontBumpForceMax: number;
  readonly rearBumpForceMax: number;

  readonly frontRollingRadius: number;
  readonly rearRollingRadius: number;
  readonly frontCrownRadius: number;
  readonly rearCrownRadius: number;
  readonly frontWheelInertia: number;
  readonly rearWheelInertia: number;

  readonly muRef: number;
  readonly rhoKnee: number;
  readonly lowSpeedRegularization: number;
  readonly frontNormalizedStiffness: number;
  readonly rearNormalizedStiffness: number;

  readonly phiControlMax: number;
  readonly riderKphi: number;
  readonly riderKd: number;
  readonly maxSteer: number;
  readonly steeringTau: number;
  readonly frontBrakeTorqueMax: number;
  readonly rearBrakeTorqueMax: number;
  readonly quadraticDrag: number;
  readonly powertrain: AutomaticPowertrainProfile;
}

export interface CompiledMotorcyclePhysicsProfile extends MotorcyclePhysicsProfile {
  readonly frontAxle: number;
  readonly rearAxle: number;
  readonly frontStation: ContactStationProfile;
  readonly rearStation: ContactStationProfile;
}

export const M5_BIKE_PROFILE: Readonly<CompiledMotorcyclePhysicsProfile> = compileMotorcyclePhysicsProfile({
  mass: 285,
  wheelbase: 1.52,
  frontWeightFraction: 0.47,
  desiredCgHeight: 0.60,
  rollInertia: 75,
  pitchInertia: 115,
  yawInertia: 125,

  frontRideFrequency: 2.65,
  rearRideFrequency: 2.65,
  frontDampingRatio: 0.40,
  rearDampingRatio: 0.40,
  frontQBump: 0.120,
  rearQBump: 0.120,
  frontQTravel: 0.16,
  rearQTravel: 0.16,
  frontBumpForceMax: 5_000,
  rearBumpForceMax: 6_000,

  frontRollingRadius: 0.300,
  rearRollingRadius: 0.335,
  frontCrownRadius: 0.100,
  rearCrownRadius: 0.105,
  frontWheelInertia: 0.47,
  rearWheelInertia: 0.72,

  muRef: 1.25,
  rhoKnee: 0.80,
  lowSpeedRegularization: 1.0,
  frontNormalizedStiffness: 16,
  rearNormalizedStiffness: 16,

  phiControlMax: 45 * Math.PI / 180,
  riderKphi: 1.0,
  riderKd: 1.0,
  maxSteer: 30 * Math.PI / 180,
  steeringTau: 0.06,
  frontBrakeTorqueMax: 1_160,
  rearBrakeTorqueMax: 450,
  quadraticDrag: 0.24,
  powertrain: {
    idleRpm: 1200,
    redlineRpm: 12000,
    upshiftRpm: 10500,
    downshiftRpm: 4200,
    shiftDuration: 0.10,
    engineResponseTau: 0.06,
    torqueConverterSlipRpm: 900,
    finalDriveRatio: 3.0,
    efficiency: 0.92,
    gearRatios: [2.50, 1.80, 1.40, 1.15, 1.00, 0.88],
    torqueCurve: [
      { rpm: 1200, torqueNewtonMeters: 75 },
      { rpm: 4500, torqueNewtonMeters: 125 },
      { rpm: 8000, torqueNewtonMeters: 150 },
      { rpm: 10500, torqueNewtonMeters: 138 },
      { rpm: 12000, torqueNewtonMeters: 0 },
    ],
  },
});

export interface M5BikeState extends VehicleDynamicsState {
  readonly kind: 'BIKE';
  orientation: Quaternion;
  omegaBody: Vec3;
  frontSteerAngle: number;
  frontWheelOmega: number;
  rearWheelOmega: number;

  /** Derived-output cache only. */
  frontNormalLoad: number;
  rearNormalLoad: number;
  frontGap: number;
  rearGap: number;
  frontSupportAvailable: boolean;
  rearSupportAvailable: boolean;
  referenceSurfaceNormal: Vec3;

  readonly yaw: number;
  readonly yawRate: number;
  readonly bankAngle: number;
  readonly bankRate: number;
  readonly speed: number;
  readonly verticalSpeed: number;
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
  readonly steerAngle: number;
  readonly supported: boolean;
  readonly sprungPitch: number;
  readonly sprungRoll: number;
  readonly presentationY: number;
}

export function compileMotorcyclePhysicsProfile(
  profile: MotorcyclePhysicsProfile,
): Readonly<CompiledMotorcyclePhysicsProfile> {
  if (!(profile.mass > 0 && profile.wheelbase > 0 && profile.desiredCgHeight > 0)) {
    throw new RangeError('BIKE mass/wheelbase/CG height must be > 0');
  }
  if (!(profile.frontWeightFraction > 0 && profile.frontWeightFraction < 1)) {
    throw new RangeError('BIKE front weight fraction must lie in (0,1)');
  }
  if (!(profile.rollInertia > 0 && profile.pitchInertia > 0 && profile.yawInertia > 0)) {
    throw new RangeError('BIKE principal inertias must be > 0');
  }
  if (
    profile.rollInertia + profile.pitchInertia < profile.yawInertia
    || profile.pitchInertia + profile.yawInertia < profile.rollInertia
    || profile.yawInertia + profile.rollInertia < profile.pitchInertia
  ) throw new RangeError('BIKE principal inertias must satisfy rigid-body triangle inequalities');

  const frontAxle = profile.wheelbase * (1 - profile.frontWeightFraction);
  const rearAxle = profile.wheelbase * profile.frontWeightFraction;
  const frontStaticLoad = profile.mass * VEHICLE_GRAVITY * profile.frontWeightFraction;
  const rearStaticLoad = profile.mass * VEHICLE_GRAVITY - frontStaticLoad;
  const frontSuspension = compileSuspensionStation(
    frontStaticLoad,
    profile.frontRideFrequency,
    profile.frontDampingRatio,
    profile.frontQBump,
    profile.frontQTravel,
    profile.frontBumpForceMax,
  );
  const rearSuspension = compileSuspensionStation(
    rearStaticLoad,
    profile.rearRideFrequency,
    profile.rearDampingRatio,
    profile.rearQBump,
    profile.rearQTravel,
    profile.rearBumpForceMax,
  );
  if (!(profile.frontCrownRadius > frontSuspension.qStatic && profile.frontCrownRadius < profile.frontRollingRadius)) {
    throw new RangeError('BIKE front crown requires qStatic < crownRadius < rollingRadius');
  }
  if (!(profile.rearCrownRadius > rearSuspension.qStatic && profile.rearCrownRadius < profile.rearRollingRadius)) {
    throw new RangeError('BIKE rear crown requires qStatic < crownRadius < rollingRadius');
  }
  if (!(profile.frontWheelInertia > 0 && profile.rearWheelInertia > 0)) throw new RangeError('BIKE wheel inertias must be > 0');
  if (!(profile.phiControlMax > 0 && profile.maxSteer > 0 && profile.steeringTau > 0)) {
    throw new RangeError('BIKE rider/steer limits must be > 0');
  }

  const frontTire: CompiledTireProfile = Object.freeze({
    muRef: profile.muRef,
    normalizedStiffness: profile.frontNormalizedStiffness,
    cornerStiffness: profile.frontNormalizedStiffness * frontStaticLoad,
    rhoKnee: profile.rhoKnee,
    lowSpeedRegularization: profile.lowSpeedRegularization,
  });
  const rearTire: CompiledTireProfile = Object.freeze({
    muRef: profile.muRef,
    normalizedStiffness: profile.rearNormalizedStiffness,
    cornerStiffness: profile.rearNormalizedStiffness * rearStaticLoad,
    rhoKnee: profile.rhoKnee,
    lowSpeedRegularization: profile.lowSpeedRegularization,
  });
  validateCompiledTireProfile(frontTire);
  validateCompiledTireProfile(rearTire);

  const frontStation: ContactStationProfile = Object.freeze({
    id: 'FRONT',
    forwardOffset: frontAxle,
    freeReachDown: profile.desiredCgHeight + frontSuspension.qStatic,
    rollingRadius: profile.frontRollingRadius,
    crownRadius: profile.frontCrownRadius,
    wheelInertia: profile.frontWheelInertia,
    maxBrakeTorque: profile.frontBrakeTorqueMax,
    suspension: frontSuspension,
    tire: frontTire,
  });
  const rearStation: ContactStationProfile = Object.freeze({
    id: 'REAR',
    forwardOffset: -rearAxle,
    freeReachDown: profile.desiredCgHeight + rearSuspension.qStatic,
    rollingRadius: profile.rearRollingRadius,
    crownRadius: profile.rearCrownRadius,
    wheelInertia: profile.rearWheelInertia,
    maxBrakeTorque: profile.rearBrakeTorqueMax,
    suspension: rearSuspension,
    tire: rearTire,
  });
  return Object.freeze({ ...profile, frontAxle, rearAxle, frontStation, rearStation });
}

export function createM5Bike(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  s = 45,
  l = 0,
  initialSpeed = 45,
  profile: CompiledMotorcyclePhysicsProfile = M5_BIKE_PROFILE,
): M5BikeState {
  const coordinate = { s, l, segmentIndex: locateSegmentIndex(guide, s), distanceSquared: 0 };
  const surface = sampleSurfaceGeometryAtCoordinate(guide, height, surfaces, coordinate);
  if (!surface.material.supported) throw new Error('BIKE spawn requires supported surface');
  const yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z);
  const orientation = quaternionFromYawPitchLean(yaw, surface.gradeAngle, 0);
  const frontOmega = initialSpeed / profile.frontRollingRadius;
  const rearOmega = initialSpeed / profile.rearRollingRadius;
  const initialVelocity = scale3(surface.tangent, initialSpeed);
  const state = {
    kind: 'BIKE',
    x: surface.point.x,
    y: surface.point.y + profile.desiredCgHeight,
    z: surface.point.z,
    velocityX: initialVelocity.x,
    velocityY: initialVelocity.y,
    velocityZ: initialVelocity.z,
    orientation,
    omegaBody: { x: 0, y: 0, z: 0 },
    frontSteerAngle: 0,
    frontWheelOmega: frontOmega,
    rearWheelOmega: rearOmega,
    course: initializeGuideObservation(guide, surface.point.x, surface.point.z),
    surfaceType: surface.surfaceType,
    longitudinalAcceleration: 0,
    lateralAcceleration: 0,
    control: createVehicleControlState(),
    powertrain: createAutomaticPowertrainState(profile.powertrain, rearOmega),
    frontNormalLoad: 0,
    rearNormalLoad: 0,
    frontGap: 0,
    rearGap: 0,
    frontSupportAvailable: true,
    rearSupportAvailable: true,
    referenceSurfaceNormal: surface.normal,
  } as M5BikeState;
  return installBikeDerivedAccessors(state, profile);
}

export function updateM5Bike(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  bike: M5BikeState,
  input: DrivingInput,
  dt: number,
  profile: CompiledMotorcyclePhysicsProfile = M5_BIKE_PROFILE,
): void {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('BIKE dt must be finite and > 0');
  const velocityBefore = { x: bike.velocityX, y: bike.velocityY, z: bike.velocityZ };
  const substep = dt / VEHICLE_SUBSTEPS;
  let finalFront: ContactObservation | null = null;
  let finalRear: ContactObservation | null = null;

  for (let step = 0; step < VEHICLE_SUBSTEPS; step += 1) {
    const bodyBeforeSteer = bikeBodyKinematics(bike);
    const frontBefore = deriveContactObservation(
      guide, height, surfaces, bodyBeforeSteer, profile.frontStation,
      bike.frontSteerAngle, 0, bike.course.segmentIndex,
    );
    const rearBefore = deriveContactObservation(
      guide, height, surfaces, bodyBeforeSteer, profile.rearStation,
      0, 0, bike.course.segmentIndex,
    );
    const representativeNormal = representativeNormalFromContacts(frontBefore, rearBefore);
    const basis = bodyBasisFromQuaternion(bike.orientation);
    const lean = leanFromBasis(basis.right, basis.up, representativeNormal);
    const leanRate = -dot3(bodyBeforeSteer.omegaWorld, basis.forward);
    const steerTarget = riderSteerTarget(
      bike,
      frontBefore,
      rearBefore,
      lean,
      leanRate,
      clamp(input.steering, -1, 1),
      profile,
    );
    const previousSteer = bike.frontSteerAngle;
    bike.frontSteerAngle += (steerTarget - bike.frontSteerAngle)
      * (1 - Math.exp(-substep / profile.steeringTau));
    bike.frontSteerAngle = clamp(bike.frontSteerAngle, -profile.maxSteer, profile.maxSteer);
    const steerRate = (bike.frontSteerAngle - previousSteer) / substep;

    // The updated physical steer angle owns the final front tire/crown/gyro frame this substep.
    const body = bikeBodyKinematics(bike);
    const front = deriveContactObservation(
      guide, height, surfaces, body, profile.frontStation,
      bike.frontSteerAngle, steerRate, bike.course.segmentIndex,
    );
    const rear = deriveContactObservation(
      guide, height, surfaces, body, profile.rearStation,
      0, 0, bike.course.segmentIndex,
    );

    const driveTorque = updateAutomaticPowertrain(
      bike.powertrain,
      profile.powertrain,
      bike.rearWheelOmega,
      input.throttle ? 1 : 0,
      substep,
    );
    const frontBrakeTorque = input.brake ? profile.frontBrakeTorqueMax : 0;
    const rearBrakeTorque = input.brake ? profile.rearBrakeTorqueMax : 0;

    const frontWheel = solveWheelOmega({
      omegaPrevious: bike.frontWheelOmega,
      inertia: profile.frontWheelInertia,
      rollingRadius: front.effectiveRollingRadius,
      longitudinalVelocity: front.longitudinalVelocity,
      lateralVelocity: front.lateralVelocity,
      normalLoad: front.tireFrameValid ? front.normalLoad : 0,
      gripFactor: front.surface.material.gripFactor,
      rollingResistance: front.tireFrameValid ? front.surface.material.rollingResistance : 0,
      driveTorque: 0,
      brakeTorque: frontBrakeTorque,
      dt: substep,
      tire: profile.frontStation.tire,
    });
    const rearWheel = solveWheelOmega({
      omegaPrevious: bike.rearWheelOmega,
      inertia: profile.rearWheelInertia,
      rollingRadius: rear.effectiveRollingRadius,
      longitudinalVelocity: rear.longitudinalVelocity,
      lateralVelocity: rear.lateralVelocity,
      normalLoad: rear.tireFrameValid ? rear.normalLoad : 0,
      gripFactor: rear.surface.material.gripFactor,
      rollingResistance: rear.tireFrameValid ? rear.surface.material.rollingResistance : 0,
      driveTorque,
      brakeTorque: rearBrakeTorque,
      dt: substep,
      tire: profile.rearStation.tire,
    });
    bike.frontWheelOmega = frontWheel.omega;
    bike.rearWheelOmega = rearWheel.omega;

    const frontForce = contactForceWorld(front, frontWheel.tire.fx, frontWheel.tire.fy);
    const rearForce = contactForceWorld(rear, rearWheel.tire.fx, rearWheel.tire.fy);
    const planarVelocity = { x: bike.velocityX, y: 0, z: bike.velocityZ };
    const planarSpeed = Math.hypot(planarVelocity.x, planarVelocity.z);
    const aeroForce = scale3(planarVelocity, -profile.quadraticDrag * planarSpeed);
    const gravity = { x: 0, y: -profile.mass * VEHICLE_GRAVITY, z: 0 };
    const totalForce = add3(add3(frontForce, rearForce), add3(aeroForce, gravity));

    const cg = body.position;
    const contactMoment = add3(
      momentAboutCg(front, cg, frontForce),
      momentAboutCg(rear, cg, rearForce),
    );
    const frontH = scale3(front.wheelAxis, profile.frontWheelInertia * frontWheel.omega);
    const rearH = scale3(rear.wheelAxis, profile.rearWheelInertia * rearWheel.omega);
    const frontAxisOmega = add3(body.omegaWorld, scale3(body.up, steerRate));
    const rearAxisOmega = body.omegaWorld;
    const wheelReaction = add3(
      add3(
        scale3(front.wheelAxis, -profile.frontWheelInertia * frontWheel.omegaDot),
        scale3(cross3(frontAxisOmega, frontH), -1),
      ),
      add3(
        scale3(rear.wheelAxis, -profile.rearWheelInertia * rearWheel.omegaDot),
        scale3(cross3(rearAxisOmega, rearH), -1),
      ),
    );
    const totalMoment = add3(contactMoment, wheelReaction);

    bike.velocityX += totalForce.x / profile.mass * substep;
    bike.velocityY += totalForce.y / profile.mass * substep;
    bike.velocityZ += totalForce.z / profile.mass * substep;
    bike.x += bike.velocityX * substep;
    bike.y += bike.velocityY * substep;
    bike.z += bike.velocityZ * substep;

    const angularMomentumWorld = rotateVector(bike.orientation, {
      x: profile.pitchInertia * bike.omegaBody.x,
      y: profile.yawInertia * bike.omegaBody.y,
      z: profile.rollInertia * bike.omegaBody.z,
    });
    const nextAngularMomentumWorld = add3(angularMomentumWorld, scale3(totalMoment, substep));
    const predictedBodyMomentum = inverseRotateVector(bike.orientation, nextAngularMomentumWorld);
    const predictedOmegaBody = {
      x: predictedBodyMomentum.x / profile.pitchInertia,
      y: predictedBodyMomentum.y / profile.yawInertia,
      z: predictedBodyMomentum.z / profile.rollInertia,
    };
    bike.orientation = integrateQuaternionBody(bike.orientation, predictedOmegaBody, substep);
    const finalBodyMomentum = inverseRotateVector(bike.orientation, nextAngularMomentumWorld);
    bike.omegaBody = {
      x: finalBodyMomentum.x / profile.pitchInertia,
      y: finalBodyMomentum.y / profile.yawInertia,
      z: finalBodyMomentum.z / profile.rollInertia,
    };
    refreshGuideObservation(guide, bike);

    bike.control.steeringRequest = clamp(input.steering, -1, 1);
    bike.control.actualSteerAngle = bike.frontSteerAngle;
    bike.control.requestedDriveTorque = driveTorque;
    bike.control.frontBrakeTorque = frontBrakeTorque;
    bike.control.rearBrakeTorque = rearBrakeTorque;
    bike.control.frontWheelLocked = frontWheel.locked;
    bike.control.rearWheelLocked = rearWheel.locked;
    bike.control.frontUtilization = Number.isFinite(frontWheel.tire.rho) ? frontWheel.tire.rho : 0;
    bike.control.rearUtilization = Number.isFinite(rearWheel.tire.rho) ? rearWheel.tire.rho : 0;

    finalFront = front;
    finalRear = rear;
  }

  if (finalFront && finalRear) {
    updateBikeContactTelemetry(bike, finalFront, finalRear);
    bike.surfaceType = representativeSurfaceType([finalFront, finalRear]);
  }
  const velocityDelta = {
    x: bike.velocityX - velocityBefore.x,
    y: bike.velocityY - velocityBefore.y,
    z: bike.velocityZ - velocityBefore.z,
  };
  const body = bikeBodyKinematics(bike);
  bike.longitudinalAcceleration = dot3(velocityDelta, body.forward) / dt;
  bike.lateralAcceleration = dot3(velocityDelta, body.right) / dt;
}

function riderSteerTarget(
  bike: M5BikeState,
  front: ContactObservation,
  rear: ContactObservation,
  lean: number,
  leanRate: number,
  steeringRequest: number,
  profile: CompiledMotorcyclePhysicsProfile,
): number {
  const phiIntent = steeringRequest * profile.phiControlMax;
  let phiUseful = phiIntent;
  if (
    front.forceTransmitting && rear.forceTransmitting
    && front.tireFrameValid && rear.tireFrameValid
  ) {
    const frontDemand = tireLinearDemand(
      bike.frontWheelOmega,
      front.effectiveRollingRadius,
      front.longitudinalVelocity,
      front.lateralVelocity,
      profile.frontStation.tire,
    );
    const rearDemand = tireLinearDemand(
      bike.rearWheelOmega,
      rear.effectiveRollingRadius,
      rear.longitudinalVelocity,
      rear.lateralVelocity,
      profile.rearStation.tire,
    );
    const frontUseful = usefulLateralCapacity(
      frontDemand.dx,
      front.normalLoad,
      front.surface.material.gripFactor,
      profile.frontStation.tire,
    );
    const rearUseful = usefulLateralCapacity(
      rearDemand.dx,
      rear.normalLoad,
      rear.surface.material.gripFactor,
      profile.rearStation.tire,
    );
    // Final-audit closure: both stations must individually support the steady yaw-moment balance.
    const ayUseful = Math.min(
      frontUseful * profile.wheelbase / (profile.mass * profile.rearAxle),
      rearUseful * profile.wheelbase / (profile.mass * profile.frontAxle),
    );
    const phiCapacity = Math.atan(ayUseful / VEHICLE_GRAVITY);
    phiUseful = clamp(phiIntent, -phiCapacity, phiCapacity);
  }

  const speed = vehicleSpeed(bike);
  const curvatureIntent = VEHICLE_GRAVITY * Math.tan(phiUseful)
    / (speed ** 2 + profile.lowSpeedRegularization ** 2);
  const feedforward = Math.atan(profile.wheelbase * curvatureIntent);
  const leanError = phiUseful - lean;
  return clamp(
    feedforward - profile.riderKphi * leanError + profile.riderKd * leanRate,
    -profile.maxSteer,
    profile.maxSteer,
  );
}

function bikeBodyKinematics(bike: M5BikeState): BodyKinematics {
  const basis = bodyBasisFromQuaternion(bike.orientation);
  const omegaWorld = rotateVector(bike.orientation, bike.omegaBody);
  return {
    position: { x: bike.x, y: bike.y, z: bike.z },
    velocity: { x: bike.velocityX, y: bike.velocityY, z: bike.velocityZ },
    right: basis.right,
    up: basis.up,
    forward: basis.forward,
    omegaWorld,
  };
}

function representativeNormalFromContacts(front: ContactObservation, rear: ContactObservation): Vec3 {
  if (front.supportAvailable && rear.supportAvailable) {
    return normalize3(add3(front.surface.normal, rear.surface.normal), WORLD_UP);
  }
  if (front.supportAvailable) return front.surface.normal;
  if (rear.supportAvailable) return rear.surface.normal;
  return WORLD_UP;
}

function updateBikeContactTelemetry(
  bike: M5BikeState,
  front: ContactObservation,
  rear: ContactObservation,
): void {
  bike.frontNormalLoad = front.normalLoad;
  bike.rearNormalLoad = rear.normalLoad;
  bike.frontGap = front.gap;
  bike.rearGap = rear.gap;
  bike.frontSupportAvailable = front.supportAvailable;
  bike.rearSupportAvailable = rear.supportAvailable;
  bike.referenceSurfaceNormal = representativeNormalFromContacts(front, rear);
}

function installBikeDerivedAccessors(
  bike: M5BikeState,
  profile: CompiledMotorcyclePhysicsProfile,
): M5BikeState {
  Object.defineProperties(bike, {
    yaw: {
      enumerable: true,
      get: () => {
        const forward = bodyBasisFromQuaternion(bike.orientation).forward;
        return Math.atan2(forward.x, forward.z);
      },
    },
    yawRate: {
      enumerable: true,
      get: () => dot3(rotateVector(bike.orientation, bike.omegaBody), WORLD_UP),
    },
    bankAngle: {
      enumerable: true,
      get: () => {
        const basis = bodyBasisFromQuaternion(bike.orientation);
        return leanFromBasis(basis.right, basis.up, bike.referenceSurfaceNormal);
      },
    },
    bankRate: {
      enumerable: true,
      get: () => {
        const basis = bodyBasisFromQuaternion(bike.orientation);
        return -dot3(rotateVector(bike.orientation, bike.omegaBody), basis.forward);
      },
    },
    speed: { enumerable: true, get: () => vehicleSpeed(bike) },
    verticalSpeed: { enumerable: true, get: () => bike.velocityY },
    longitudinalSpeed: {
      enumerable: true,
      get: () => {
        const body = bikeBodyKinematics(bike);
        return bodyFrameVelocity(bike, body.forward, body.right).longitudinal;
      },
    },
    lateralSpeed: {
      enumerable: true,
      get: () => {
        const body = bikeBodyKinematics(bike);
        return bodyFrameVelocity(bike, body.forward, body.right).lateral;
      },
    },
    steerAngle: { enumerable: true, get: () => bike.frontSteerAngle },
    supported: { enumerable: true, get: () => bike.frontNormalLoad > 0 || bike.rearNormalLoad > 0 },
    sprungPitch: {
      enumerable: true,
      get: () => {
        const forward = bodyBasisFromQuaternion(bike.orientation).forward;
        return Math.atan2(forward.y, Math.hypot(forward.x, forward.z));
      },
    },
    sprungRoll: {
      enumerable: true,
      get: () => clamp(bike.bankAngle / profile.phiControlMax, -1, 1) * 0.55,
    },
    presentationY: { enumerable: true, get: () => bike.y - profile.desiredCgHeight },
  });
  return bike;
}

function locateSegmentIndex(guide: GuideCoordinateSource, s: number): number {
  const curve = 'guide' in guide ? guide.guide : guide;
  for (const segment of curve.segments) {
    if (s >= segment.sStart - 1e-9 && s <= segment.sEnd + 1e-9) return segment.index;
  }
  throw new RangeError('BIKE spawn s is outside Guide');
}
