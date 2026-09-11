/** Fixed shared parent content for route regressions, independent of current browser defaults. */
import { STADIUM_JUNCTION } from '../../dist/dev/courses/stadium-junction.js';
import {
  CENTER_DASH_MARKINGS,
  createStadiumSurfaceRegionAuthoring,
} from '../../dist/dev/courses/stadium-surface-authoring.js';
import { createHillDipHeightProfile } from '../../dist/dev/fixtures/hill-dip-height.js';
import { SurfaceMap } from '../../dist/physics/surface-map.js';
import { compileSurfaceRegions } from '../../dist/runtime/surface-region-compiler.js';
import { createFarBackground } from '../../dist/visual/far-background.js';
import { VisualProfile } from '../../dist/visual/visual-profile.js';

export function parentShared(guide) {
  const compiled = compileSurfaceRegions(guide.length, createStadiumSurfaceRegionAuthoring(guide.length));
  const heightProfile = createHillDipHeightProfile(guide.length);
  const visualProfile = new VisualProfile(guide.length, compiled.visualSections);
  const surfaceMap = new SurfaceMap(guide.length, compiled.surfaceSections, STADIUM_JUNCTION);
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    roadMarkings: CENTER_DASH_MARKINGS,
    junctionMarkings: CENTER_DASH_MARKINGS,
    shoulderWidth: 1,
    junction: STADIUM_JUNCTION,
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
