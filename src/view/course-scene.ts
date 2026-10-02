import { createCourseRouteVisualReaders } from './course-route-visual-readers.js';
import { selectedSuccessor } from '../course/course-route.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { createDisplaySettings, type DisplaySettings } from './display-settings.js';
import { LOGICAL_HEIGHT } from './display-scale.js';
import { RENDER_NEAR_DEPTH_METERS, RENDER_FAR_DEPTH_METERS } from './camera.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CameraState } from './camera.js';
import { CAMERA_DEFINITION } from './camera-definition.js';
import type { VehicleRenderRead } from '../vehicle/physics/vehicle-contract.js';
import { createRenderWorkspace, renderDriving } from './renderer.js';
import type { CourseSprite } from './course-sprite.js';
import type { VehicleSpriteSet } from '../vehicle/vehicle-sprite-set.js';
import { createCourseWorld } from '../race/course-world.js';
import type { CourseLoadingWindow } from '../race/loading-coverage.js';

/** The current camera's loading window; reference driving and scenarios load the same Route. */
const COURSE_LOADING_WINDOW: CourseLoadingWindow = Object.freeze({
  cameraDistance: CAMERA_DEFINITION.dCam,
  near: RENDER_NEAR_DEPTH_METERS,
  far: RENDER_FAR_DEPTH_METERS,
});

/** The race's course world plus its rendering, shared by browser, tools, scenarios and smoke checks. */
export function createCourseScene(
  section: CompiledSection,
  gates: CompiledCourse['gates'],
  vehicles: readonly CompiledVehicleDefinition[],
  displaySettings: DisplaySettings = createDisplaySettings(),
) {
  const runtime = createCourseWorld(section, gates, vehicles, COURSE_LOADING_WINDOW);
  const rendering = createCourseRouteVisualReaders(runtime.window);
  rendering.read();
  const renderWorkspace = createRenderWorkspace();
  const worldSprites: CourseSprite[] = [];
  let lastRenderData: ReturnType<typeof rendering.read> | null = null;
  let lastSelection: typeof runtime.route.occurrences | null = null;
  let staticSpriteCount = 0;
  let terrainParameters: Parameters<typeof renderDriving>[1]['terrainParameters'];
  return Object.freeze({
    runtime,
    get world() {
      return runtime.readers;
    },
    render(
      target: Parameters<typeof renderDriving>[0],
      vehicle: VehicleRenderRead,
      camera: CameraState,
      playerSet: VehicleSpriteSet,
      others: readonly CourseSprite[],
    ) {
      const readers = runtime.readers;
      const renderData = rendering.read();
      // Route occurrences change exactly when a successor is selected or appended.
      const selection = runtime.route.occurrences;
      if (lastRenderData !== renderData || lastSelection !== selection) {
        worldSprites.length = 0;
        for (const sprite of renderData.worldSprites) worldSprites.push(sprite);
        // A state-selected sign shows once its own fork occurrence has selected another exit.
        for (const placement of renderData.conditionalSprites) {
          const selected = selectedSuccessor(runtime.route, placement.occurrence);
          if (selected && selected.from.carriageway.id !== placement.unselectedCarriagewayId)
            worldSprites.push(placement.sprite);
        }
        staticSpriteCount = worldSprites.length;
        terrainParameters = {
          screenHeight: LOGICAL_HEIGHT,
          dMin: RENDER_NEAR_DEPTH_METERS,
          dMax: RENDER_FAR_DEPTH_METERS,
          height: readers.renderHeight,
          extent: runtime.window,
        };
        lastRenderData = renderData;
        lastSelection = selection;
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
