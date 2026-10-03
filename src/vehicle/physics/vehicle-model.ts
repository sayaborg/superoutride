import type { CompiledDrivingDefinition } from '../compiled-driving-definition.js';
import type { CompiledDrivingActuators } from './driving-actuator.js';
import { resolvePowertrainConstants, type PowertrainConstants } from './automatic-powertrain.js';
import type { CompiledTireCharacteristics } from './tire-friction-calibration.js';
import type { TorqueProtectionPolicy } from './torque-protection.js';
import type { CompiledVehicleSteeringCalibration } from './vehicle-calibration.js';
import type { CompiledVehicle } from './vehicle-definitions.js';
import { assertSuspensionStability } from './vehicle-suspension.js';
import { assertBodyContactStability, type CompiledBodyContact } from './body-contact.js';
import type { CompiledVehicleDefinition } from '../definition-document.js';

export const VEHICLE_SUBSTEPS = 12;

/**
 * The final Vehicle×Driving mechanics product: the compiled vehicle, the compiled driving facts it
 * runs with, its powertrain under the game-wide rules and the fixed integration step. Every update
 * receives it beside the vehicle state; DEV tuning builds a new model from a tuned definition.
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
  readonly torqueProtection: Readonly<TorqueProtectionPolicy>;
  /** Game-wide suspension stiffness at full travel as a multiple of each ride spring rate. */
  readonly suspensionProgression: number;
  /** The body contact spring-damper between vehicles, admitted stable at this model's step. */
  readonly bodyContact: CompiledBodyContact;
}

/** The admitted vehicle and driving definitions a model is built from. */
export interface VehicleModelInput {
  readonly vehicleDefinition: CompiledVehicleDefinition;
  readonly drivingDefinition: CompiledDrivingDefinition;
}

/**
 * The single place a vehicle model is built, for one fixed outer step. It admits each station's
 * suspension stability at that step's substep and the body contact's stability at the step. Every part is an admitted, deeply frozen product or
 * is frozen by its constructor, so the model itself needs only a shallow freeze.
 */
export function createVehicleModel(input: VehicleModelInput, step: number): VehicleModel {
  if (!(step > 0) || !Number.isFinite(step)) throw new RangeError('vehicle model step must be finite and > 0');
  const driving = input.drivingDefinition.compiledDriving;
  const { compiledVehicle } = input.vehicleDefinition;
  const substep = step / VEHICLE_SUBSTEPS;
  for (const station of [compiledVehicle.frontStation, compiledVehicle.rearStation])
    assertSuspensionStability(compiledVehicle.id, station, driving.suspensionProgression, substep);
  assertBodyContactStability(driving.bodyContact, step, VEHICLE_SUBSTEPS);
  return Object.freeze({
    compiledVehicle,
    step,
    substep,
    actuator: driving.actuator,
    steering: driving.steering,
    tire: driving.tire,
    powertrain: resolvePowertrainConstants(compiledVehicle.powertrain, driving.powertrain),
    torqueProtection: driving.torqueProtection,
    suspensionProgression: driving.suspensionProgression,
    bodyContact: driving.bodyContact,
  });
}
