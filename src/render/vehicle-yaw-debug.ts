import { wrapAngle } from '../core/math.js';
import type { M5CameraYawMode } from '../camera/m5-camera.js';

export type VehicleYawDebugSubject = 'BODY' | 'TRAVEL';

export interface VehicleYawDebugModel {
  readonly subject: VehicleYawDebugSubject;
  readonly relativeYaw: number;
  readonly relativeYawDegrees: number;
  /** Screen-right component; zero means the body points with camera movement yaw. */
  readonly directionX: number;
  /** Screen-down component; -1 means the body points with camera movement yaw. */
  readonly directionY: number;
}

export function createVehicleYawDebugModel(
  directionYaw: number,
  cameraYaw: number,
  subject: VehicleYawDebugSubject = 'BODY',
): VehicleYawDebugModel {
  if (![directionYaw, cameraYaw].every(Number.isFinite)) {
    throw new RangeError('yaw debug angles must be finite');
  }
  const relativeYaw = wrapAngle(directionYaw - cameraYaw);
  return {
    subject,
    relativeYaw,
    relativeYawDegrees: relativeYaw * 180 / Math.PI,
    directionX: Math.sin(relativeYaw),
    directionY: -Math.cos(relativeYaw),
  };
}

export function createCameraYawDebugModel(
  vehicleYaw: number,
  movementYaw: number,
  cameraYaw: number,
  yawMode: M5CameraYawMode,
): VehicleYawDebugModel {
  return yawMode === 'BODY_FIXED'
    ? createVehicleYawDebugModel(movementYaw, cameraYaw, 'TRAVEL')
    : createVehicleYawDebugModel(vehicleYaw, cameraYaw, 'BODY');
}

/** DEV-only HUD overlay. This rotates vector geometry, never a vehicle sprite bitmap. */
export function drawVehicleYawDebug(
  ctx: CanvasRenderingContext2D,
  playerAnchorX: number,
  playerAnchorY: number,
  vehicleYaw: number,
  movementYaw: number,
  cameraYaw: number,
  yawMode: M5CameraYawMode,
): void {
  const model = createCameraYawDebugModel(vehicleYaw, movementYaw, cameraYaw, yawMode);
  const centerX = playerAnchorX;
  const centerY = playerAnchorY - 28;
  const shaftBack = 8;
  const shaftForward = 22;
  const tipX = centerX + model.directionX * shaftForward;
  const tipY = centerY + model.directionY * shaftForward;
  const tailX = centerX - model.directionX * shaftBack;
  const tailY = centerY - model.directionY * shaftBack;
  const perpendicularX = -model.directionY;
  const perpendicularY = model.directionX;
  const headBackX = tipX - model.directionX * 7;
  const headBackY = tipY - model.directionY * 7;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // A dark outline keeps the diagnostic legible over every opaque programmer-art palette entry.
  ctx.strokeStyle = '#071016';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  ctx.moveTo(headBackX + perpendicularX * 5, headBackY + perpendicularY * 5);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(headBackX - perpendicularX * 5, headBackY - perpendicularY * 5);
  ctx.stroke();

  ctx.strokeStyle = '#ffd08a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  ctx.moveTo(headBackX + perpendicularX * 5, headBackY + perpendicularY * 5);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(headBackX - perpendicularX * 5, headBackY - perpendicularY * 5);
  ctx.stroke();

  const label = `${model.subject} YAW ${formatSigned(model.relativeYawDegrees)}deg`;
  ctx.font = 'bold 7px monospace';
  ctx.textBaseline = 'bottom';
  const labelWidth = ctx.measureText(label).width;
  const labelX = centerX - labelWidth / 2;
  const labelY = playerAnchorY - 59;
  ctx.fillStyle = '#071016';
  ctx.fillRect(labelX - 2, labelY - 8, labelWidth + 4, 10);
  ctx.fillStyle = '#ffd08a';
  ctx.fillText(label, labelX, labelY);
  ctx.restore();
}

function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}
