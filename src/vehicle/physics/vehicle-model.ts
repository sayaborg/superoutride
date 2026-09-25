import type { CompiledDrivingDefinition } from '../compiled-driving-definition.js';
import type { DrivingActuatorDefinition } from './driving-actuator.js';
import { resolvePowertrainConstants, type PowertrainConstants } from './automatic-powertrain.js';
import type { VehicleTireFrictionCalibrationState } from './tire-friction-calibration.js';
import { resolveTorqueProtectionPolicy, type TorqueProtectionPolicy } from './torque-protection.js';
import { createVehicleSteeringCalibration, type VehicleSteeringCalibrationInput } from './vehicle-calibration.js';
import type { CompiledVehicle } from './vehicle-definitions.js';

/**
 * One vehicle's immutable mechanics inputs: the compiled vehicle, the driving settings it runs
 * with, its powertrain under the game-wide rules and its torque-protection policy. Every step
 * receives it beside the vehicle state; tuning replaces the whole value.
 */
export interface VehicleModel {
  readonly compiledVehicle: CompiledVehicle;
  readonly actuator: Readonly<DrivingActuatorDefinition>;
  readonly steering: Readonly<VehicleSteeringCalibrationInput>;
  readonly tires: Readonly<VehicleTireFrictionCalibrationState>;
  readonly powertrain: Readonly<PowertrainConstants>;
  readonly torqueProtection: Readonly<TorqueProtectionPolicy>;
}

/** Admitted inputs of a vehicle model; the support reserve is the provisional form policy. */
export interface VehicleModelInput {
  readonly compiledVehicle: CompiledVehicle;
  readonly drivingDefinition: CompiledDrivingDefinition;
  readonly supportReserve: number | null;
}

/** The single place a vehicle model is built. */
export function createVehicleModel(input: VehicleModelInput): VehicleModel {
  const driving = input.drivingDefinition.settings;
  return freezeModel({
    compiledVehicle: input.compiledVehicle,
    actuator: driving.actuator,
    steering: createVehicleSteeringCalibration(driving.steeringCalibration),
    tires: driving.tireFrictionCalibration,
    powertrain: resolvePowertrainConstants(input.compiledVehicle.powertrain, driving.powertrain),
    torqueProtection: resolveTorqueProtectionPolicy({
      wheelSlip: input.drivingDefinition.source.wheelSlip,
      supportReserve: input.supportReserve,
    }),
  });
}

/** A new model with replaced DEV tuning; the original is unchanged. */
export function retuneVehicleModel(
  model: VehicleModel,
  tuning: {
    readonly steering?: VehicleSteeringCalibrationInput;
    readonly tires?: Readonly<VehicleTireFrictionCalibrationState>;
  },
): VehicleModel {
  return freezeModel({
    ...model,
    steering: tuning.steering ? createVehicleSteeringCalibration(tuning.steering) : model.steering,
    tires: tuning.tires ?? model.tires,
  });
}

function freezeModel(model: VehicleModel): VehicleModel {
  return deepFreeze(model, new WeakSet());
}

function deepFreeze<T>(value: T, seen: WeakSet<object>): T {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
  }
  return value;
}
