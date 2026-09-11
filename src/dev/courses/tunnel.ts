import type { GuidePath } from '../../core/guide-curve.js';
import type { HeightProfileReader } from '../../core/height-profile.js';
import { rgba, SoftwareSurface } from '../../graphics/software-surface.js';
import { createSpriteAsset, SPRITE_TRANSPARENT, type SpriteAsset } from '../../graphics/sprite.js';
import { compileCourseSprite, type CourseSprite } from '../../render/course-sprite.js';
import type { FarBackground } from '../../visual/far-background.js';
import { FAR_BACKGROUND_SOURCE } from '../../visual/far-background.js';

export const TUNNEL_ENTRY_S = 130;
export const TUNNEL_EXIT_S = 180;
export const TUNNEL_RIB_S = [142, 168] as const;

export interface TunnelPresentation {
  readonly entryS: number;
  readonly exitS: number;
  readonly cameraTransitionStartS: number;
  readonly cameraTransitionEndS: number;
  readonly portalAsset: SpriteAsset;
  readonly ribAsset: SpriteAsset;
  readonly interiorBackground: FarBackground;
}

export interface SelectedFarBackground {
  readonly kind: 'OUTDOOR' | 'TUNNEL';
  readonly background: FarBackground;
}

/**
 * Core tunnel rule: the far interior is a Far Background, while only near portal/rib
 * structure remains sprite geometry. Background switching is hidden by a screen-filling
 * portal at the player crossing because the camera transition is offset by D_cam.
 * The authored interval lies inside the finite parent stage.
 */
export function createTunnelPresentation(courseLength: number, dCam: number): TunnelPresentation {
  if (!(courseLength > 0) || !Number.isFinite(courseLength)) {
    throw new RangeError('courseLength must be finite and > 0');
  }
  if (!(dCam > 0) || !Number.isFinite(dCam)) throw new RangeError('dCam must be finite and > 0');

  const cameraTransitionStartS = TUNNEL_ENTRY_S - dCam;
  const cameraTransitionEndS = TUNNEL_EXIT_S - dCam;
  if (cameraTransitionStartS < 0 || TUNNEL_EXIT_S > courseLength) {
    throw new RangeError('open course is too short for the tunnel interval');
  }

  return {
    entryS: TUNNEL_ENTRY_S,
    exitS: TUNNEL_EXIT_S,
    cameraTransitionStartS,
    cameraTransitionEndS,
    portalAsset: createTunnelPortalAsset(),
    ribAsset: createTunnelRibAsset(),
    interiorBackground: createTunnelInteriorBackground(),
  };
}

export function selectTunnelBackground(
  cameraS: number,
  courseLength: number,
  outdoor: FarBackground,
  tunnel: TunnelPresentation,
): SelectedFarBackground {
  if (!(courseLength > 0) || !Number.isFinite(courseLength)) {
    throw new RangeError('courseLength must be finite and > 0');
  }
  if (!Number.isFinite(cameraS) || cameraS < 0 || cameraS > courseLength) {
    throw new RangeError('camera chainage is outside the open course');
  }
  const active = cameraS >= tunnel.cameraTransitionStartS && cameraS < tunnel.cameraTransitionEndS;
  return active ? { kind: 'TUNNEL', background: tunnel.interiorBackground } : { kind: 'OUTDOOR', background: outdoor };
}

function createTunnelInteriorBackground(): FarBackground {
  const { width, height, sourceHorizonY, pixelsPerRadian } = FAR_BACKGROUND_SOURCE;
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
        color = (x >> 5) & 1 ? ceilingA : ceilingB;
      } else if (y < sourceHorizonY + 48) {
        color = centered < 118 ? roadDark : (x >> 4) & 1 ? wallA : wallB;
        const lampBand = (x + 12) % 96;
        if (y < sourceHorizonY - 6 && (lampBand < 7 || lampBand > 89)) color = lamp;
      } else {
        color = centered < 76 ? centerGlow : roadDark;
      }
      surface.setPixel(x, y, color);
    }
  }

  return { surface, sourceHorizonY, pixelsPerRadian };
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

/**
 * Only the portal faces and two near structural ribs remain world sprites.
 * Distant interior detail is represented by the tunnel Far Background.
 */
export function createTunnelWorldSprites(
  guide: GuidePath,
  height: HeightProfileReader,
  tunnel: TunnelPresentation,
): CourseSprite[] {
  return [
    compileCourseSprite(guide, height, {
      name: 'TUNNEL ENTRY PORTAL',
      s: TUNNEL_ENTRY_S,
      l: 0,
      asset: tunnel.portalAsset,
    }),
    compileCourseSprite(guide, height, {
      name: 'TUNNEL NEAR RIB A',
      s: TUNNEL_RIB_S[0],
      l: 0,
      asset: tunnel.ribAsset,
    }),
    compileCourseSprite(guide, height, {
      name: 'TUNNEL NEAR RIB B',
      s: TUNNEL_RIB_S[1],
      l: 0,
      asset: tunnel.ribAsset,
    }),
    compileCourseSprite(guide, height, {
      name: 'TUNNEL EXIT PORTAL',
      s: TUNNEL_EXIT_S,
      l: 0,
      asset: tunnel.portalAsset,
    }),
  ];
}
