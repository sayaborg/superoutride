import type { GuideCurve } from '../core/guide-curve.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import {
  M5_9_TUNNEL_ENTRY_S,
  M5_9_TUNNEL_EXIT_S,
  M5_9_TUNNEL_RIB_S,
  type M5TunnelPresentation,
} from '../visual/m5-9-tunnel.js';
import { compileCourseSprite, type CourseSprite } from './course-sprite.js';

/**
 * Only the portal faces and two near structural ribs remain world sprites.
 * Distant interior detail is represented by the tunnel Far Background.
 */
export function createM5TunnelWorldSprites(
  guide: GuideCurve,
  height: HeightProfileReader,
  tunnel: M5TunnelPresentation,
): CourseSprite[] {
  return [
    compileCourseSprite(guide, height, {
      name: 'TUNNEL ENTRY PORTAL',
      s: M5_9_TUNNEL_ENTRY_S,
      l: 0,
      asset: tunnel.portalAsset,
    }),
    compileCourseSprite(guide, height, {
      name: 'TUNNEL NEAR RIB A',
      s: M5_9_TUNNEL_RIB_S[0],
      l: 0,
      asset: tunnel.ribAsset,
    }),
    compileCourseSprite(guide, height, {
      name: 'TUNNEL NEAR RIB B',
      s: M5_9_TUNNEL_RIB_S[1],
      l: 0,
      asset: tunnel.ribAsset,
    }),
    compileCourseSprite(guide, height, {
      name: 'TUNNEL EXIT PORTAL',
      s: M5_9_TUNNEL_EXIT_S,
      l: 0,
      asset: tunnel.portalAsset,
    }),
  ];
}
