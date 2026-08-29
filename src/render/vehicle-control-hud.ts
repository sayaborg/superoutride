import { clamp } from '../core/math.js';
import type { VehicleControlState } from '../physics/vehicle-dynamics.js';
import type { AutomaticPowertrainState } from '../physics/automatic-powertrain.js';

export interface VehicleControlHudLines {
  readonly steering: string;
  readonly pedals: string;
  readonly instruments: string;
}

export interface VehicleSuspensionHudTelemetry {
  readonly frontGap: number;
  readonly rearGap: number;
}

export interface CarSteeringHudModel {
  readonly inputDirection: -1 | 0 | 1;
  readonly handwheelAngle: number;
  readonly roadWheelAngle: number;
  readonly frontSlipAngle: number;
  readonly bodySlipAngle: number;
  readonly handwheelDegrees: number;
  readonly roadWheelDegrees: number;
  readonly frontSlipDegrees: number;
  readonly bodySlipDegrees: number;
}

export function createCarSteeringHudModel(
  steeringInput: number,
  control: VehicleControlState,
  bodySlipAngle: number,
): CarSteeringHudModel {
  const inputDirection = steeringInput < -1e-9 ? -1 : steeringInput > 1e-9 ? 1 : 0;
  return {
    inputDirection,
    handwheelAngle: control.handwheelAngle,
    roadWheelAngle: control.actualSteerAngle,
    frontSlipAngle: control.frontSlipAngle,
    bodySlipAngle,
    handwheelDegrees: control.handwheelAngle * 180 / Math.PI,
    roadWheelDegrees: control.actualSteerAngle * 180 / Math.PI,
    frontSlipDegrees: control.frontSlipAngle * 180 / Math.PI,
    bodySlipDegrees: bodySlipAngle * 180 / Math.PI,
  };
}

/** Draw one opaque, telemetry-only CAR steering panel over the final HUD layer. */
export function drawCarSteeringHud(
  ctx: CanvasRenderingContext2D,
  steeringInput: number,
  control: VehicleControlState,
  bodySlipAngle: number,
  x = 242,
  y = 3,
): void {
  const model = createCarSteeringHudModel(steeringInput, control, bodySlipAngle);
  const width = 76;
  const height = 105;
  const centerX = x + width / 2;
  const centerY = y + 20;
  const radius = 14;

  ctx.save();
  ctx.fillStyle = '#071016';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#49616e';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

  ctx.strokeStyle = '#d7f3ff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  const spokeAngles = [-Math.PI / 2, Math.PI / 6, 5 * Math.PI / 6];
  ctx.beginPath();
  for (const angle of spokeAngles) {
    const rotated = angle + model.handwheelAngle;
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(rotated) * (radius - 2),
      centerY + Math.sin(rotated) * (radius - 2),
    );
  }
  ctx.stroke();

  const markerAngle = -Math.PI / 2 + model.handwheelAngle;
  ctx.strokeStyle = '#ffd08a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(
    centerX + Math.cos(markerAngle) * (radius - 4),
    centerY + Math.sin(markerAngle) * (radius - 4),
  );
  ctx.lineTo(
    centerX + Math.cos(markerAngle) * (radius + 1),
    centerY + Math.sin(markerAngle) * (radius + 1),
  );
  ctx.stroke();

  ctx.font = '7px monospace';
  ctx.textBaseline = 'top';
  const buttonY = y + 39;
  for (const [direction, label, buttonX] of [
    [-1, 'L', x + 7],
    [0, 'N', x + 29],
    [1, 'R', x + 51],
  ] as const) {
    const active = model.inputDirection === direction;
    ctx.fillStyle = active ? '#ffd08a' : '#111a21';
    ctx.fillRect(buttonX, buttonY, 18, 10);
    ctx.strokeStyle = active ? '#ffd08a' : '#49616e';
    ctx.lineWidth = 1;
    ctx.strokeRect(buttonX + 0.5, buttonY + 0.5, 17, 9);
    ctx.fillStyle = active ? '#071016' : '#a6bac4';
    ctx.fillText(label, buttonX + 7, buttonY + 1);
  }

  ctx.fillStyle = '#a6bac4';
  ctx.fillText(`HW ${formatSigned(model.handwheelDegrees, 0)}deg`, x + 4, y + 53);
  ctx.fillText(`RW ${formatSigned(model.roadWheelDegrees, 1)}deg`, x + 4, y + 65);
  ctx.fillText(`AF ${formatSigned(model.frontSlipDegrees, 1)}deg`, x + 4, y + 77);
  ctx.fillText(`BODY ${formatSigned(model.bodySlipDegrees, 1)}deg`, x + 4, y + 89);
  ctx.restore();
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

/**
 * Signed H is each contact station's road-normal distance: positive in flight and negative while
 * the suspension is compressed. Q exposes the matching non-negative suspension compression.
 */
export function formatVehicleSuspensionHud(
  telemetry: VehicleSuspensionHudTelemetry,
): string {
  const frontCompression = Math.max(0, -telemetry.frontGap);
  const rearCompression = Math.max(0, -telemetry.rearGap);
  return `SUSP F H${formatSigned(telemetry.frontGap, 3)}m Q${frontCompression.toFixed(3)}m R H${formatSigned(telemetry.rearGap, 3)}m Q${rearCompression.toFixed(3)}m`;
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
