import { renderDriving, createRenderWorkspace } from '../../dist/render/renderer.js';
import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';
import { selectGroundLevel } from '../../dist/groundmap/resident-ground.js';
import {
  LOGICAL_HEIGHT,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
} from '../../dist/core/presentation-scale.js';

/** Diagnostic composition only: keep the production terrain, camera, painter and sprites. */
export function withBandTrialRendering(scene, footprint) {
  const assets = createSpriteAssets(),
    workspace = createRenderWorkspace(),
    worldSprites = [];
  let lastView,
    lastClosed,
    terrainProfile,
    ground,
    staticSpriteCount = 0;
  return {
    ...scene,
    get world() {
      return scene.world;
    },
    footprintRows() {
      return workspace.terrain.lines.map(({ y, d, sourceFootprint }) => ({
        y,
        distanceMetres: d,
        deltaS: sourceFootprint.deltaSEffective,
        formerLevel: selectGroundLevel(sourceFootprint.deltaSEffective, 12),
      }));
    },
    render(target, vehicle, camera, playerKind, others = []) {
      const view = scene.session.view,
        closed = scene.session.closedCarriageways;
      const { world, geometry, presentation } = view;
      if (lastView !== view || lastClosed !== closed) {
        worldSprites.length = 0;
        worldSprites.push(...presentation.worldSprites);
        for (const placement of presentation.conditionalSprites)
          if (closed.includes(placement.unselected)) worldSprites.push(placement.sprite);
        staticSpriteCount = worldSprites.length;
        terrainProfile = {
          screenHeight: LOGICAL_HEIGHT,
          dMin: CURRENT_RENDER_NEAR_DEPTH_METERS,
          dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
          ...presentation.groundProfile,
          height: world.height,
          visual: presentation.visual,
        };
        ground = {
          ...presentation.ground,
          selectLevel(deltaS) {
            footprint.deltaS = deltaS;
            return 0;
          },
        };
        lastView = view;
        lastClosed = closed;
      }
      worldSprites.length = staticSpriteCount;
      for (const sprite of others) worldSprites.push(sprite);
      return renderDriving(
        target,
        {
          background: presentation.backgroundAt(camera.s),
          guide: geometry,
          camera,
          vehicle,
          terrainProfile,
          groundProfile: presentation.groundProfile,
          worldSprites,
          assets,
          playerKind,
        },
        { ground, workspace },
      );
    },
  };
}
