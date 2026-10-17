import type { CompiledDrivingDefinition } from '../compiled-driving-definition.js';
import type { CompiledDrivingActuators } from './driving-actuator.js';
import { resolvePowertrainConstants, type PowertrainConstants } from './automatic-powertrain.js';
import type { CompiledTireCharacteristics } from './tire-friction-calibration.js';
import type { TorqueProtectionPolicy } from './torque-protection.js';
import type { CompiledVehicleSteeringCalibration } from './vehicle-calibration.js';
import type { CompiledVehicle } from './vehicle-definitions.js';
import { assertSuspensionStability } from './vehicle-suspension.js';
import type { CompiledVehicleDefinition } from '../definition-document.js';

export const VEHICLE_SUBSTEPS = 12;

/**
 * The final Vehicle×Driving mechanics product: the compiled vehicle, the compiled driving facts it
 * runs with, the tire and torque protection resolved between the two, its powertrain under the game-wide
 * rules and the fixed integration step. Every update receives it beside the vehicle state; DEV tuning
 * builds a new model from a tuned definition.
 */
export interface VehicleModel {
  readonly compiledVehicle: CompiledVehicle;
  /** Seconds: the fixed outer update step. */
  readonly step: number;
  /** Seconds: the mechanics integration substep, step / VEHICLE_SUBSTEPS. */
  readonly substep: number;
  readonly actuator: Readonly<CompiledDrivingActuators>;
  readonly steering: Readonly<CompiledVehicleSteeringCalibration>;
  readonly tire: Readonly<CompiledTireCharacteristics>;
  readonly powertrain: Readonly<PowertrainConstants>;
  /**
   * The vehicle's torque protection: its own wheel slip choice (else the game-wide default) and the game-wide pitch
   * limit. The player's input drives with it; a driver's rule may choose other wheel slip protection.
   */
  readonly torqueProtection: Readonly<TorqueProtectionPolicy>;
}

/** The admitted vehicle and driving definitions a model is built from. */
export interface VehicleModelInput {
  readonly vehicleDefinition: CompiledVehicleDefinition;
  readonly drivingDefinition: CompiledDrivingDefinition;
}

/**
 * The single place a vehicle model is built, for one fixed outer step. It admits each station's
 * suspension stability at that step's substep. Every part is an admitted, deeply frozen product or
 * is frozen by its constructor, so the model itself needs only a shallow freeze.
 */
export function createVehicleModel(input: VehicleModelInput, step: number): VehicleModel {
  if (!(step > 0) || !Number.isFinite(step)) throw new RangeError('vehicle model step must be finite and > 0');
  const driving = input.drivingDefinition.compiledDriving;
  const { compiledVehicle } = input.vehicleDefinition;
  const substep = step / VEHICLE_SUBSTEPS;
  for (const station of [compiledVehicle.frontStation, compiledVehicle.rearStation])
    assertSuspensionStability(compiledVehicle.id, station, substep);
  // The one choice between the vehicle's own tire and wheel-slip choice and the driving definition's game-wide ones:
  // the vehicle's where it has them. The pitch limit stays game-wide.
  const { wheelSlip } = compiledVehicle;
  return Object.freeze({
    compiledVehicle,
    step,
    substep,
    actuator: driving.actuator,
    steering: driving.steering,
    tire: compiledVehicle.tire ?? driving.tire,
    powertrain: resolvePowertrainConstants(compiledVehicle.powertrain, driving.powertrain),
    torqueProtection:
      wheelSlip === null
        ? driving.torqueProtection
        : Object.freeze({ wheelSlip, pitchLimit: driving.torqueProtection.pitchLimit }),
  });
}
