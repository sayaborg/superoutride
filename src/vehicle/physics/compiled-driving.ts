import { DefinitionDomainError, withDefinitionPath } from '../../core/admission.js';
import type { DrivingDefinition } from '../driving-definition.js';
import { validateCompiledDrivingActuators, type CompiledDrivingActuators } from './driving-actuator.js';
import type { PowertrainRules } from './automatic-powertrain.js';
import { compileTireCharacteristics, type CompiledTireCharacteristics } from './tire-friction-calibration.js';
import type { TorqueProtectionPolicy } from './torque-protection.js';
import { compileBodyContact, type CompiledBodyContact } from './body-contact.js';
import { createVehicleSteeringCalibration, type CompiledVehicleSteeringCalibration } from './vehicle-calibration.js';
import { createSteeringRule, type SteeringRule } from '../steering-rule.js';

const PASCALS_PER_BAR = 1e5;
// Pitch protection measures a small attitude against the road line; beyond this it is not a limit.
const PITCH_LIMIT_MAX_DEGREES = 45;

/** Every converted game-wide driving fact, each held once; vehicle models consume it unchanged. */
export interface CompiledDriving {
  readonly powertrain: Readonly<PowertrainRules>;
  /** Steering, throttle and brake response rates; the only steering rate. */
  readonly actuator: Readonly<CompiledDrivingActuators>;
  /** The steering rack. */
  readonly steering: Readonly<CompiledVehicleSteeringCalibration>;
  /**
   * The default steering rule: the player's until it chooses its own, and the rule of a vehicle no driver drives.
   * Planned drivers steer by their own rule (`PLANNED_DRIVER.steering`).
   */
  readonly defaultSteering: Readonly<SteeringRule>;
  /** The game-wide tire, shared by both stations. */
  readonly tire: Readonly<CompiledTireCharacteristics>;
  readonly torqueProtection: Readonly<TorqueProtectionPolicy>;
  /**
   * The drivers' roles: each utilization in (0,1], a rival's least ≤ its level utilization ≤ its most; a rival's span
   * in metres and response time constant in seconds, finite and positive.
   */
  readonly roles: DrivingDefinition['roles'];
  /** The body contact spring-damper between vehicles, and against walls, course limits and objects. */
  readonly bodyContact: CompiledBodyContact;
}

/** Convert explicit design input at driving admission; never consult a vehicle definition. */
export function compileDriving(definition: DrivingDefinition): CompiledDriving {
  for (const field of [
    'idleFrictionMeanEffectivePressureBar',
    'redlineFrictionMeanEffectivePressureBar',
    'engineInertiaKilogramSquareMetersPerLitre',
    'clutchLockIdleMargin',
  ] as const) {
    if (!(definition[field] > 0) || !Number.isFinite(definition[field]))
      throw new DefinitionDomainError(field, `${field} must be finite and > 0`);
  }
  const { fuelCutEnterRedlineRatio, fuelCutClearRedlineRatio } = definition;
  if (!(fuelCutClearRedlineRatio > 1) || !Number.isFinite(fuelCutClearRedlineRatio))
    throw new DefinitionDomainError('fuelCutClearRedlineRatio', 'fuelCutClearRedlineRatio must be finite and > 1');
  if (!(fuelCutEnterRedlineRatio > fuelCutClearRedlineRatio) || !Number.isFinite(fuelCutEnterRedlineRatio))
    throw new DefinitionDomainError(
      'fuelCutEnterRedlineRatio',
      'fuelCutEnterRedlineRatio must be finite and > fuelCutClearRedlineRatio',
    );
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
  if (
    !(definition.pitchLimitDegrees > 0 && definition.pitchLimitDegrees <= PITCH_LIMIT_MAX_DEGREES) ||
    !Number.isFinite(definition.pitchLimitDegrees)
  )
    throw new DefinitionDomainError(
      'pitchLimitDegrees',
      `pitchLimitDegrees must lie in (0,${PITCH_LIMIT_MAX_DEGREES}]`,
    );
  const { rival, standard, traffic } = definition.roles;
  const utilizationIn = (value: number, path: string) => {
    if (!(value > 0 && value <= 1)) throw new DefinitionDomainError(`roles/${path}`, `${path} must lie in (0,1]`);
  };
  utilizationIn(rival.mostUtilization, 'rival/mostUtilization');
  utilizationIn(standard.utilization, 'standard/utilization');
  utilizationIn(traffic.utilization, 'traffic/utilization');
  if (!(rival.leastUtilization > 0 && rival.leastUtilization <= rival.utilization))
    throw new DefinitionDomainError(
      'roles/rival/leastUtilization',
      'rival leastUtilization must lie in (0, utilization]',
    );
  if (!(rival.utilization <= rival.mostUtilization))
    throw new DefinitionDomainError('roles/rival/utilization', 'rival utilization must not exceed mostUtilization');
  for (const key of ['spanMeters', 'responseSeconds'] as const)
    if (!(rival[key] > 0) || !Number.isFinite(rival[key]))
      throw new DefinitionDomainError(`roles/rival/${key}`, `rival ${key} must be finite and > 0`);
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
  const tire = withDefinitionPath(
    () => compileTireCharacteristics(definition.tire),
    (path) => `tire/${path}`,
  );
  return Object.freeze({
    powertrain: Object.freeze({
      fuelCutEnterRedlineRatio,
      fuelCutClearRedlineRatio,
      idleFrictionMeanEffectivePressure,
      redlineFrictionMeanEffectivePressure,
      drivelineEfficiency: definition.drivelineEfficiency,
      engineInertiaPerLitre: definition.engineInertiaKilogramSquareMetersPerLitre,
      clutchLockIdleMargin: definition.clutchLockIdleMargin,
      clutchCapacityFactor: definition.clutchCapacityFactor,
    }),
    actuator,
    steering: withDefinitionPath(
      () => createVehicleSteeringCalibration((definition.maxRoadWheelSteerDegrees * Math.PI) / 180),
      { maxRoadWheelSteer: 'maxRoadWheelSteerDegrees' },
    ),
    defaultSteering: withDefinitionPath(
      () => createSteeringRule(definition.steeringReference, definition.steeringUtilization),
      { reference: 'steeringReference', utilization: 'steeringUtilization' },
    ),
    tire,
    torqueProtection: Object.freeze({
      wheelSlip: Object.freeze({ drive: definition.wheelSlip.drive, brake: definition.wheelSlip.brake }),
      pitchLimit: (definition.pitchLimitDegrees * Math.PI) / 180,
    }),
    roles: Object.freeze({
      rival: Object.freeze({ ...rival }),
      standard: Object.freeze({ ...standard }),
      traffic: Object.freeze({ ...traffic }),
    }),
    bodyContact: withDefinitionPath(
      () => compileBodyContact(definition.bodyContact),
      (path) => `bodyContact/${path}`,
    ),
  });
}
