import { wrapPositive } from '../core/math.js';
import { createSpriteAsset, SPRITE_TRANSPARENT, type SpriteAsset } from '../render/sprite.js';
import { SoftwareSurface, rgba } from '../render/software-surface.js';
import type { FarBackground } from './far-background.js';

export const M5_9_TUNNEL_ENTRY_S = 130;
export const M5_9_TUNNEL_EXIT_S = 180;
export const M5_9_TUNNEL_RIB_S = [142, 168] as const;

export interface M5TunnelPresentation {
  readonly entryS: number;
  readonly exitS: number;
  readonly cameraTransitionStartS: number;
  readonly cameraTransitionEndS: number;
  readonly portalAsset: SpriteAsset;
  readonly ribAsset: SpriteAsset;
  readonly interiorBackground: FarBackground;
}

export interface SelectedM5FarBackground {
  readonly kind: 'OUTDOOR' | 'TUNNEL';
  readonly background: FarBackground;
}

/**
 * Core tunnel rule: the far interior is a Far Background, while only near portal/rib
 * structure remains sprite geometry. Background switching is hidden by a screen-filling
 * portal at the player crossing because the camera transition is offset by D_cam.
 */
export function createM5TunnelPresentation(courseLength: number, dCam: number): M5TunnelPresentation {
  if (!(courseLength > M5_9_TUNNEL_EXIT_S + dCam)) {
    throw new RangeError('debug course is too short for the M5.9 tunnel interval');
  }
  if (!(dCam > 0) || !Number.isFinite(dCam)) throw new RangeError('dCam must be finite and > 0');
  return {
    entryS: M5_9_TUNNEL_ENTRY_S,
    exitS: M5_9_TUNNEL_EXIT_S,
    cameraTransitionStartS: wrapPositive(M5_9_TUNNEL_ENTRY_S - dCam, courseLength),
    cameraTransitionEndS: wrapPositive(M5_9_TUNNEL_EXIT_S - dCam, courseLength),
    portalAsset: createTunnelPortalAsset(),
    ribAsset: createTunnelRibAsset(),
    interiorBackground: createTunnelInteriorBackground(),
  };
}

export function selectM5FarBackground(
  cameraS: number,
  courseLength: number,
  outdoor: FarBackground,
  tunnel: M5TunnelPresentation,
): SelectedM5FarBackground {
  const s = wrapPositive(cameraS, courseLength);
  const active = cyclicIntervalContains(
    s,
    tunnel.cameraTransitionStartS,
    tunnel.cameraTransitionEndS,
    courseLength,
  );
  return active
    ? { kind: 'TUNNEL', background: tunnel.interiorBackground }
    : { kind: 'OUTDOOR', background: outdoor };
}

export function tunnelPortalApertureIsTransparent(asset: SpriteAsset): boolean {
  // Probe the intended central roadway aperture and opaque frame rather than relying on name.
  const center = Math.floor(asset.width * 0.5);
  const lower = Math.floor(asset.height * 0.75);
  const frame = asset.pixels[Math.floor(asset.height * 0.15) * asset.width + center]!;
  const aperture = asset.pixels[lower * asset.width + center]!;
  return frame !== SPRITE_TRANSPARENT && aperture === SPRITE_TRANSPARENT;
}

function createTunnelInteriorBackground(): FarBackground {
  const width = 640;
  const height = 320;
  const sourceHorizonY = 126;
  const surface = new SoftwareSurface(width, height);
  const ceilingA = rgba(18, 20, 22);
  const ceilingB = rgba(29, 31, 31);
  const wallA = rgba(49, 48, 43);
  const wallB = rgba(61, 58, 50);
  const roadDark = rgba(24, 27, 28);
  const lamp = rgba(241, 214, 120);
  const centerGlow = rgba(84, 82, 66);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const centered = Math.abs(x - width * 0.5);
      let color: number;
      if (y < sourceHorizonY - 28) {
        color = ((x >> 5) & 1) ? ceilingA : ceilingB;
      } else if (y < sourceHorizonY + 48) {
        color = centered < 118 ? roadDark : (((x >> 4) & 1) ? wallA : wallB);
        const lampBand = (x + 12) % 96;
        if (y < sourceHorizonY - 6 && (lampBand < 7 || lampBand > 89)) color = lamp;
      } else {
        color = centered < 76 ? centerGlow : roadDark;
      }
      surface.setPixel(x, y, color);
    }
  }

  return { surface, sourceHorizonY, pixelsPerRadian: 200 };
}

function createTunnelPortalAsset(): SpriteAsset {
  const width = 64;
  const height = 48;
  const pixels = new Uint32Array(width * height);
  pixels.fill(SPRITE_TRANSPARENT);
  const concrete = rgba(118, 116, 109);
  const dark = rgba(31, 32, 32);
  const stripe = rgba(203, 184, 104);
  const lamp = rgba(247, 224, 137);

  fillRect(pixels, width, height, 0, 0, 63, 11, concrete);
  fillRect(pixels, width, height, 0, 12, 11, 47, concrete);
  fillRect(pixels, width, height, 52, 12, 63, 47, concrete);
  fillRect(pixels, width, height, 12, 10, 15, 47, dark);
  fillRect(pixels, width, height, 48, 10, 51, 47, dark);
  fillRect(pixels, width, height, 16, 10, 47, 14, dark);
  fillRect(pixels, width, height, 2, 12, 9, 14, stripe);
  fillRect(pixels, width, height, 54, 12, 61, 14, stripe);
  fillRect(pixels, width, height, 28, 8, 35, 10, lamp);

  return createSpriteAsset('TUNNEL_PORTAL', width, height, pixels, undefined, undefined, 12.0);
}

function createTunnelRibAsset(): SpriteAsset {
  const width = 56;
  const height = 42;
  const pixels = new Uint32Array(width * height);
  pixels.fill(SPRITE_TRANSPARENT);
  const concrete = rgba(88, 88, 84);
  const dark = rgba(27, 28, 28);
  const lamp = rgba(234, 210, 126);

  fillRect(pixels, width, height, 0, 0, 55, 4, concrete);
  fillRect(pixels, width, height, 0, 5, 4, 41, concrete);
  fillRect(pixels, width, height, 51, 5, 55, 41, concrete);
  fillRect(pixels, width, height, 5, 4, 8, 41, dark);
  fillRect(pixels, width, height, 47, 4, 50, 41, dark);
  fillRect(pixels, width, height, 24, 3, 31, 5, lamp);

  return createSpriteAsset('TUNNEL_RIB', width, height, pixels, undefined, undefined, 10.5);
}

function fillRect(
  pixels: Uint32Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
): void {
  const left = Math.max(0, Math.min(x0, x1));
  const right = Math.min(width - 1, Math.max(x0, x1));
  const top = Math.max(0, Math.min(y0, y1));
  const bottom = Math.min(height - 1, Math.max(y0, y1));
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) pixels[y * width + x] = color >>> 0;
  }
}

function cyclicIntervalContains(value: number, start: number, end: number, length: number): boolean {
  if (start <= end) return value >= start && value < end;
  return value >= start || value < end;
}
