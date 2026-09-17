import { clamp } from '../../core/math.js';
import { sampleGroundMap, type GroundMapProfile } from '../../groundmap/ground-map.js';
import { sampleStageGroundMapAtLevel } from '../../groundmap/stage-ground-map-view.js';
import { renderDriving, type GroundColorReader } from '../../render/renderer.js';

/** Input-only bridge for compiler previews and frozen procedural pixel regressions. No product import. */
export function renderSourceGround(
  target: Parameters<typeof renderDriving>[0],
  scene: Omit<Parameters<typeof renderDriving>[1], 'groundProfile'> & { readonly groundProfile: GroundMapProfile },
  options: Partial<Parameters<typeof renderDriving>[2]> = {},
) {
  const { groundProfile: profile } = scene;
  const view = options.roadView;
  const baked = profile.baked;
  const ground: GroundColorReader = options.ground ?? {
    kind: baked ? 'baked' : 'source',
    kMax: baked?.kMax ?? 0,
    selectLevel: (footprint) => baked?.selectLevel(footprint) ?? 0,
    sampleAtLevel: (s, l, level) =>
      view
        ? sampleStageGroundMapAtLevel(s, clamp(l, -view.groundLeft, view.groundRight), level, view, profile)
        : baked
          ? baked.sampleAtLevel(s, l, level)
          : sampleGroundMap(s, l, profile),
  };
  return renderDriving(target, scene, { ...options, ground });
}
