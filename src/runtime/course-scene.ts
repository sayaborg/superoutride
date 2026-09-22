import { createDisplaySettings, type DisplaySettings } from '../graphics/display-settings.js';
import type { CourseGround } from '../compiler/course-ground.js';
import {
  LOGICAL_HEIGHT,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
} from '../core/presentation-scale.js';
import type { CompiledSection } from '../compiler/course-graph.js';
import type { CameraState } from '../camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../camera/current-camera-profile.js';
import { coursePortLateral } from '../compiler/course-links.js';
import { recoverVehicleToGuideCoordinate, type RecoveryState } from '../gameplay/recovery.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import type { VehicleRenderReadState } from '../physics/vehicle-contract.js';
import { createRenderWorkspace, renderDriving } from '../render/renderer.js';
import type { CourseSprite } from '../render/course-sprite.js';
import type { SpriteAssets } from '../image/sprite-assets.js';
import { createCourseDrivingGraph } from './course-driving-session.js';

/** One graph assembly for every course, including a single Section without Links. */
export function createCourseScene(
  section: CompiledSection,
  ground: CourseGround,
  assets: SpriteAssets,
  displaySettings: DisplaySettings = createDisplaySettings(),
) {
  const graph = createCourseDrivingGraph(section, ground);
  const session = graph.createSession();
  const entry = section.ports.find((port) => port.kind === 'entry');
  if (!entry || entry.anchor.s < CURRENT_CAMERA_PROFILE.dCam)
    throw new RangeError('Driving requires an entry Port with camera space behind it');
  const renderWorkspace = createRenderWorkspace();
  const worldSprites: CourseSprite[] = [];
  let lastView: typeof session.view | null = null;
  let lastClosed: typeof session.closedCarriageways | null = null;
  let staticSpriteCount = 0;
  let terrainProfile: Parameters<typeof renderDriving>[1]['terrainProfile'];
  return Object.freeze({
    session,
    metrics: graph.metrics,
    groundMetrics: ground.metrics,
    createActorSession: graph.createSession,
    get world() {
      return session.view.world;
    },
    get history() {
      return session.history;
    },
    observeStep: session.observeStep,
    recoverAtEntry(vehicle: ArcadeVehicleState, recovery: RecoveryState): boolean {
      if (session.history.active.ordinal !== 0 || vehicle.course.s >= entry.anchor.s) return false;
      recoverVehicleToGuideCoordinate(session.view.world, vehicle, {
        state: recovery,
        reason: 'wrong-course',
        target: { s: entry.anchor.s, l: coursePortLateral(entry) },
      });
      return true;
    },
    render(
      target: Parameters<typeof renderDriving>[0],
      vehicle: VehicleRenderReadState,
      camera: CameraState,
      playerKind: 'car' | 'bike',
      others: readonly CourseSprite[],
      appearance: SpriteAssets = assets,
    ) {
      const view = session.view;
      const { world, geometry, presentation } = view;
      const closed = session.closedCarriageways;
      if (lastView !== view || lastClosed !== closed) {
        worldSprites.length = 0;
        for (const sprite of presentation.worldSprites) worldSprites.push(sprite);
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
          assets: appearance,
          playerKind,
        },
        { ground: presentation.ground, workspace: renderWorkspace, bandMode: displaySettings.bandMode },
      );
    },
  });
}
