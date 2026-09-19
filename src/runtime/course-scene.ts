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
import { renderDriving, type GroundColorReader } from '../render/renderer.js';
import { createCoursePresentationPreview } from '../render/course-presentation-preview.js';
import { createSpriteAssets } from '../visual/sprite-assets.js';
import { createCourseGeometryTraversal } from './course-occurrence.js';
import { createCourseGeometryView } from './course-geometry-view.js';
import { createCourseSectionDrivingSource } from './course-section-driving-view.js';

/** One assembly shared by browser play and offline frames. Lower layers see ordinary readers. */
export function createCourseScene(section: CompiledSection) {
  if (!section.presentation) throw new RangeError('Driving requires saved Section presentation');
  const entry = section.ports.find((port) => port.kind === 'entry');
  if (!entry || entry.anchor.s < CURRENT_CAMERA_PROFILE.dCam)
    throw new RangeError('Driving requires an entry Port with camera space behind it');
  const traversal = createCourseGeometryTraversal(section, { retainBehind: 0, selectAhead: 0, maxOccurrences: 2 });
  const extent = { behind: 0, ahead: 0 };
  const view = createCourseGeometryView(traversal.snapshot(), {
    pose: { minS: 0, maxS: section.raster.length, maxAdvance: 0 },
    consumers: { cameraRender: extent, contact: extent, driverLookahead: extent, reverseRecovery: extent },
  });
  if (!view.ok) throw new RangeError(`Cannot assemble Section: ${JSON.stringify(view)}`);
  const driving = createCourseSectionDrivingSource(section).createView(view.value);
  if (!driving.ok) throw new RangeError(`Cannot assemble driving readers: ${JSON.stringify(driving)}`);
  const { world, geometry } = driving.value;
  const presentation = createCoursePresentationPreview().createSource(section.presentation, geometry, world.height);
  const ground: GroundColorReader = Object.freeze({
    kind: 'source',
    kMax: 0,
    selectLevel: () => 0,
    sampleAtLevel(s: number, l: number) {
      const { left, right } = presentation.ground.domain;
      if (l >= left && l < right) return presentation.ground.sample(s, l);
      const environment = presentation.visual.sample(s);
      const base = l < left ? environment.groundBaseLeft : environment.groundBaseRight;
      return base.kind === 'color' ? base.color : null;
    },
  });
  const groundProfile = {
    groundLeft: section.presentation.ground.left,
    groundRight: section.presentation.ground.right,
  };
  const terrainProfile = {
    screenHeight: LOGICAL_HEIGHT,
    dMin: CURRENT_RENDER_NEAR_DEPTH_METERS,
    dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
    ...groundProfile,
    height: world.height,
    visual: presentation.visual,
  };
  const assets = createSpriteAssets();
  const worldSprites = presentation.sprites.map((placement) => placement.sprite);
  return Object.freeze({
    world,
    recoverAtEntry(vehicle: ArcadeVehicleState, recovery: RecoveryState): boolean {
      if (vehicle.course.s >= entry.anchor.s) return false;
      recoverVehicleToGuideCoordinate(world, vehicle, {
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
    ) {
      let environment = 0;
      while (
        environment + 1 < section.presentation!.environments.length &&
        section.presentation!.environments[environment + 1]!.anchor.s <= camera.s
      )
        environment += 1;
      return renderDriving(
        target,
        {
          background: presentation.backgrounds[environment]!,
          guide: geometry,
          camera,
          vehicle,
          terrainProfile,
          groundProfile,
          worldSprites,
          assets,
          playerKind,
        },
        { ground },
      );
    },
  });
}
