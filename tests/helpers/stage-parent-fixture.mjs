/** Fixed shared parent content for route regressions, independent of current browser defaults. */
import { CENTER_DASH_MARKINGS } from '../../dist/dev/m5-surface-authoring.js';
import { compileSurfaceRegions } from '../../dist/compiler/surface-region-compiler.js';
import { M6_13_JUNCTION } from '../../dist/dev/m6-13-junction.js';
import { createM5DebugSurfaceRegionAuthoring } from '../../dist/dev/m5-surface-authoring.js';
import { SurfaceMap } from '../../dist/physics/surface-map.js';
import { createFarBackground } from '../../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../../dist/dev/m3-debug-height-profile.js';
import { VisualProfile } from '../../dist/visual/visual-profile.js';

export function parentShared(guide) {
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const visualProfile = new VisualProfile(guide.length, compiled.visualSections);
  const surfaceMap = new SurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    roadMarkings: CENTER_DASH_MARKINGS,
    junctionMarkings: CENTER_DASH_MARKINGS,
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
    logical: compiled.groundMap,
  };
  return {
    heightProfile,
    surfaceMap,
    groundProfile,
    terrainProfile: {
      screenHeight: 240,
      dMin: 2.5,
      dMax: 150,
      groundLeft: 12,
      groundRight: 12,
      roadLeft: 4.5,
      roadRight: 4.5,
      height: heightProfile,
      visual: visualProfile,
      thinSpanScreenRows: 1,
    },
    selectFarBackground: () => createFarBackground(),
    worldSprites: [],
  };
}
