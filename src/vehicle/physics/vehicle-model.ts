import type { CompiledDrivingDefinition } from '../compiled-driving-definition.js';
import type { DrivingActuatorDefinition } from './driving-actuator.js';
import { resolvePowertrainConstants, type PowertrainConstants } from './automatic-powertrain.js';
import type { VehicleTireFrictionCalibrationState } from './tire-friction-calibration.js';
import { resolveTorqueProtectionPolicy, type TorqueProtectionPolicy } from './torque-protection.js';
import type { VehicleSteeringCalibrationInput } from './vehicle-calibration.js';
import type { CompiledVehicle } from './vehicle-definitions.js';
import type { CompiledVehicleDefinition } from '../definition-document.js';

/**
 * One vehicle's immutable mechanics inputs: the compiled vehicle, the driving settings it runs
 * with, its powertrain under the game-wide rules and its torque-protection policy. Every step
 * receives it beside the vehicle state; DEV tuning builds a new model from a tuned definition.
 */
export interface VehicleModel {
  readonly compiledVehicle: CompiledVehicle;
  readonly actuator: Readonly<DrivingActuatorDefinition>;
  readonly steering: Readonly<VehicleSteeringCalibrationInput>;
  readonly tires: Readonly<VehicleTireFrictionCalibrationState>;
  readonly powertrain: Readonly<PowertrainConstants>;
  readonly torqueProtection: Readonly<TorqueProtectionPolicy>;
  /** Game-wide suspension stiffness at full travel as a multiple of each ride spring rate. */
  readonly suspensionProgression: number;
}

/** The admitted vehicle and driving definitions a model is built from. */
export interface VehicleModelInput {
  readonly vehicleDefinition: CompiledVehicleDefinition;
  readonly drivingDefinition: CompiledDrivingDefinition;
}

/**
 * The single place a vehicle model is built. Every part is an admitted, deeply frozen product or is
 * frozen by its constructor, so the model itself needs only a shallow freeze.
 */
export function createVehicleModel(input: VehicleModelInput): VehicleModel {
  const driving = input.drivingDefinition.settings;
  const { compiledVehicle } = input.vehicleDefinition;
  return Object.freeze({
    compiledVehicle,
    actuator: driving.actuator,
    steering: driving.steeringCalibration,
    tires: driving.tireFrictionCalibration,
    powertrain: resolvePowertrainConstants(compiledVehicle.powertrain, driving.powertrain),
    torqueProtection: resolveTorqueProtectionPolicy({
      wheelSlip: input.drivingDefinition.source.wheelSlip,
      pitchLimit: driving.pitchLimit,
    }),
    suspensionProgression: driving.suspensionProgression,
  });
}
