import { deriveVehicleLeanRadians, type VehicleTurnPresentationRead } from './vehicle-presentation.js';

/** Cross-sectional angle indicator at the sprite's ground anchor, in HUD pixels, not world geometry. */
export function drawVehicleLeanDebug(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  vehicle: VehicleTurnPresentationRead,
): void {
  const angle = deriveVehicleLeanRadians(vehicle);
  const length = 48;
  const tipX = anchorX + length * Math.sin(angle);
  const tipY = anchorY - length * Math.cos(angle);
  ctx.save();
  ctx.lineCap = 'round';
  for (const [color, width] of [['#071016', 4], ['#65efff', 2]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(anchorX) - 1, Math.round(anchorY) - 1, 3, 3);
  ctx.restore();
}
