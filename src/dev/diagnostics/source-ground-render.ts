import { sampleReferencePaint, type ReferencePaintProfile } from '../fixtures/reference-paint.js';
import { renderDriving, type GroundColorReader } from '../../render/renderer.js';

/** Fixed paint inputs retained only for projection regressions and diagnostics. */
export function renderSourceGround(
  target: Parameters<typeof renderDriving>[0],
  scene: Omit<Parameters<typeof renderDriving>[1], 'groundProfile'> & { readonly groundProfile: ReferencePaintProfile },
  options: Partial<Parameters<typeof renderDriving>[2]> = {},
) {
  const ground: GroundColorReader = options.ground ?? {
    kind: 'source',
    kMax: 0,
    selectLevel: () => 0,
    sampleAtLevel: (s, l) => sampleReferencePaint(s, l, scene.groundProfile),
  };
  return renderDriving(target, scene, { ...options, ground });
}
