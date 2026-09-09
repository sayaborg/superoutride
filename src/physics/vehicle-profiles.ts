import { compileTireCharacteristics, type TireCharacteristics } from './tire-friction-calibration.js';
import {
  validateAutomaticPowertrainProfile,
  type AutomaticPowertrainProfile,
} from './automatic-powertrain.js';
import type { DrivingActuatorProfile } from './driving-actuator.js';
import {
  validateDrivingActuatorProfile,
  validateSymmetricSteeringActuatorRateProfile,
} from './driving-actuator.js';
import {
  VEHICLE_GRAVITY,
  compileSuspensionStation,
  type ContactStationProfile,
} from './vehicle-dynamics.js';
import {
  validateCompiledTireProfile,
  type CompiledTireProfile,
} from './tire-wheel.js';

/** Opaque content identity; production membership belongs to the upper catalog. */
export type VehicleProfileId = string;

export interface ArcadeVehicleProfile {
  /** Composition/presentation identity. Common mechanics never branches on this value. */
  readonly id: VehicleProfileId;
  readonly mass: number;
  readonly yawInertia: number;
  readonly pitchInertia: number;
  readonly frontAxle: number;
  readonly rearAxle: number;
  readonly desiredCgHeight: number;

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

  readonly frontWheelRadius: number;
  readonly rearWheelRadius: number;
  readonly frontWheelInertia: number;
  readonly rearWheelInertia: number;
  /** Fixed share of total powertrain torque sent to the front station; the remainder drives rear. */
  readonly frontDriveTorqueFraction: number;

  readonly frontTire: TireCharacteristics;
  readonly rearTire: TireCharacteristics;
  readonly lowSpeedRegularization: number;

  /** Ordinary construction defaults; browser M/D selection lives in vehicle-instance calibration. */
  readonly maxRoadWheelSteer: number;
  readonly steeringOffsetMax: number;
  readonly steeringResponseTau: number;
  /** Driver-only travel-direction regularization; independent from tire-slip regularization. */
  readonly steeringLowSpeedRegularization: number;
  /** HUD-only handwheel presentation conversion; never consumed by mechanics. */
  readonly steeringRatio: number;
  readonly frontBrakeTorqueMax: number;
  readonly rearBrakeTorqueMax: number;
  readonly quadraticDrag: number;
  readonly actuator: DrivingActuatorProfile;
  readonly powertrain: AutomaticPowertrainProfile;
}

/** Runtime body/driver data plus resolved stations; authored tire/suspension/wheel fields do not leak. */
export interface CompiledArcadeVehicleProfile extends Pick<ArcadeVehicleProfile,
  'id' | 'mass' | 'yawInertia' | 'pitchInertia' |
  'frontAxle' | 'rearAxle' | 'desiredCgHeight' | 'frontDriveTorqueFraction' |
  'maxRoadWheelSteer' | 'steeringOffsetMax' | 'steeringResponseTau' |
  'steeringLowSpeedRegularization' | 'steeringRatio' | 'quadraticDrag' | 'actuator' | 'powertrain'> {
  readonly frontStation: ContactStationProfile;
  readonly rearStation: ContactStationProfile;
}

