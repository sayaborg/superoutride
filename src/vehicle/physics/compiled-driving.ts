import { DefinitionDomainError, withDefinitionPath } from '../../core/admission.js';
import type { DrivingDefinition } from '../driving-definition.js';
import { validateCompiledDrivingActuators, type CompiledDrivingActuators } from './driving-actuator.js';
import type { PowertrainRules } from './automatic-powertrain.js';
import { compileTireCharacteristics, type CompiledTireCharacteristics } from './tire-friction-calibration.js';
import type { TorqueProtectionPolicy } from './torque-protection.js';
import { compileBodyContact, type CompiledBodyContact } from './body-contact.js';
import { createVehicleSteeringCalibration, type CompiledVehicleSteeringCalibration } from './vehicle-calibration.js';

const PASCALS_PER_BAR = 1e5;
// Pitch protection measures a small attitude against the road line; beyond this it is not a limit.
const PITCH_LIMIT_MAX_DEGREES = 45;

/** Every converted game-wide driving fact, each held once; vehicle models consume it unchanged. */
export interface CompiledDriving {
  readonly powertrain: Readonly<PowertrainRules>;
  /** Steering, throttle and brake response rates; the only steering rate. */
  readonly actuator: Readonly<CompiledDrivingActuators>;
  readonly steering: Readonly<CompiledVehicleSteeringCalibration>;
  /** The game-wide tire, shared by both stations. */
  readonly tire: Readonly<CompiledTireCharacteristics>;
  /** Suspension stiffness at full travel as a multiple of each ride spring rate. */
  readonly suspensionProgression: number;
  readonly torqueProtection: Readonly<TorqueProtectionPolicy>;
  /**
   * ARCADE rival pace: utilization bounds, 0 < minimum ≤ maximum ≤ 1; the speed cap's fraction of maximum speed at
   * the minimum utilization, in (0,1]; the schedule difference band and the response time constant, in seconds.
   */
  readonly rivalPace: DrivingDefinition['rivalPace'];
  /** The body contact spring-damper between vehicles, and against walls, course limits and objects. */
  readonly bodyContact: CompiledBodyContact;
}

