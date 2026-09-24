import type { DrivingDefinition } from '../driving-definition.js';
import { validateDrivingActuatorDefinition } from './driving-actuator.js';
import { compileTireCharacteristics, createVehicleTireFrictionCalibration } from './tire-friction-calibration.js';
import { createVehicleSteeringCalibration } from './vehicle-calibration.js';

/** Convert explicit design input at vehicle admission; never consult a vehicle definition. */
export function createDrivingSettings(definition: DrivingDefinition) {
  if (definition.automaticSteering !== 'travel-direction') throw new RangeError('unsupported automatic steering');
  if (typeof definition.wheelSlip !== 'boolean') throw new TypeError('wheelSlip must be boolean');
  const rate = 1 / definition.steeringTraversalSeconds;
  const steering = Object.freeze({ applyRate: rate, releaseRate: rate });
  const pedal = (value: DrivingDefinition['throttle']) =>
    Object.freeze({
      applyRate: 1 / value.applySeconds,
      releaseRate: 1 / value.releaseSeconds,
    });
  const actuator = Object.freeze({ steering, throttle: pedal(definition.throttle), brake: pedal(definition.brake) });
  validateDrivingActuatorDefinition(actuator);
  return {
    actuator,
    steeringCalibration: createVehicleSteeringCalibration({
      maxRoadWheelSteer: (definition.maxRoadWheelSteerDegrees * Math.PI) / 180,
      steeringOffsetMax: (definition.steeringOffsetDegrees * Math.PI) / 180,
      steeringActuatorResponse: steering,
    }),
    tireFrictionCalibration: createVehicleTireFrictionCalibration(compileTireCharacteristics(definition.tire)),
  };
}
