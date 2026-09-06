import {
  formatBrowserCourseSelector,
  type BrowserCourseModeQuery,
} from './course-mode-selection.js';
import { formatVehicleProfileSelector } from './vehicle-profile-selection.js';
import { formatEnginePowerSelector } from './engine-power-controls.js';
import {
  formatMaxRoadWheelSteerSelector,
  formatSteeringOffsetSelector,
  formatSteeringResponseSelector,
} from './steering-calibration-selection.js';
import { formatTireCalibrationSelector } from './tire-friction-selection.js';
import {
  assertExclusivePedalInput,
  normalizedPedalRequest,
  type DrivingInput,
} from '../input/driving-input.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { VEHICLE_GRAVITY } from '../physics/vehicle-dynamics.js';

const G_SENSOR_RANGE = 2;
const CONTROL_METER_WIDTH = 58;
const CONTROL_METER_HEIGHT = 7;
export const HUD_INPUT_ACCEL_COLOR = '#4c9cff';
export const HUD_INPUT_BRAKE_COLOR = '#ff535d';
export const HUD_DELIVERED_COLOR = '#7ee0ff';
export const HUD_PROTECTION_CUT_COLOR = '#ff535d';

/** Common 0..1 torque-equivalent scale; request = delivered + protection reduction.
 * The limit tick is authored capacity/share, not a tire-force or available-grip estimate.
 */
export interface TorqueControlMeter {
  readonly requested: number;
  readonly delivered: number;
  readonly limit: number;
}

export interface VehicleDebugHudModel {
  readonly courseSelector: string;
  readonly vehicleSelector: string;
  readonly steeringOffsetSelector: string;
  readonly maxRoadWheelSteerSelector: string;
  readonly steeringResponseSelector: string;
  readonly tireCalibrationSelector: string;
  readonly enginePowerSelector: string;
  readonly instruments: string;
  readonly requestedSteering: number;
  readonly requestedThrottle: number;
  readonly requestedBrake: number;
  readonly actualSteering: number;
  readonly frontDrive: TorqueControlMeter;
  readonly rearDrive: TorqueControlMeter;
  readonly frontBrake: TorqueControlMeter;
  readonly rearBrake: TorqueControlMeter;
  readonly handwheelAngle: number;
  readonly longitudinalG: number;
  readonly lateralG: number;
}

export function createVehicleDebugHudModel(
  activeCourseQuery: BrowserCourseModeQuery,
  input: DrivingInput,
  vehicle: ArcadeVehicleState,
): VehicleDebugHudModel {
  assertExclusivePedalInput(input);
  const c = vehicle.control, p = vehicle.profile;
  const driveRequest = c.requestedFrontDriveTorque + c.requestedRearDriveTorque;
  const brakeCapacity = p.frontBrakeTorqueMax + p.rearBrakeTorqueMax;
  // Drequest = actuator * available full-throttle torque at this same substep/RPM/gear.
  // Multiplying the torque share by actuator avoids dividing by a tiny/zero actuator.
  // Zero engine request (including full rev cut) has no torque to show or protect.
  const throttle = clampUnit(c.throttleActuator);
  return {
    courseSelector: `COURSE ${formatBrowserCourseSelector(activeCourseQuery)}`,
    vehicleSelector: `VEHICLE ${formatVehicleProfileSelector(vehicle.profile.id)}`,
    steeringOffsetSelector: formatSteeringOffsetSelector(
      vehicle.steeringCalibration.steeringOffsetMax,
    ),
    maxRoadWheelSteerSelector: formatMaxRoadWheelSteerSelector(
      vehicle.steeringCalibration.maxRoadWheelSteer,
    ),
    steeringResponseSelector: formatSteeringResponseSelector(
      vehicle.steeringCalibration.steeringActuatorResponse.applyRate,
    ),
    tireCalibrationSelector: formatTireCalibrationSelector(vehicle.tireFrictionCalibration),
    enginePowerSelector: formatEnginePowerSelector(vehicle.powertrain.engineTorqueMultiplier),
    instruments: `SPD ${Math.round(vehicle.speed * 3.6).toString().padStart(3)}km/h  RPM ${Math.round(vehicle.powertrain.engineRpm).toString().padStart(5)}  GEAR ${vehicle.powertrain.gear}`,
    requestedSteering: clampSigned(input.steering),
    requestedThrottle: normalizedPedalRequest(input.throttle),
    requestedBrake: normalizedPedalRequest(input.brake),
    actualSteering: clampSigned(
      vehicle.control.actualSteerAngle / vehicle.steeringCalibration.maxRoadWheelSteer,
    ),
    frontDrive: torqueMeter(c.requestedFrontDriveTorque, c.frontDriveTorque,
      driveRequest, throttle, p.frontDriveTorqueFraction),
    rearDrive: torqueMeter(c.requestedRearDriveTorque, c.rearDriveTorque,
      driveRequest, throttle, 1 - p.frontDriveTorqueFraction),
    frontBrake: torqueMeter(c.requestedFrontBrakeTorque, c.frontBrakeTorque,
      brakeCapacity, 1, brakeCapacity > 0 ? p.frontBrakeTorqueMax / brakeCapacity : 0),
    rearBrake: torqueMeter(c.requestedRearBrakeTorque, c.rearBrakeTorque,
      brakeCapacity, 1, brakeCapacity > 0 ? p.rearBrakeTorqueMax / brakeCapacity : 0),
    handwheelAngle: Number.isFinite(vehicle.control.handwheelAngle)
      ? vehicle.control.handwheelAngle
      : 0,
    longitudinalG: finiteG(vehicle.longitudinalAcceleration),
    lateralG: finiteG(vehicle.lateralAcceleration),
  };
}