/** Convert explicit design input at driving admission; never consult a vehicle definition. */
export function compileDriving(definition: DrivingDefinition): CompiledDriving {
  for (const field of [
    'fuelCutRedlineMargin',
    'idleFrictionMeanEffectivePressureBar',
    'redlineFrictionMeanEffectivePressureBar',
    'engineInertiaKilogramSquareMetersPerLitre',
    'clutchLockIdleMargin',
  ] as const) {
    if (!(definition[field] > 0) || !Number.isFinite(definition[field]))
      throw new DefinitionDomainError(field, `${field} must be finite and > 0`);
  }
  // Pressures are published in pascals; a bar value whose pascals are not finite is outside the domain.
  const pascals = (field: 'idleFrictionMeanEffectivePressureBar' | 'redlineFrictionMeanEffectivePressureBar') => {
    const value = definition[field] * PASCALS_PER_BAR;
    if (!Number.isFinite(value)) throw new DefinitionDomainError(field, `${field} must be finite in pascals`);
    return value;
  };
  const idleFrictionMeanEffectivePressure = pascals('idleFrictionMeanEffectivePressureBar'),
    redlineFrictionMeanEffectivePressure = pascals('redlineFrictionMeanEffectivePressureBar');
  if (!(definition.clutchCapacityFactor > 1) || !Number.isFinite(definition.clutchCapacityFactor))
    throw new DefinitionDomainError('clutchCapacityFactor', 'clutchCapacityFactor must be finite and > 1');
  if (!(definition.suspensionProgression >= 1) || !Number.isFinite(definition.suspensionProgression))
    throw new DefinitionDomainError('suspensionProgression', 'suspensionProgression must be finite and >= 1');
  if (
    !(definition.pitchLimitDegrees > 0 && definition.pitchLimitDegrees <= PITCH_LIMIT_MAX_DEGREES) ||
    !Number.isFinite(definition.pitchLimitDegrees)
  )
    throw new DefinitionDomainError(
      'pitchLimitDegrees',
      `pitchLimitDegrees must lie in (0,${PITCH_LIMIT_MAX_DEGREES}]`,
    );
  const { minimumUtilization, maximumUtilization, minimumSpeedFraction, bandSeconds, responseSeconds } =
    definition.rivalPace;
  if (!(maximumUtilization > 0 && maximumUtilization <= 1))
    throw new DefinitionDomainError('rivalPace/maximumUtilization', 'rivalPace maximumUtilization must lie in (0,1]');
  if (!(minimumUtilization > 0 && minimumUtilization <= maximumUtilization))
    throw new DefinitionDomainError(
      'rivalPace/minimumUtilization',
      'rivalPace minimumUtilization must lie in (0, maximumUtilization]',
    );
  if (!(minimumSpeedFraction > 0 && minimumSpeedFraction <= 1))
    throw new DefinitionDomainError(
      'rivalPace/minimumSpeedFraction',
      'rivalPace minimumSpeedFraction must lie in (0,1]',
    );
  if (!(bandSeconds > 0) || !Number.isFinite(bandSeconds))
    throw new DefinitionDomainError('rivalPace/bandSeconds', 'rivalPace bandSeconds must be finite and > 0');
  if (!(responseSeconds > 0) || !Number.isFinite(responseSeconds))
    throw new DefinitionDomainError('rivalPace/responseSeconds', 'rivalPace responseSeconds must be finite and > 0');
  if (!(definition.drivelineEfficiency > 0 && definition.drivelineEfficiency <= 1))
    throw new DefinitionDomainError('drivelineEfficiency', 'drivelineEfficiency must lie in (0,1]');
  // One traversal time sets both steering rates, so steering response is symmetric by construction.
  const rate = 1 / definition.steeringTraversalSeconds;
  const steering = Object.freeze({ applyRate: rate, releaseRate: rate });
  const pedal = (value: DrivingDefinition['throttle']) =>
    Object.freeze({
      applyRate: 1 / value.applySeconds,
      releaseRate: 1 / value.releaseSeconds,
    });
  const actuator = Object.freeze({ steering, throttle: pedal(definition.throttle), brake: pedal(definition.brake) });
  withDefinitionPath(() => validateCompiledDrivingActuators(actuator), {
    steering: 'steeringTraversalSeconds',
    'steering/applyRate': 'steeringTraversalSeconds',
    'steering/releaseRate': 'steeringTraversalSeconds',
    throttle: 'throttle',
    'throttle/applyRate': 'throttle/applySeconds',
    'throttle/releaseRate': 'throttle/releaseSeconds',
    brake: 'brake',
    'brake/applyRate': 'brake/applySeconds',
    'brake/releaseRate': 'brake/releaseSeconds',
  });
  return Object.freeze({
    powertrain: Object.freeze({
      fuelCutRedlineMargin: definition.fuelCutRedlineMargin,
      idleFrictionMeanEffectivePressure,
      redlineFrictionMeanEffectivePressure,
      drivelineEfficiency: definition.drivelineEfficiency,
      engineInertiaPerLitre: definition.engineInertiaKilogramSquareMetersPerLitre,
      clutchLockIdleMargin: definition.clutchLockIdleMargin,
      clutchCapacityFactor: definition.clutchCapacityFactor,
    }),
    actuator,
    steering: withDefinitionPath(
      () =>
        createVehicleSteeringCalibration(
          (definition.maxRoadWheelSteerDegrees * Math.PI) / 180,
          (definition.steeringOffsetDegrees * Math.PI) / 180,
        ),
      {
        maxRoadWheelSteer: 'maxRoadWheelSteerDegrees',
        steeringOffsetMax: 'steeringOffsetDegrees',
      },
    ),
    tire: withDefinitionPath(
      () => compileTireCharacteristics(definition.tire),
      (path) => `tire/${path}`,
    ),
    suspensionProgression: definition.suspensionProgression,
    torqueProtection: Object.freeze({
      wheelSlip: definition.wheelSlip,
      pitchLimit: (definition.pitchLimitDegrees * Math.PI) / 180,
    }),
    rivalPace: Object.freeze({
      minimumUtilization,
      maximumUtilization,
      minimumSpeedFraction,
      bandSeconds,
      responseSeconds,
    }),
    bodyContact: withDefinitionPath(
      () => compileBodyContact(definition.bodyContact),
      (path) => `bodyContact/${path}`,
    ),
  });
}
