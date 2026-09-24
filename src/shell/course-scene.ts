import { createCourseRouteVisualReaders } from '../view/course-route-visual-readers.js';
import { ENVELOPE_DRIVER } from '../race/envelope-driver.js';
import { VEHICLE_CATALOG } from '../vehicle/vehicle-catalog.js';
import { SIM_DT } from './frame-loop.js';
import { createDisplaySettings, type DisplaySettings } from '../view/display-settings.js';
import type { CourseGround } from '../course/compiler/course-ground.js';
import { LOGICAL_HEIGHT } from '../view/display-scale.js';
import { RENDER_NEAR_DEPTH_METERS, RENDER_FAR_DEPTH_METERS } from '../view/camera.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CameraState } from '../view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../view/current-camera-profile.js';
import type { VehicleRenderReadState } from '../vehicle/physics/vehicle-contract.js';
import { createRenderWorkspace, renderDriving } from '../view/renderer.js';
import type { CourseSprite } from '../view/course-sprite.js';
import type { SpriteAssets } from '../image/sprite-assets.js';
import { createRouteRuntime } from '../race/route-runtime.js';

/** One graph assembly for every course, including a single Section without Links. */
export function createCourseScene(
  section: CompiledSection,
  ground: CourseGround,
  assets: SpriteAssets,
  rules: CompiledCourse['rules'],
  displaySettings: DisplaySettings = createDisplaySettings(),
) {
  if (!rules?.grid.length) throw new RangeError('Driving requires saved Session rules with a starting grid');
  if (Math.min(...rules.grid.map((slot) => slot.anchor.s)) < CURRENT_CAMERA_PROFILE.dCam)
    throw new RangeError('Driving requires the rearmost grid position to have camera space behind it');
  // Loading coverage at 240 m/s (864 km/h), not a mechanics speed clamp.
  const maximumStepMeters = 240 * SIM_DT;
  const contactReachMeters = Math.ceil(
    Math.max(
      ...VEHICLE_CATALOG.flatMap(({ profile }) =>
        [profile.frontStation, profile.rearStation].map((station) =>
          Math.hypot(station.forwardOffset, station.freeReachDown),
        ),
      ),
    ),
  );
  if (
    section.fork &&
    section.fork.lock.s + Math.max(RENDER_FAR_DEPTH_METERS, ENVELOPE_DRIVER.lookahead) + maximumStepMeters >
      section.raster.length
  )
    throw new RangeError('Fork parent must cover pre-lock render and driver queries through one fixed step');
  const runtime = createRouteRuntime(section, {
    cameraDistance: CURRENT_CAMERA_PROFILE.dCam,
    far: RENDER_FAR_DEPTH_METERS,
    near: RENDER_NEAR_DEPTH_METERS,
    maximumStepMeters,
    contactReachMeters,
  });
  runtime.refresh(
    Math.min(...rules.grid.map((slot) => slot.anchor.s)),
    Math.max(...rules.grid.map((slot) => slot.anchor.s)),
  );
  const rendering = createCourseRouteVisualReaders(runtime.route, ground);
  rendering.read();
  const renderWorkspace = createRenderWorkspace();
  const worldSprites: CourseSprite[] = [];
  let lastPresentation: ReturnType<typeof rendering.read> | null = null;
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
      playerKind: 'car' | 'bike',
      others: readonly CourseSprite[],
      appearance: SpriteAssets = assets,
    ) {
      const readers = runtime.readers;
      const presentation = rendering.read();
      const closed = runtime.closedCarriageways;
      if (lastPresentation !== presentation || lastClosed !== closed) {
        worldSprites.length = 0;
        for (const sprite of presentation.worldSprites) worldSprites.push(sprite);
        for (const placement of presentation.conditionalSprites)
          if (closed.includes(placement.unselected)) worldSprites.push(placement.sprite);
        staticSpriteCount = worldSprites.length;
        terrainParameters = {
          screenHeight: LOGICAL_HEIGHT,
          dMin: RENDER_NEAR_DEPTH_METERS,
          dMax: RENDER_FAR_DEPTH_METERS,
          ...presentation.groundRuler,
          height: readers.renderHeight,
          extent: runtime.route,
          physicalHeight: readers.height,
          visual: presentation.visual,
        };
        lastPresentation = presentation;
        lastClosed = closed;
      }
      worldSprites.length = staticSpriteCount;
      for (const sprite of others) worldSprites.push(sprite);
      return renderDriving(
        target,
        {
          background: presentation.backgroundAt(camera.s),
          guide: readers,
          camera,
          vehicle,
          terrainParameters,
          groundRuler: presentation.groundRuler,
          worldSprites,
          assets: appearance,
          playerKind,
        },
        { ground: presentation.ground, workspace: renderWorkspace, bandMethod: displaySettings.bandMethod },
      );
    },
  });
}
