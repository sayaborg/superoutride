import { validateAutomaticPowertrainDefinition, type AutomaticPowertrainDefinition } from './automatic-powertrain.js';
import type { DrivingActuatorDefinition } from './driving-actuator.js';
import {
  validateDrivingActuatorDefinition,
  validateSymmetricSteeringActuatorRateDefinition,
} from './driving-actuator.js';
import { compileTireCharacteristics, type TireCharacteristics } from './tire-friction-calibration.js';
import { validateCompiledTire, type CompiledTire } from './tire-wheel.js';
import { VEHICLE_GRAVITY, compileSuspensionStation, type CompiledContactStation } from './vehicle-dynamics.js';

/** Opaque content identity; production membership belongs to the upper catalog. */
export type VehicleId = string;

export interface VehicleDefinition {
  /** Composition/presentation identity. Common mechanics never branches on this value. */
  readonly id: VehicleId;
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
  readonly actuator: DrivingActuatorDefinition;
  readonly powertrain: AutomaticPowertrainDefinition;
}

/** Runtime body/driver data plus resolved stations; authored tire/suspension/wheel fields do not leak. */
export interface CompiledVehicle extends Pick<
  VehicleDefinition,
  | 'id'
  | 'mass'
  | 'yawInertia'
  | 'pitchInertia'
  | 'frontAxle'
  | 'rearAxle'
  | 'desiredCgHeight'
  | 'frontDriveTorqueFraction'
  | 'maxRoadWheelSteer'
  | 'steeringOffsetMax'
  | 'steeringResponseTau'
  | 'steeringLowSpeedRegularization'
  | 'steeringRatio'
  | 'quadraticDrag'
  | 'actuator'
  | 'powertrain'
> {
  readonly frontStation: CompiledContactStation;
  readonly rearStation: CompiledContactStation;
}