export function drawVehicleDebugHud(
  ctx: CanvasRenderingContext2D,
  activeCourseQuery: BrowserCourseModeQuery,
  input: DrivingInput,
  vehicle: ArcadeVehicleState,
): void {
  const model = createVehicleDebugHudModel(activeCourseQuery, input, vehicle);
  const lines = [
    `M9.22 ${model.courseSelector}`,
    model.vehicleSelector,
    model.steeringOffsetSelector,
    model.maxRoadWheelSteerSelector,
    model.steeringResponseSelector,
    model.tireCalibrationSelector,
    model.enginePowerSelector,
    model.instruments,
  ];

  ctx.save();
  ctx.font = '7px monospace';
  ctx.textBaseline = 'top';
  lines.forEach((line, index) => drawHudText(ctx, line, 6, 5 + index * 9, '#d7f3ff'));
  drawVehicleControlGraphics(ctx, model, 3, 79);
  drawTopDownGSensor(ctx, model, 286, 83);
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
    | 'frontDrive'
    | 'rearDrive'
    | 'frontBrake'
    | 'rearBrake'
    | 'handwheelAngle'>,
  x: number,
  y: number,
): void {
  assertExclusivePedalInput({
    throttle: model.requestedThrottle,
    brake: model.requestedBrake,
  });
  ctx.font = '6px monospace';
  ctx.textBaseline = 'top';
  drawHudText(ctx, 'INPUT', x + 3, y + 7, '#a6bac4');
  drawHudText(ctx, 'ACT', x + 3, y + 21, '#a6bac4');
  drawHudText(ctx, 'STEER', x + 36, y + 1, '#a6bac4');
  drawHudText(ctx, 'ACCEL %', x + 109, y + 1, '#a6bac4');
  drawHudText(ctx, 'BRAKE %', x + 174, y + 1, '#a6bac4');
  drawHudText(ctx, 'HW', x + 232, y + 1, '#a6bac4');

  drawControlMeter(ctx, x + 35, y + 8, model.requestedSteering, true, '#ffd08a');
  drawControlMeter(ctx, x + 35, y + 22, model.actualSteering, true, HUD_DELIVERED_COLOR);
  drawPedalMeters(ctx, x + 105, y, model.requestedThrottle, model.frontDrive, model.rearDrive,
    HUD_INPUT_ACCEL_COLOR);
  drawPedalMeters(ctx, x + 170, y, model.requestedBrake, model.frontBrake, model.rearBrake,
    HUD_INPUT_BRAKE_COLOR);
  drawHandwheel(ctx, x + 240, y + 22, model.handwheelAngle);
  drawHudText(ctx, 'RED=CUT', x + 234, y + 39, HUD_PROTECTION_CUT_COLOR);
}

/** Normalize observations only. Never infer road force, redo a solve, or rescale delivered total. */
function torqueMeter(request: number, delivered: number, denominator: number,
  scale: number, limit: number): TorqueControlMeter {
  const capacity = clampUnit(limit);
  const ratio = (torque: number) => denominator > 0 && Number.isFinite(denominator)
    ? clampUnit(scale * (torque / denominator)) : 0;
  const requested = Math.min(capacity, ratio(request));
  return { requested, delivered: Math.min(requested, ratio(delivered)), limit: capacity };
}

function drawPedalMeters(ctx: CanvasRenderingContext2D, x: number, y: number,
  input: number, front: TorqueControlMeter, rear: TorqueControlMeter, inputColor: string): void {
  drawControlMeter(ctx, x, y + 8, input, false, inputColor);
  drawMeterPercent(ctx, x, y + 8, input);
  for (const [label, meter, offset] of [['F', front, 22], ['R', rear, 36]] as const) {
    drawHudText(ctx, label, x - 7, y + offset, '#a6bac4');
    drawControlMeter(ctx, x, y + offset, meter.delivered, false, HUD_DELIVERED_COLOR);
    const delivered = clampUnit(meter.delivered);
    const requested = Math.max(delivered, clampUnit(meter.requested));
    const width = CONTROL_METER_WIDTH - 4;
    if (requested > delivered) {
      ctx.fillStyle = HUD_PROTECTION_CUT_COLOR;
      ctx.fillRect(x + 2 + delivered * width, y + offset + 2,
        (requested - delivered) * width, CONTROL_METER_HEIGHT - 4);
    }
    if (meter.limit > 0 && meter.limit < 1) {
      ctx.fillStyle = '#a6bac4';
      ctx.fillRect(x + 2 + meter.limit * width, y + offset + 1, 1, CONTROL_METER_HEIGHT - 2);
    }
    drawMeterPercent(ctx, x, y + offset, delivered);
  }
}

function drawMeterPercent(ctx: CanvasRenderingContext2D, x: number, y: number, value: number): void {
  drawHudText(ctx, `${Math.round(clampUnit(value) * 100)}%`, x + 20, y, '#ffffff');
}

/** Opaque glyphs only: preserve readability without an opaque or alpha-blended panel. */
function drawHudText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.strokeStyle = '#071016';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
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
    if (normalized > 0) ctx.fillRect(x + 2, y + 2, normalized * innerWidth, CONTROL_METER_HEIGHT - 4);
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
