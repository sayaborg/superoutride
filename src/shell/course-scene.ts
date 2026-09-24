import { createCourseRouteVisualReaders } from '../view/course-route-visual-readers.js';
import { ENVELOPE_DRIVER } from '../race/envelope-driver.js';
import { COURSE_DRIVING_POLICY } from '../race/course-driving-policy.js';
import { createDisplaySettings, type DisplaySettings } from '../view/display-settings.js';
import type { CourseGround } from '../course/compiler/course-ground.js';
import { LOGICAL_HEIGHT } from '../view/display-scale.js';
import { RENDER_NEAR_DEPTH_METERS, RENDER_FAR_DEPTH_METERS } from '../view/camera.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CameraState } from '../view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../view/current-camera-profile.js';
import { courseCutLateral, entryCut } from '../course/compiler/course-links.js';
import { recoverVehicleToPlanCoordinate, type RecoveryState } from '../race/recovery.js';
import type { ArcadeVehicleState } from '../vehicle/physics/arcade-vehicle-physics.js';
import type { VehicleRenderReadState } from '../vehicle/physics/vehicle-contract.js';
import { createRenderWorkspace, renderDriving } from '../view/renderer.js';
import type { CourseSprite } from '../view/course-sprite.js';
import type { SpriteAssets } from '../image/sprite-assets.js';
import { createSharedRouteDrivingGraph } from '../race/shared-route-driving-session.js';
import type { VisualProfileReader } from '../course/visual-profile.js';

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
  // The camera and step/contact readers extend behind the vehicle. Recover before either can
  // reach the entry cut, then place the car with a full camera distance behind it again.
  const entryRecovery = Object.freeze({
    startS: 2 * CURRENT_CAMERA_PROFILE.dCam,
    targetS: 3 * CURRENT_CAMERA_PROFILE.dCam,
  });
  if (entryRecovery.targetS > section.raster.length)
    throw new RangeError('Driving requires an entry Section long enough for entry recovery');
  if (
    section.fork &&
    section.fork.lock.s +
      Math.max(RENDER_FAR_DEPTH_METERS, ENVELOPE_DRIVER.lookahead) +
      COURSE_DRIVING_POLICY.guard.step.ahead >
      Math.min(...section.outgoing.map((link) => link.from.anchor.s))
  )
    throw new RangeError('Fork parent must cover pre-lock render and driver queries through one fixed step');
  const graph = createSharedRouteDrivingGraph(section, {
    distance: CURRENT_CAMERA_PROFILE.dCam,
    far: RENDER_FAR_DEPTH_METERS,
    near: RENDER_NEAR_DEPTH_METERS,
  });
  graph.refresh(
    Math.min(...rules.grid.map((slot) => slot.anchor.s)),
    Math.max(...rules.grid.map((slot) => slot.anchor.s)),
  );
  const session = graph.createSession();
  const rendering = createCourseRouteVisualReaders(graph.route, ground);
  rendering.read();
  const entry = entryCut(section, '/entrySectionId');
  const renderWorkspace = createRenderWorkspace();
  const worldSprites: CourseSprite[] = [];
  let lastPresentation: ReturnType<typeof rendering.read> | null = null;
  let lastClosed: typeof session.closedCarriageways | null = null;
  let staticSpriteCount = 0;
  let terrainParameters: Parameters<typeof renderDriving>[1]['terrainParameters'];
  return Object.freeze({
    session,
    entryRecovery,
    metrics: graph.metrics,
    groundMetrics: ground.metrics,
    createActorSession: graph.createSession,
    get world() {
      return session.view.world;
    },
    observeStep: session.observeStep,
    recoverAtEntry(vehicle: ArcadeVehicleState, recovery: RecoveryState): boolean {
      if (vehicle.course.s >= entryRecovery.startS) return false;
      recoverVehicleToPlanCoordinate(session.view.world, vehicle, {
        state: recovery,
        reason: 'wrong-course',
        target: { s: entryRecovery.targetS, l: courseCutLateral(entry) },
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
      const { world, geometry } = view;
      const presentation = rendering.read();
      const closed = session.closedCarriageways;
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
          height: view.renderHeight,
          physicalHeight: world.height,
          visual: presentation.visual as VisualProfileReader,
        };
        lastPresentation = presentation;
        lastClosed = closed;
      }
      worldSprites.length = staticSpriteCount;
      for (const sprite of others) worldSprites.push(sprite);
      return renderDriving(
        target,
        {
          background: presentation.backgroundAt(camera.s) ?? presentation.backgroundAt(graph.route.start)!,
          guide: geometry,
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
