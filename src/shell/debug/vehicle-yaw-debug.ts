import { wrapAngle } from '../../core/math.js';
import type { VehicleMotionRead } from '../../vehicle/physics/vehicle-contract.js';

/** Minimum body-pitch-plane speed with a travel direction to show. */
const TRAVEL_SPEED_MIN = 0.25;

/**
 * The travel direction's yaw relative to the camera: world velocity expressed in the body-pitch plane, its yaw
 * retained; null below TRAVEL_SPEED_MIN.
 */
function travelYawRelativeToCamera(vehicle: VehicleMotionRead, cameraYaw: number): number | null {
  const { yaw, sprungPitch: pitch, velocityX, velocityY, velocityZ } = vehicle;
  if (![yaw, pitch, velocityX, velocityY, velocityZ, cameraYaw].every(Number.isFinite)) {
    throw new RangeError('yaw debug inputs must be finite');
  }
  const forwardSpeed =
    velocityX * Math.sin(yaw) * Math.cos(pitch) +
    velocityY * Math.sin(pitch) +
    velocityZ * Math.cos(yaw) * Math.cos(pitch);
  const lateralSpeed = velocityX * Math.cos(yaw) - velocityZ * Math.sin(yaw);
  if (Math.hypot(forwardSpeed, lateralSpeed) < TRAVEL_SPEED_MIN) return null;
  return wrapAngle(yaw + Math.atan2(lateralSpeed, forwardSpeed) - cameraYaw);
}

/**
 * DEV-only HUD overlay of the player's travel direction relative to the camera. This rotates vector geometry, never a
 * vehicle sprite bitmap.
 */
export function drawVehicleYawDebug(
  ctx: CanvasRenderingContext2D,
  playerAnchorX: number,
  playerAnchorY: number,
  vehicle: VehicleMotionRead,
  cameraYaw: number,
): void {
  const relativeYaw = travelYawRelativeToCamera(vehicle, cameraYaw);
  if (relativeYaw === null) return;
  const model = {
    relativeYawDegrees: (relativeYaw * 180) / Math.PI,
    directionX: Math.sin(relativeYaw),
    directionY: -Math.cos(relativeYaw),
  };
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

  const label = `TRAVEL YAW ${formatSigned(model.relativeYawDegrees)}deg`;
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
