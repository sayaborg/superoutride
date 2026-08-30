import { COURSE_MODE_HOTKEY_LABEL } from './course-mode-selection.js';
import { formatVehicleProfileSelector } from './vehicle-profile-selection.js';
import type { CourseRouteKind } from '../gameplay/course-mode.js';
import type { DrivingInput } from '../input/driving-input.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { VEHICLE_GRAVITY } from '../physics/vehicle-dynamics.js';

const G_SENSOR_RANGE = 2;

export interface VehicleDebugHudModel {
  readonly courseSelector: string;
  readonly vehicleSelector: string;
  readonly instruments: string;
  readonly requestedInput: string;
  readonly actualInput: string;
  readonly longitudinalG: number;
  readonly lateralG: number;
}

export function createVehicleDebugHudModel(
  routeKind: CourseRouteKind,
  input: DrivingInput,
  vehicle: ArcadeVehicleState,
): VehicleDebugHudModel {
  const steeringDegrees = vehicle.control.actualSteerAngle * 180 / Math.PI;
  return {
    courseSelector: `COURSE ${COURSE_MODE_HOTKEY_LABEL}  ACTIVE ${routeKind}`,
    vehicleSelector: `VEHICLE ${formatVehicleProfileSelector(vehicle.profile.id)}`,
    instruments: `SPD ${Math.round(vehicle.speed * 3.6).toString().padStart(3)}km/h  RPM ${Math.round(vehicle.powertrain.engineRpm).toString().padStart(5)}  GEAR ${vehicle.powertrain.gear}`,
    requestedInput: `INPUT STEER ${formatRequestSteering(input.steering)}  THR ${input.throttle ? 'ON ' : 'OFF'}  BRK ${input.brake ? 'ON ' : 'OFF'}`,
    actualInput: `ACT STEER ${formatSigned(steeringDegrees, 1)}deg  THR ${formatPercent(vehicle.control.throttleActuator)}  BRK ${formatPercent(vehicle.control.brakeActuator)}`,
    longitudinalG: finiteG(vehicle.longitudinalAcceleration),
    lateralG: finiteG(vehicle.lateralAcceleration),
  };
}

export function drawVehicleDebugHud(
  ctx: CanvasRenderingContext2D,
  routeKind: CourseRouteKind,
  input: DrivingInput,
  vehicle: ArcadeVehicleState,
): void {
  const model = createVehicleDebugHudModel(routeKind, input, vehicle);
  const lines = [
    `M9.1 ${model.courseSelector}`,
    model.vehicleSelector,
    model.instruments,
    model.requestedInput,
    model.actualInput,
  ];

  ctx.save();
  ctx.font = '7px monospace';
  ctx.textBaseline = 'top';
  const width = Math.ceil(Math.max(...lines.map((line) => ctx.measureText(line).width))) + 6;
  ctx.fillStyle = '#071016';
  ctx.fillRect(3, 3, width, 48);
  ctx.fillStyle = '#d7f3ff';
  lines.forEach((line, index) => ctx.fillText(line, 6, 5 + index * 9));
  drawTopDownGSensor(ctx, model, 286, 84);
  ctx.restore();
}

export function drawTopDownGSensor(
  ctx: CanvasRenderingContext2D,
  model: Pick<VehicleDebugHudModel, 'longitudinalG' | 'lateralG'>,
  centerX: number,
  centerY: number,
): void {
  const radius = 27;
  const dotX = centerX + clampSensor(model.lateralG) * radius / G_SENSOR_RANGE;
  const dotY = centerY - clampSensor(model.longitudinalG) * radius / G_SENSOR_RANGE;

  ctx.fillStyle = '#071016';
  ctx.fillRect(centerX - 32, centerY - 38, 64, 75);
  ctx.strokeStyle = '#49616e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.arc(centerX, centerY, radius / 2, 0, Math.PI * 2);
  ctx.moveTo(centerX - radius, centerY);
  ctx.lineTo(centerX + radius, centerY);
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX, centerY + radius);
  ctx.stroke();

  // Vehicle plan-view axis: nose is upward, screen right is vehicle right.
  ctx.strokeStyle = '#d7f3ff';
  ctx.strokeRect(centerX - 3.5, centerY - 8.5, 7, 17);
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - 12);
  ctx.lineTo(centerX - 3, centerY - 7);
  ctx.lineTo(centerX + 3, centerY - 7);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = '#ffd08a';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '7px monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#a6bac4';
  ctx.fillText('G TOP', centerX - 18, centerY - 36);
  ctx.fillText(`F ${formatSigned(model.longitudinalG, 1)}`, centerX - 29, centerY + 29);
  ctx.fillText(`R ${formatSigned(model.lateralG, 1)}`, centerX + 1, centerY + 29);
}

function formatRequestSteering(steering: number): string {
  if (steering < -1e-9) return 'LEFT ';
  if (steering > 1e-9) return 'RIGHT';
  return 'NEUTR';
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100).toString().padStart(3)}%`;
}

function finiteG(acceleration: number): number {
  return Number.isFinite(acceleration) ? acceleration / VEHICLE_GRAVITY : 0;
}

function clampSensor(value: number): number {
  return Math.max(-G_SENSOR_RANGE, Math.min(G_SENSOR_RANGE, value));
}

function formatSigned(value: number, digits: number): string {
  const normalized = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return `${normalized >= 0 ? '+' : '-'}${Math.abs(normalized).toFixed(digits)}`;
}
