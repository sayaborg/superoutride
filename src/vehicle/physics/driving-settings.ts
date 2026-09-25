import { DefinitionDomainError, withDefinitionPath } from './definition-domain-error.js';
import type { DrivingDefinition } from '../driving-definition.js';
import { validateDrivingActuatorDefinition } from './driving-actuator.js';
import { compileTireCharacteristics, createVehicleTireFrictionCalibration } from './tire-friction-calibration.js';
import { createVehicleSteeringCalibration } from './vehicle-calibration.js';

/** Convert explicit design input at vehicle admission; never consult a vehicle definition. */
export function createDrivingSettings(definition: DrivingDefinition) {
  if (definition.automaticSteering !== 'travel-direction')
    throw new DefinitionDomainError('automaticSteering', 'unsupported automatic steering');
  if (typeof definition.wheelSlip !== 'boolean') throw new TypeError('wheelSlip must be boolean');
  if (!(definition.fuelCutRedlineMargin > 0) || !Number.isFinite(definition.fuelCutRedlineMargin))
    throw new DefinitionDomainError('fuelCutRedlineMargin', 'fuelCutRedlineMargin must be finite and > 0');
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
  return {
    fuelCutRedlineMargin: definition.fuelCutRedlineMargin,
    actuator,
    steeringCalibration: withDefinitionPath(
      () =>
        createVehicleSteeringCalibration({
          maxRoadWheelSteer: (definition.maxRoadWheelSteerDegrees * Math.PI) / 180,
          steeringOffsetMax: (definition.steeringOffsetDegrees * Math.PI) / 180,
          steeringActuatorResponse: steering,
        }),
      {
        maxRoadWheelSteer: 'maxRoadWheelSteerDegrees',
        steeringOffsetMax: 'steeringOffsetDegrees',
        'steeringActuatorResponse/applyRate': 'steeringTraversalSeconds',
        'steeringActuatorResponse/releaseRate': 'steeringTraversalSeconds',
      },
    ),
    tireFrictionCalibration: createVehicleTireFrictionCalibration(
      withDefinitionPath(
        () => compileTireCharacteristics(definition.tire),
        (path) => `tire/${path}`,
      ),
    ),
  };
}