export function compileVehicle(definition: VehicleDefinition): Readonly<CompiledVehicle> {
  if (typeof definition.id !== 'string' || definition.id.length === 0 || definition.id.trim() !== definition.id) {
    throw new RangeError('vehicle definition id must be a nonempty trimmed string');
  }
  const positive = [
    definition.mass,
    definition.yawInertia,
    definition.pitchInertia,
    definition.frontAxle,
    definition.rearAxle,
    definition.desiredCgHeight,
    definition.frontWheelRadius,
    definition.rearWheelRadius,
    definition.frontWheelInertia,
    definition.rearWheelInertia,
    definition.lowSpeedRegularization,
    definition.maxRoadWheelSteer,
    definition.steeringOffsetMax,
    definition.steeringResponseTau,
    definition.steeringLowSpeedRegularization,
  ];
  if (positive.some((value) => !(value > 0) || !Number.isFinite(value))) {
    throw new RangeError('vehicle mass/inertia/geometry/wheel/tire/steering values must be finite and > 0');
  }
  if (!(definition.maxRoadWheelSteer < Math.PI / 2 && definition.steeringOffsetMax < Math.PI / 2)) {
    throw new RangeError('vehicle steering angles must lie below pi/2');
  }
  if (!(definition.steeringOffsetMax < definition.maxRoadWheelSteer)) {
    throw new RangeError('vehicle steering offset must remain below the mechanical road-wheel limit');
  }
  if (!(definition.steeringRatio >= 0) || !Number.isFinite(definition.steeringRatio)) {
    throw new RangeError('vehicle steering ratio must be finite and >= 0');
  }
  if (
    !(definition.frontBrakeTorqueMax >= 0 && definition.rearBrakeTorqueMax >= 0) ||
    ![definition.frontBrakeTorqueMax, definition.rearBrakeTorqueMax].every(Number.isFinite)
  ) {
    throw new RangeError('vehicle brake torques must be finite and >= 0');
  }
  if (
    !(definition.frontDriveTorqueFraction >= 0 && definition.frontDriveTorqueFraction <= 1) ||
    !Number.isFinite(definition.frontDriveTorqueFraction)
  ) {
    throw new RangeError('vehicle front drive torque fraction must be finite and lie in [0,1]');
  }
  if (!(definition.quadraticDrag >= 0) || !Number.isFinite(definition.quadraticDrag)) {
    throw new RangeError('vehicle quadratic drag must be finite and >= 0');
  }
  validateDrivingActuatorDefinition(definition.actuator);
  validateSymmetricSteeringActuatorRateDefinition(definition.actuator.steering);
  validateAutomaticPowertrainDefinition(definition.powertrain);

  const wheelbase = definition.frontAxle + definition.rearAxle;
  const frontStaticLoad = (definition.mass * VEHICLE_GRAVITY * definition.rearAxle) / wheelbase;
  const rearStaticLoad = (definition.mass * VEHICLE_GRAVITY * definition.frontAxle) / wheelbase;
  const frontSuspension = compileSuspensionStation(
    frontStaticLoad,
    definition.frontRideFrequency,
    definition.frontDampingRatio,
    definition.frontQBump,
    definition.frontQTravel,
    definition.frontBumpForceMax,
  );
  const rearSuspension = compileSuspensionStation(
    rearStaticLoad,
    definition.rearRideFrequency,
    definition.rearDampingRatio,
    definition.rearQBump,
    definition.rearQTravel,
    definition.rearBumpForceMax,
  );
  const frontTire: CompiledTire = Object.freeze({
    ...compileTireCharacteristics(definition.frontTire),
    lowSpeedRegularization: definition.lowSpeedRegularization,
  });
  const rearTire: CompiledTire = Object.freeze({
    ...compileTireCharacteristics(definition.rearTire),
    lowSpeedRegularization: definition.lowSpeedRegularization,
  });
  validateCompiledTire(frontTire);
  validateCompiledTire(rearTire);

  const frontStation: CompiledContactStation = Object.freeze({
    id: 'FRONT',
    forwardOffset: definition.frontAxle,
    freeReachDown: definition.desiredCgHeight + frontSuspension.qStatic,
    rollingRadius: definition.frontWheelRadius,
    wheelInertia: definition.frontWheelInertia,
    maxBrakeTorque: definition.frontBrakeTorqueMax,
    suspension: frontSuspension,
    tire: frontTire,
  });
  const rearStation: CompiledContactStation = Object.freeze({
    id: 'REAR',
    forwardOffset: -definition.rearAxle,
    freeReachDown: definition.desiredCgHeight + rearSuspension.qStatic,
    rollingRadius: definition.rearWheelRadius,
    wheelInertia: definition.rearWheelInertia,
    maxBrakeTorque: definition.rearBrakeTorqueMax,
    suspension: rearSuspension,
    tire: rearTire,
  });
  return Object.freeze({
    id: definition.id,
    mass: definition.mass,
    yawInertia: definition.yawInertia,
    pitchInertia: definition.pitchInertia,
    frontAxle: definition.frontAxle,
    rearAxle: definition.rearAxle,
    desiredCgHeight: definition.desiredCgHeight,
    frontDriveTorqueFraction: definition.frontDriveTorqueFraction,
    maxRoadWheelSteer: definition.maxRoadWheelSteer,
    steeringOffsetMax: definition.steeringOffsetMax,
    steeringResponseTau: definition.steeringResponseTau,
    steeringLowSpeedRegularization: definition.steeringLowSpeedRegularization,
    steeringRatio: definition.steeringRatio,
    quadraticDrag: definition.quadraticDrag,
    actuator: Object.freeze({
      steering: Object.freeze({ ...definition.actuator.steering }),
      throttle: Object.freeze({ ...definition.actuator.throttle }),
      brake: Object.freeze({ ...definition.actuator.brake }),
    }),
    powertrain: Object.freeze({
      ...definition.powertrain,
      gearRatios: Object.freeze([...definition.powertrain.gearRatios]),
      torqueCurve: Object.freeze(definition.powertrain.torqueCurve.map((point) => Object.freeze({ ...point }))),
    }),
    frontStation,
    rearStation,
  });
}

/** One reduced driveline observation for the single automatic-shifted powertrain state. */
export function drivenWheelOmega(
  definition: Pick<VehicleDefinition, 'frontDriveTorqueFraction'>,
  frontWheelOmega: number,
  rearWheelOmega: number,
): number {
  return (
    frontWheelOmega * definition.frontDriveTorqueFraction + rearWheelOmega * (1 - definition.frontDriveTorqueFraction)
  );
}