export function compileArcadeVehicleProfile(
  profile: ArcadeVehicleProfile,
): Readonly<CompiledArcadeVehicleProfile> {
  if (typeof profile.id !== 'string' || profile.id.length === 0 || profile.id.trim() !== profile.id) {
    throw new RangeError('vehicle profile id must be a nonempty trimmed string');
  }
  const positive = [
    profile.mass,
    profile.yawInertia,
    profile.pitchInertia,
    profile.frontAxle,
    profile.rearAxle,
    profile.desiredCgHeight,
    profile.frontWheelRadius,
    profile.rearWheelRadius,
    profile.frontWheelInertia,
    profile.rearWheelInertia,
    profile.lowSpeedRegularization,
    profile.maxRoadWheelSteer,
    profile.steeringOffsetMax,
    profile.steeringResponseTau,
    profile.steeringLowSpeedRegularization,
  ];
  if (positive.some((value) => !(value > 0) || !Number.isFinite(value))) {
    throw new RangeError('vehicle mass/inertia/geometry/wheel/tire/steering values must be finite and > 0');
  }
  if (!(profile.maxRoadWheelSteer < Math.PI / 2 && profile.steeringOffsetMax < Math.PI / 2)) {
    throw new RangeError('vehicle steering angles must lie below pi/2');
  }
  if (!(profile.steeringOffsetMax < profile.maxRoadWheelSteer)) {
    throw new RangeError('vehicle steering offset must remain below the mechanical road-wheel limit');
  }
  if (!(profile.steeringRatio >= 0) || !Number.isFinite(profile.steeringRatio)) {
    throw new RangeError('vehicle steering ratio must be finite and >= 0');
  }
  if (!(profile.frontBrakeTorqueMax >= 0 && profile.rearBrakeTorqueMax >= 0)
    || ![profile.frontBrakeTorqueMax, profile.rearBrakeTorqueMax].every(Number.isFinite)) {
    throw new RangeError('vehicle brake torques must be finite and >= 0');
  }
  if (!(profile.frontDriveTorqueFraction >= 0 && profile.frontDriveTorqueFraction <= 1)
    || !Number.isFinite(profile.frontDriveTorqueFraction)) {
    throw new RangeError('vehicle front drive torque fraction must be finite and lie in [0,1]');
  }
  if (!(profile.quadraticDrag >= 0) || !Number.isFinite(profile.quadraticDrag)) {
    throw new RangeError('vehicle quadratic drag must be finite and >= 0');
  }
  validateDrivingActuatorProfile(profile.actuator);
  validateSymmetricSteeringActuatorRateProfile(profile.actuator.steering);
  validateAutomaticPowertrainProfile(profile.powertrain);

  const wheelbase = profile.frontAxle + profile.rearAxle;
  const frontStaticLoad = profile.mass * VEHICLE_GRAVITY * profile.rearAxle / wheelbase;
  const rearStaticLoad = profile.mass * VEHICLE_GRAVITY * profile.frontAxle / wheelbase;
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
  const frontTire: CompiledTireProfile = Object.freeze({
    ...compileTireCharacteristics(profile.frontTire), lowSpeedRegularization: profile.lowSpeedRegularization,
  });
  const rearTire: CompiledTireProfile = Object.freeze({
    ...compileTireCharacteristics(profile.rearTire), lowSpeedRegularization: profile.lowSpeedRegularization,
  });
  validateCompiledTireProfile(frontTire);
  validateCompiledTireProfile(rearTire);

  const frontStation: ContactStationProfile = Object.freeze({
    id: 'FRONT',
    forwardOffset: profile.frontAxle,
    freeReachDown: profile.desiredCgHeight + frontSuspension.qStatic,
    rollingRadius: profile.frontWheelRadius,
    wheelInertia: profile.frontWheelInertia,
    maxBrakeTorque: profile.frontBrakeTorqueMax,
    suspension: frontSuspension,
    tire: frontTire,
  });
  const rearStation: ContactStationProfile = Object.freeze({
    id: 'REAR',
    forwardOffset: -profile.rearAxle,
    freeReachDown: profile.desiredCgHeight + rearSuspension.qStatic,
    rollingRadius: profile.rearWheelRadius,
    wheelInertia: profile.rearWheelInertia,
    maxBrakeTorque: profile.rearBrakeTorqueMax,
    suspension: rearSuspension,
    tire: rearTire,
  });
  return Object.freeze({
    id: profile.id,
    mass: profile.mass,
    yawInertia: profile.yawInertia,
    pitchInertia: profile.pitchInertia,
    frontAxle: profile.frontAxle,
    rearAxle: profile.rearAxle,
    desiredCgHeight: profile.desiredCgHeight,
    frontDriveTorqueFraction: profile.frontDriveTorqueFraction,
    maxRoadWheelSteer: profile.maxRoadWheelSteer,
    steeringOffsetMax: profile.steeringOffsetMax,
    steeringResponseTau: profile.steeringResponseTau,
    steeringLowSpeedRegularization: profile.steeringLowSpeedRegularization,
    steeringRatio: profile.steeringRatio,
    quadraticDrag: profile.quadraticDrag,
    actuator: Object.freeze({
      steering: Object.freeze({ ...profile.actuator.steering }),
      throttle: Object.freeze({ ...profile.actuator.throttle }),
      brake: Object.freeze({ ...profile.actuator.brake }),
    }),
    powertrain: Object.freeze({
      ...profile.powertrain,
      gearRatios: Object.freeze([...profile.powertrain.gearRatios]),
      torqueCurve: Object.freeze(profile.powertrain.torqueCurve.map(point => Object.freeze({ ...point }))),
    }),
    frontStation,
    rearStation,
  });
}

/** One reduced driveline observation for the single automatic-shifted powertrain state. */
export function drivenWheelOmega(
  profile: Pick<ArcadeVehicleProfile, 'frontDriveTorqueFraction'>,
  frontWheelOmega: number,
  rearWheelOmega: number,
): number {
  return frontWheelOmega * profile.frontDriveTorqueFraction
    + rearWheelOmega * (1 - profile.frontDriveTorqueFraction);
}
