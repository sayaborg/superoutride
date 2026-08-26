import { clamp } from '../core/math.js';
import type { VehicleControlState } from '../physics/vehicle-dynamics.js';
import type { AutomaticPowertrainState } from '../physics/automatic-powertrain.js';

export interface VehicleControlHudLines {
  readonly steering: string;
  readonly pedals: string;
  readonly powertrain: string;
}

/** Always-visible post-assist actuator telemetry. Input intent is intentionally not displayed as output. */
export function formatVehicleControlHud(
  control: VehicleControlState,
  powertrain: AutomaticPowertrainState,
): VehicleControlHudLines {
  const steerDegrees = control.actualSteerAngle * 180 / Math.PI;
  const brake = Math.max(control.appliedFrontBrake, control.appliedRearBrake);
  return {
    steering: `ST ${signedBar(steerDegrees / 31)} ${formatSigned(steerDegrees, 1)}deg`,
    pedals: `DRV ${amountBar(control.appliedDrive)}${control.tractionControlActive ? ' TCS' : '    '} BRK ${amountBar(brake)}${control.absActive ? ' ABS' : ''}`,
    powertrain: `AT G${powertrain.gear} ${Math.round(powertrain.engineRpm).toString().padStart(5)}rpm${powertrain.shiftDirection > 0 ? ' SHIFT UP' : powertrain.shiftDirection < 0 ? ' SHIFT DN' : ''}`,
  };
}

function amountBar(value: number): string {
  const filled = Math.round(clamp(value, 0, 1) * 5);
  return `[${'#'.repeat(filled)}${'.'.repeat(5 - filled)}]`;
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
