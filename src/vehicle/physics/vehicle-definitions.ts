import { DefinitionDomainError, withDefinitionPath } from '../../core/admission.js';
import {
  compileAutomaticPowertrainDefinition,
  type AutomaticPowertrainDefinition,
  type CompiledAutomaticPowertrainDefinition,
} from './automatic-powertrain.js';
import { VEHICLE_GRAVITY, compileSuspensionStation, type CompiledContactStation } from './vehicle-dynamics.js';

/** Opaque content identity; production membership belongs to the upper catalog. */
export type VehicleId = string;

/**
 * The product's vehicle speed bound in m/s (864 km/h). Admission rejects a vehicle whose top-gear redline
 * road speed exceeds it, and race loading coverage reads it; physics never clamps to it.
 */
export const MAXIMUM_VEHICLE_SPEED = 240;

/** Road speed at redline in top gear on the larger driven rolling radius, in m/s. */
export function topGearRedlineSpeed(
  definition: Pick<VehicleDefinition, 'frontDriveTorqueFraction' | 'frontWheelRadius' | 'rearWheelRadius'> & {
    readonly powertrain: Pick<AutomaticPowertrainDefinition, 'redlineRpm' | 'finalDriveRatio' | 'gearRatios'>;
  },
): number {
  const { redlineRpm, finalDriveRatio, gearRatios } = definition.powertrain;
  const wheelOmega = (redlineRpm * 2 * Math.PI) / 60 / (gearRatios[gearRatios.length - 1]! * finalDriveRatio);
  const drivenRadii = [
    ...(definition.frontDriveTorqueFraction > 0 ? [definition.frontWheelRadius] : []),
    ...(definition.frontDriveTorqueFraction < 1 ? [definition.rearWheelRadius] : []),
  ];
  return wheelOmega * Math.max(...drivenRadii);
}

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
  readonly frontQTravel: number;
  readonly rearQTravel: number;

  readonly frontWheelRadius: number;
  readonly rearWheelRadius: number;
  readonly frontWheelInertia: number;
  readonly rearWheelInertia: number;
  /** Fixed share of total powertrain torque sent to the front station; the remainder drives rear. */
  readonly frontDriveTorqueFraction: number;

  readonly frontBrakeTorqueMax: number;
  readonly rearBrakeTorqueMax: number;
  readonly quadraticDrag: number;
  readonly powertrain: AutomaticPowertrainDefinition;
}

/** Runtime body/driver data plus resolved stations; authored suspension/wheel fields do not leak. */
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
  | 'quadraticDrag'
> {
  readonly powertrain: CompiledAutomaticPowertrainDefinition;
  readonly frontStation: CompiledContactStation;
  readonly rearStation: CompiledContactStation;
}

export function compileVehicle(definition: VehicleDefinition): Readonly<CompiledVehicle> {
  if (typeof definition.id !== 'string' || definition.id.length === 0 || definition.id.trim() !== definition.id) {
    throw new DefinitionDomainError('id', 'vehicle definition id must be a nonempty trimmed string');
  }
  for (const field of [
    'mass',
    'yawInertia',
    'pitchInertia',
    'frontAxle',
    'rearAxle',
    'desiredCgHeight',
    'frontWheelRadius',
    'rearWheelRadius',
    'frontWheelInertia',
    'rearWheelInertia',
  ] as const) {
    if (!(definition[field] > 0) || !Number.isFinite(definition[field]))
      throw new DefinitionDomainError(field, `${field} must be finite and > 0`);
  }
  for (const field of ['frontBrakeTorqueMax', 'rearBrakeTorqueMax'] as const) {
    if (!(definition[field] >= 0) || !Number.isFinite(definition[field]))
      throw new DefinitionDomainError(field, `${field} must be finite and >= 0`);
  }
  if (
    !(definition.frontDriveTorqueFraction >= 0 && definition.frontDriveTorqueFraction <= 1) ||
    !Number.isFinite(definition.frontDriveTorqueFraction)
  ) {
    throw new DefinitionDomainError(
      'frontDriveTorqueFraction',
      'vehicle front drive torque fraction must be finite and lie in [0,1]',
    );
  }
  if (!(definition.quadraticDrag >= 0) || !Number.isFinite(definition.quadraticDrag)) {
    throw new DefinitionDomainError('quadraticDrag', 'vehicle quadratic drag must be finite and >= 0');
  }
  const powertrain = withDefinitionPath(
    () => compileAutomaticPowertrainDefinition(definition.powertrain),
    (path) => `powertrain/${path}`,
  );
  const topSpeed = topGearRedlineSpeed({ ...definition, powertrain });
  if (!(topSpeed <= MAXIMUM_VEHICLE_SPEED))
    throw new DefinitionDomainError(
      `powertrain/gearRatios/${powertrain.gearRatios.length - 1}`,
      `top-gear redline speed ${topSpeed.toFixed(1)} m/s exceeds the ${MAXIMUM_VEHICLE_SPEED} m/s vehicle speed bound`,
    );

  const wheelbase = definition.frontAxle + definition.rearAxle;
  const frontStaticLoad = (definition.mass * VEHICLE_GRAVITY * definition.rearAxle) / wheelbase;
  const rearStaticLoad = (definition.mass * VEHICLE_GRAVITY * definition.frontAxle) / wheelbase;
  const frontSuspension = withDefinitionPath(
    () =>
      compileSuspensionStation(
        frontStaticLoad,
        definition.frontRideFrequency,
        definition.frontDampingRatio,
        definition.frontQTravel,
      ),
    {
      staticLoad: 'mass',
      rideFrequency: 'frontRideFrequency',
      dampingRatio: 'frontDampingRatio',
      qTravel: 'frontQTravel',
    },
  );
  const rearSuspension = withDefinitionPath(
    () =>
      compileSuspensionStation(
        rearStaticLoad,
        definition.rearRideFrequency,
        definition.rearDampingRatio,
        definition.rearQTravel,
      ),
    {
      staticLoad: 'mass',
      rideFrequency: 'rearRideFrequency',
      dampingRatio: 'rearDampingRatio',
      qTravel: 'rearQTravel',
    },
  );
  const frontStation: CompiledContactStation = Object.freeze({
    id: 'FRONT',
    forwardOffset: definition.frontAxle,
    freeReachDown: definition.desiredCgHeight + frontSuspension.qStatic,
    rollingRadius: definition.frontWheelRadius,
    wheelInertia: definition.frontWheelInertia,
    maxBrakeTorque: definition.frontBrakeTorqueMax,
    suspension: frontSuspension,
  });
  const rearStation: CompiledContactStation = Object.freeze({
    id: 'REAR',
    forwardOffset: -definition.rearAxle,
    freeReachDown: definition.desiredCgHeight + rearSuspension.qStatic,
    rollingRadius: definition.rearWheelRadius,
    wheelInertia: definition.rearWheelInertia,
    maxBrakeTorque: definition.rearBrakeTorqueMax,
    suspension: rearSuspension,
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
    quadraticDrag: definition.quadraticDrag,
    powertrain,
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
