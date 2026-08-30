import { COURSE_MODE_HOTKEY_LABEL } from './course-mode-selection.js';
import { formatVehicleProfileSelector } from './vehicle-profile-selection.js';
import type { CourseRouteKind } from '../gameplay/course-mode.js';
import type { DrivingInput } from '../input/driving-input.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { VEHICLE_GRAVITY } from '../physics/vehicle-dynamics.js';

const G_SENSOR_RANGE = 2;
const CONTROL_METER_WIDTH = 58;
const CONTROL_METER_HEIGHT = 7;

export interface VehicleDebugHudModel {
  readonly courseSelector: string;
  readonly vehicleSelector: string;
  readonly instruments: string;
  readonly requestedSteering: number;
  readonly requestedThrottle: number;
  readonly requestedBrake: number;
  readonly actualSteering: number;
  readonly actualThrottle: number;
  readonly actualBrake: number;
  readonly handwheelAngle: number;
  readonly longitudinalG: number;
  readonly lateralG: number;
}

export function createVehicleDebugHudModel(
  routeKind: CourseRouteKind,
  input: DrivingInput,
  vehicle: ArcadeVehicleState,
): VehicleDebugHudModel {
  return {
    courseSelector: `COURSE ${COURSE_MODE_HOTKEY_LABEL}  ACTIVE ${routeKind}`,
    vehicleSelector: `VEHICLE ${formatVehicleProfileSelector(vehicle.profile.id)}`,
    instruments: `SPD ${Math.round(vehicle.speed * 3.6).toString().padStart(3)}km/h  RPM ${Math.round(vehicle.powertrain.engineRpm).toString().padStart(5)}  GEAR ${vehicle.powertrain.gear}`,
    requestedSteering: clampSigned(input.steering),
    requestedThrottle: input.throttle ? 1 : 0,
    requestedBrake: input.brake ? 1 : 0,
    actualSteering: clampSigned(
      vehicle.control.actualSteerAngle / vehicle.profile.maxRoadWheelSteer,
    ),
    actualThrottle: clampUnit(vehicle.control.throttleActuator),
    actualBrake: clampUnit(vehicle.control.brakeActuator),
    handwheelAngle: Number.isFinite(vehicle.control.handwheelAngle)
      ? vehicle.control.handwheelAngle
      : 0,
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
  ];

  ctx.save();
  ctx.font = '7px monospace';
  ctx.textBaseline = 'top';
  const width = Math.ceil(Math.max(...lines.map((line) => ctx.measureText(line).width))) + 6;
  ctx.fillStyle = '#071016';
  ctx.fillRect(3, 3, width, 29);
  ctx.fillStyle = '#d7f3ff';
  lines.forEach((line, index) => ctx.fillText(line, 6, 5 + index * 9));
  drawVehicleControlGraphics(ctx, model, 3, 34);
  drawTopDownGSensor(ctx, model, 286, 65);
  ctx.restore();
}

/** Read-only request/response graphics. No drawn value feeds input or mechanics. */
export function drawVehicleControlGraphics(
  ctx: CanvasRenderingContext2D,
  model: Pick<VehicleDebugHudModel,
    | 'requestedSteering'
    | 'requestedThrottle'
    | 'requestedBrake'
    | 'actualSteering'
    | 'actualThrottle'
    | 'actualBrake'
    | 'handwheelAngle'>,
  x: number,
  y: number,
): void {
  ctx.fillStyle = '#071016';
  ctx.fillRect(x, y, 251, 35);
  ctx.font = '6px monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#a6bac4';
  ctx.fillText('INPUT', x + 3, y + 7);
  ctx.fillText('ACT', x + 3, y + 21);
  ctx.fillText('STEER', x + 36, y + 1);
  ctx.fillText('ACCEL', x + 109, y + 1);
  ctx.fillText('BRAKE', x + 174, y + 1);
  ctx.fillText('HW', x + 232, y + 1);

  drawControlMeter(ctx, x + 35, y + 8, model.requestedSteering, true, '#ffd08a');
  drawControlMeter(ctx, x + 35, y + 22, model.actualSteering, true, '#7ee0ff');
  drawControlMeter(ctx, x + 105, y + 8, model.requestedThrottle, false, '#ffd08a');
  drawControlMeter(ctx, x + 105, y + 22, model.actualThrottle, false, '#7ee0ff');
  drawControlMeter(ctx, x + 170, y + 8, model.requestedBrake, false, '#ffd08a');
  drawControlMeter(ctx, x + 170, y + 22, model.actualBrake, false, '#7ee0ff');
  drawHandwheel(ctx, x + 240, y + 22, model.handwheelAngle);
}

export function drawTopDownGSensor(
  ctx: CanvasRenderingContext2D,
  model: Pick<VehicleDebugHudModel, 'longitudinalG' | 'lateralG'>,
  centerX: number,
  centerY: number,
): void {
  const radius = 21;
  const point = gSensorPoint(model, centerX, centerY, radius);

  ctx.strokeStyle = '#d7f3ff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX - radius, centerY);
  ctx.lineTo(centerX + radius, centerY);
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX, centerY + radius);
  ctx.stroke();

  ctx.fillStyle = '#ffd08a';
  ctx.beginPath();
  ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Felt inertial load is opposite body acceleration: forward acceleration moves the dot rearward. */
export function gSensorPoint(
  model: Pick<VehicleDebugHudModel, 'longitudinalG' | 'lateralG'>,
  centerX: number,
  centerY: number,
  radius: number,
): Readonly<{ x: number; y: number }> {
  return Object.freeze({
    x: centerX - clampSensor(model.lateralG) * radius / G_SENSOR_RANGE,
    y: centerY + clampSensor(model.longitudinalG) * radius / G_SENSOR_RANGE,
  });
}

function drawControlMeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: number,
  signed: boolean,
  color: string,
): void {
  ctx.strokeStyle = '#49616e';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CONTROL_METER_WIDTH - 1, CONTROL_METER_HEIGHT - 1);
  const normalized = signed ? clampSigned(value) : clampUnit(value);
  const innerWidth = CONTROL_METER_WIDTH - 4;
  ctx.fillStyle = color;
  if (signed) {
    const center = x + CONTROL_METER_WIDTH / 2;
    const amount = normalized * innerWidth / 2;
    ctx.fillRect(Math.min(center, center + amount), y + 2, Math.abs(amount), CONTROL_METER_HEIGHT - 4);
    ctx.fillStyle = '#a6bac4';
    ctx.fillRect(center, y + 1, 1, CONTROL_METER_HEIGHT - 2);
  } else {
    ctx.fillRect(x + 2, y + 2, normalized * innerWidth, CONTROL_METER_HEIGHT - 4);
  }
}

function drawHandwheel(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  angle: number,
): void {
  const radius = 8;
  ctx.strokeStyle = '#7ee0ff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  for (const spoke of [-Math.PI / 2, Math.PI / 6, 5 * Math.PI / 6]) {
    const rotated = spoke + angle;
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(rotated) * (radius - 1),
      centerY + Math.sin(rotated) * (radius - 1),
    );
  }
  ctx.stroke();
}

function finiteG(acceleration: number): number {
  return Number.isFinite(acceleration) ? acceleration / VEHICLE_GRAVITY : 0;
}

function clampSensor(value: number): number {
  return Math.max(-G_SENSOR_RANGE, Math.min(G_SENSOR_RANGE, value));
}

function clampSigned(value: number): number {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
