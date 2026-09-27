import { DefinitionDomainError, withDefinitionPath } from '../../core/admission.js';
import type { DrivingDefinition } from '../driving-definition.js';
import { validateDrivingActuatorDefinition, type DrivingActuatorDefinition } from './driving-actuator.js';
import type { PowertrainRules } from './automatic-powertrain.js';
import {
  compileTireCharacteristics,
  createVehicleTireFrictionCalibration,
  type VehicleTireFrictionCalibrationState,
} from './tire-friction-calibration.js';
import type { TorqueProtectionPolicy } from './torque-protection.js';
import { createVehicleSteeringCalibration, type VehicleSteeringCalibrationState } from './vehicle-calibration.js';

const PASCALS_PER_BAR = 1e5;
// Pitch protection measures a small attitude against the road line; beyond this it is not a limit.
const PITCH_LIMIT_MAX_DEGREES = 45;

/** Every converted game-wide driving fact, each held once; vehicle models consume it unchanged. */
export interface CompiledDriving {
  readonly powertrain: Readonly<PowertrainRules>;
  /** Steering, throttle and brake response rates; the only steering rate. */
  readonly actuator: Readonly<DrivingActuatorDefinition>;
  readonly steering: Readonly<VehicleSteeringCalibrationState>;
  readonly tires: Readonly<VehicleTireFrictionCalibrationState>;
  /** Suspension stiffness at full travel as a multiple of each ride spring rate. */
  readonly suspensionProgression: number;
  readonly torqueProtection: Readonly<TorqueProtectionPolicy>;
}

/** Convert explicit design input at driving admission; never consult a vehicle definition. */
export function compileDriving(definition: DrivingDefinition): CompiledDriving {
  if (definition.automaticSteering !== 'travel-direction')
    throw new DefinitionDomainError('automaticSteering', 'unsupported automatic steering');
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
  withDefinitionPath(() => validateDrivingActuatorDefinition(actuator), {
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
      idleFrictionMeanEffectivePressure: definition.idleFrictionMeanEffectivePressureBar * PASCALS_PER_BAR,
      redlineFrictionMeanEffectivePressure: definition.redlineFrictionMeanEffectivePressureBar * PASCALS_PER_BAR,
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
    tires: createVehicleTireFrictionCalibration(
      withDefinitionPath(
        () => compileTireCharacteristics(definition.tire),
        (path) => `tire/${path}`,
      ),
    ),
    suspensionProgression: definition.suspensionProgression,
    torqueProtection: Object.freeze({
      wheelSlip: definition.wheelSlip,
      pitchLimit: (definition.pitchLimitDegrees * Math.PI) / 180,
    }),
  });
}
