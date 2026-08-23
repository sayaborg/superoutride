import { SoftwareSurface, rgba } from '../render/software-surface.js';
import type { PseudoCamera } from '../core/projection.js';
import { horizonY } from '../core/projection.js';

export interface FarBackground {
  surface: SoftwareSurface;
  sourceHorizonY: number;
  pixelsPerRadian: number;
}

export function createM3FarBackground(): FarBackground {
  const width = 640;
  const height = 320;
  const sourceHorizonY = 126;
  const surface = new SoftwareSurface(width, height);
  const skyTop = rgba(22, 60, 94);
  const skyBottom = rgba(74, 125, 153);
  const seaA = rgba(30, 88, 119);
  const seaB = rgba(36, 99, 130);
  const mountain = rgba(53, 74, 76);
  const island = rgba(42, 65, 58);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color: number;
      if (y < sourceHorizonY) {
        const t = y / sourceHorizonY;
        color = lerpColor(skyTop, skyBottom, t);
        const mountainY = sourceHorizonY - 14 - Math.round(7 * Math.sin(x * 0.027) + 4 * Math.sin(x * 0.071));
        if (y >= mountainY) color = mountain;
      } else {
        const stripe = ((y - sourceHorizonY) >> 2) & 1;
        color = stripe ? seaA : seaB;
        const islandY = sourceHorizonY + 28 + Math.round(3 * Math.sin(x * 0.05));
        if (x > 390 && x < 530 && y >= islandY && y < islandY + 7) color = island;
      }
      surface.setPixel(x, y, color);
    }
  }

  return { surface, sourceHorizonY, pixelsPerRadian: 200 };
}

export function drawFarBackground(
  target: SoftwareSurface,
  background: FarBackground,
  camera: PseudoCamera,
): void {
  const yH = horizonY(camera);
  const xPan = Math.round(background.pixelsPerRadian * camera.yaw);
  for (let y = 0; y < target.height; y += 1) {
    const srcY = Math.max(0, Math.min(background.surface.height - 1, Math.round(background.sourceHorizonY + y - yH)));
    for (let x = 0; x < target.width; x += 1) {
      const srcX = mod(x + xPan, background.surface.width);
      target.setPixel(x, y, background.surface.getPixel(srcX, srcY));
    }
  }
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function lerpColor(a: number, b: number, t: number): number {
  const av = unpack(a);
  const bv = unpack(b);
  return rgba(
    av.r + (bv.r - av.r) * t,
    av.g + (bv.g - av.g) * t,
    av.b + (bv.b - av.b) * t,
  );
}

function unpack(value: number): { r: number; g: number; b: number } {
  // Generated colors are opaque and tests care about identity, not channel extraction on unusual endianness.
  const bytes = new Uint8Array(new Uint32Array([value >>> 0]).buffer);
  return { r: bytes[0]!, g: bytes[1]!, b: bytes[2]! };
}
