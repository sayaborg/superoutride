import { clamp } from '../core/math.js';
import type { VehicleControlState } from '../physics/vehicle-dynamics.js';
import type { AutomaticPowertrainState } from '../physics/automatic-powertrain.js';

export interface VehicleControlHudLines {
  readonly steering: string;
  readonly pedals: string;
  readonly instruments: string;
}

/** HUD consumes derived physical telemetry only; there is no ABS/TCS intervention authority. */
export function formatVehicleControlHud(
  control: VehicleControlState,
  powertrain: AutomaticPowertrainState,
  speedMetersPerSecond: number,
): VehicleControlHudLines {
  const steerDegrees = control.actualSteerAngle * 180 / Math.PI;
  const driveTorque = Math.round(Math.max(0, control.requestedDriveTorque));
  const frontBrake = Math.round(Math.max(0, control.frontBrakeTorque));
  const rearBrake = Math.round(Math.max(0, control.rearBrakeTorque));
  const locks = `${control.frontWheelLocked ? ' FLOCK' : ''}${control.rearWheelLocked ? ' RLOCK' : ''}`;
  return {
    steering: `ST ${signedBar(steerDegrees / 31)} ${formatSigned(steerDegrees, 1)}deg`,
    pedals: `DRV ${driveTorque.toString().padStart(4)}Nm BRK ${frontBrake}/${rearBrake}Nm${locks}`,
    instruments: `SPD ${Math.round(speedMetersPerSecond * 3.6).toString().padStart(3)}km/h RPM ${Math.round(powertrain.engineRpm).toString().padStart(5)} AT GEAR ${powertrain.gear}${powertrain.shiftDirection > 0 ? ' UP' : powertrain.shiftDirection < 0 ? ' DN' : ''}`,
  };
}

function signedBar(value: number): string {
  const amount = Math.round(Math.abs(clamp(value, -1, 1)) * 3);
  return value < 0
    ? `[${'#'.repeat(amount).padStart(3, '.')}|...]`
    : `[...|${'#'.repeat(amount).padEnd(3, '.')}]`;
}

function formatSigned(value: number, digits: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}
