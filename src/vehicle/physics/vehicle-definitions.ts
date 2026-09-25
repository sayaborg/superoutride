import { DefinitionDomainError, withDefinitionPath } from './definition-domain-error.js';
import {
  compileAutomaticPowertrainDefinition,
  type AutomaticPowertrainDefinition,
  type CompiledAutomaticPowertrainDefinition,
} from './automatic-powertrain.js';
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

  const wheelbase = definition.frontAxle + definition.rearAxle;
  const frontStaticLoad = (definition.mass * VEHICLE_GRAVITY * definition.rearAxle) / wheelbase;
  const rearStaticLoad = (definition.mass * VEHICLE_GRAVITY * definition.frontAxle) / wheelbase;
  const frontSuspension = withDefinitionPath(
    () =>
      compileSuspensionStation(
        frontStaticLoad,
        definition.frontRideFrequency,
        definition.frontDampingRatio,
        definition.frontQBump,
        definition.frontQTravel,
        definition.frontBumpForceMax,
      ),
    {
      staticLoad: 'mass',
      rideFrequency: 'frontRideFrequency',
      dampingRatio: 'frontDampingRatio',
      qBump: 'frontQBump',
      qTravel: 'frontQTravel',
      bumpForceMax: 'frontBumpForceMax',
    },
  );
  const rearSuspension = withDefinitionPath(
    () =>
      compileSuspensionStation(
        rearStaticLoad,
        definition.rearRideFrequency,
        definition.rearDampingRatio,
        definition.rearQBump,
        definition.rearQTravel,
        definition.rearBumpForceMax,
      ),
    {
      staticLoad: 'mass',
      rideFrequency: 'rearRideFrequency',
      dampingRatio: 'rearDampingRatio',
      qBump: 'rearQBump',
      qTravel: 'rearQTravel',
      bumpForceMax: 'rearBumpForceMax',
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
