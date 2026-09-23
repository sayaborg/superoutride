import { compileCoursePhysicalDomains } from '../course/compiler/course-physical-overlap.js';
import { compileCoursePresentationDomains } from '../course/compiler/course-presentation-overlap.js';
import { createCourseDrivingSource } from '../course/course-driving-source.js';
import { createCourseDrivingViewSource } from '../view/course-driving-view.js';
import { ENVELOPE_DRIVER } from '../race/envelope-driver.js';
import { COURSE_DRIVING_POLICY } from '../race/course-driving-policy.js';
import { createDisplaySettings, type DisplaySettings } from '../view/display-settings.js';
import type { CourseGround } from '../course/compiler/course-ground.js';
import { LOGICAL_HEIGHT } from '../view/presentation-scale.js';
import { CURRENT_RENDER_NEAR_DEPTH_METERS, CURRENT_RENDER_FAR_DEPTH_METERS } from '../view/camera.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CameraState } from '../view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../view/current-camera-profile.js';
import { coursePortLateral } from '../course/compiler/course-links.js';
import { recoverVehicleToGuideCoordinate, type RecoveryState } from '../race/recovery.js';
import type { ArcadeVehicleState } from '../vehicle/physics/arcade-vehicle-physics.js';
import type { VehicleRenderReadState } from '../vehicle/physics/vehicle-contract.js';
import { createRenderWorkspace, renderDriving } from '../view/renderer.js';
import type { CourseSprite } from '../view/course-sprite.js';
import type { SpriteAssets } from '../image/sprite-assets.js';
import { createCourseDrivingGraph } from '../race/course-driving-session.js';

function required<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new RangeError(`Course driving admission failed: ${JSON.stringify(result)}`);
  return result.value;
}

/** One graph assembly for every course, including a single Section without Links. */
export function createCourseScene(
  section: CompiledSection,
  ground: CourseGround,
  assets: SpriteAssets,
  displaySettings: DisplaySettings = createDisplaySettings(),
) {
  const sections = new Set<CompiledSection>();
  const visit = (section: CompiledSection) => {
    if (sections.has(section)) return;
    sections.add(section);
    section.outgoing.forEach((link) => visit(link.destination.section));
  };
  visit(section);
  const links = [...sections].flatMap((section) => section.outgoing);
  const { pose, step, contact } = COURSE_DRIVING_POLICY.guard;
  for (const section of sections) {
    if (
      section.fork &&
      section.fork.lock.s + Math.max(CURRENT_RENDER_FAR_DEPTH_METERS, ENVELOPE_DRIVER.lookahead) + step.ahead >
        Math.min(...section.outgoing.map((link) => link.source.anchor.s))
    )
      throw new RangeError('Fork parent must cover pre-lock render and driver queries through one fixed step');
  }
  const zero = { behind: 0, ahead: 0, left: 0, right: 0 };
  const physical = required(
    compileCoursePhysicalDomains(links, {
      pose,
      step,
      consumers: { contact, driverLookahead: zero, reverseRecovery: zero },
    }),
  );
  const presentation = required(
    compileCoursePresentationDomains(links, {
      pose,
      step,
      consumers: { cameraRender: contact, groundFilter: zero, scenery: zero },
    }),
  );
  const source = createCourseDrivingSource(physical);
  const rendering = createCourseDrivingViewSource(ground, physical, presentation);
  const graph = createCourseDrivingGraph(section, source);
  const session = graph.createSession();
  required(rendering.createView(session.view));
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
      const { world, geometry } = view;
      const presentation = required(rendering.createView(view));
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
