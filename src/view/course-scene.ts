import { createCourseRouteVisualReaders } from './course-route-visual-readers.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { createDisplaySettings, type DisplaySettings } from './display-settings.js';
import type { CourseGround } from '../course/compiler/course-ground.js';
import { LOGICAL_HEIGHT } from './display-scale.js';
import { RENDER_NEAR_DEPTH_METERS, RENDER_FAR_DEPTH_METERS } from './camera.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CameraState } from './camera.js';
import { CURRENT_CAMERA_PROFILE } from './current-camera-profile.js';
import type { VehicleRenderReadState } from '../vehicle/physics/vehicle-contract.js';
import { createRenderWorkspace, renderDriving } from './renderer.js';
import type { CourseSprite } from './course-sprite.js';
import type { VehicleSpriteSet } from '../image/sprite-assets.js';
import { createCourseWorld, type CourseLoadingWindow } from '../race/course-world.js';

/** The current camera's loading window; reference driving and scenarios load the same Route. */
export const COURSE_LOADING_WINDOW: CourseLoadingWindow = Object.freeze({
  cameraDistance: CURRENT_CAMERA_PROFILE.dCam,
  near: RENDER_NEAR_DEPTH_METERS,
  far: RENDER_FAR_DEPTH_METERS,
});

/** The race's course world plus its rendering, shared by browser, tools, scenarios and smoke checks. */
export function createCourseScene(
  section: CompiledSection,
  ground: CourseGround,
  gates: CompiledCourse['gates'],
  vehicles: readonly CompiledVehicleDefinition[],
  displaySettings: DisplaySettings = createDisplaySettings(),
) {
  const runtime = createCourseWorld(section, gates, vehicles, COURSE_LOADING_WINDOW);
  const rendering = createCourseRouteVisualReaders(runtime.route, ground);
  rendering.read();
  const renderWorkspace = createRenderWorkspace();
  const worldSprites: CourseSprite[] = [];
  let lastRenderData: ReturnType<typeof rendering.read> | null = null;
  let lastClosed: typeof runtime.closedCarriageways | null = null;
  let staticSpriteCount = 0;
  let terrainParameters: Parameters<typeof renderDriving>[1]['terrainParameters'];
  return Object.freeze({
    runtime,
    metrics: runtime.metrics,
    groundMetrics: ground.metrics,
    get world() {
      return runtime.readers;
    },
    render(
      target: Parameters<typeof renderDriving>[0],
      vehicle: VehicleRenderReadState,
      camera: CameraState,
      playerSet: VehicleSpriteSet,
      others: readonly CourseSprite[],
    ) {
      const readers = runtime.readers;
      const renderData = rendering.read();
      const closed = runtime.closedCarriageways;
      if (lastRenderData !== renderData || lastClosed !== closed) {
        worldSprites.length = 0;
        for (const sprite of renderData.worldSprites) worldSprites.push(sprite);
        for (const placement of renderData.conditionalSprites)
          if (closed.includes(placement.unselected)) worldSprites.push(placement.sprite);
        staticSpriteCount = worldSprites.length;
        terrainParameters = {
          screenHeight: LOGICAL_HEIGHT,
          dMin: RENDER_NEAR_DEPTH_METERS,
          dMax: RENDER_FAR_DEPTH_METERS,
          height: readers.renderHeight,
          extent: runtime.route,
          environment: renderData.environment,
        };
        lastRenderData = renderData;
        lastClosed = closed;
      }
      worldSprites.length = staticSpriteCount;
      for (const sprite of others) worldSprites.push(sprite);
      return renderDriving(
        target,
        {
          background: renderData.backgroundAt(camera.s),
          guide: readers,
          camera,
          vehicle,
          terrainParameters,
          worldSprites,
          playerSet,
        },
        { ground: renderData.ground, workspace: renderWorkspace, stripMethod: displaySettings.stripMethod },
      );
    },
  });
}
