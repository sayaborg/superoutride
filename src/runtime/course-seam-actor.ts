import { createCourseSpriteObservation, reframeCourseSpriteObservation } from '../render/course-sprite.js';
import { guideCoordinateToWorld, locateWorldOnGuideCoordinateLocal } from '../core/guide-coordinate-frame.js';
import type { CameraProfile, CameraRig, CameraState } from '../camera/camera.js';
import { wrapAngle, type Vec2 } from '../core/math.js';
import { transformPlanarPoint, transformPlanarVector } from '../core/planar-transform.js';
import { courseBandAt, courseBoundaryAt } from '../course/course-bands.js';
import { coursePortLateral } from '../compiler/course-links.js';
import { compileWorldCrossingGate, observeWorldCrossingGate } from '../gameplay/world-crossing-gate.js';
import type { RecoveryProfile, RecoveryState } from '../gameplay/recovery.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { VEHICLE_PROJECTION_SEARCH_RADIUS } from '../physics/vehicle-dynamics.js';
import { createCourseGeometryView } from './course-geometry-view.js';
import { courseSectionDrivingDemand, courseOccurrenceDrivingDemand } from './course-driving-demand.js';
import type { createCourseDrivingSource } from './course-driving-view.js';
import type { CourseOccurrence, CourseOccurrenceHistory, createCourseGeometryTraversal } from './course-occurrence.js';

type Source = ReturnType<typeof createCourseDrivingSource>;
type Traversal = ReturnType<typeof createCourseGeometryTraversal>;
const failure = (reason: string) => Object.freeze({ ok: false as const, reason });

/** Scoped common-guard actor transaction. Static source products and accepted race progress stay outside. */
export function createCourseSeamActor(
  source: Source,
  traversal: Traversal,
  successor: CourseOccurrence,
  vehicle: ArcadeVehicleState,
  rig: CameraRig,
  recovery: RecoveryState,
  initialCamera: CameraState,
  settings: {
    readonly camera: CameraProfile;
    readonly render: { readonly width: number; readonly dMin: number; readonly dMax: number };
    readonly recovery: RecoveryProfile;
    readonly step: { readonly behind: number; readonly ahead: number };
    readonly targetL: number;
  },
) {
  if (
    !source ||
    !traversal ||
    !successor ||
    !successor.incoming ||
    !vehicle ||
    !rig ||
    !recovery ||
    !initialCamera ||
    !settings ||
    !settings.step ||
    !settings.camera ||
    !settings.render ||
    !settings.recovery
  )
    throw new TypeError(
      'Seam actor requires compiled readers, traversal, live actor/camera/recovery and consumer settings',
    );
  if ([settings.step.behind, settings.step.ahead, settings.targetL].some((v) => typeof v !== 'number'))
    throw new TypeError('Seam actor step and lateral target must be numeric');
  if (
    ![settings.step.behind, settings.step.ahead, settings.targetL].every(Number.isFinite) ||
    settings.step.behind < 0 ||
    settings.step.ahead < 0
  )
    throw new RangeError('Seam actor needs finite nonnegative step extents');
  const config = Object.freeze({
    camera: Object.freeze({ ...settings.camera }),
    render: Object.freeze({ ...settings.render }),
    recovery: Object.freeze({ ...settings.recovery }),
    step: Object.freeze({ ...settings.step }),
    targetL: settings.targetL,
  });
  const link = successor.incoming;
  // A saved physical/presentation overlap is not a lock-to-closure transfer certificate.
  if (link.source.section.outgoing.length > 1) return failure('fork_transfer_unqualified');
  const portFor = (history: CourseOccurrenceHistory) => {
    if (history.active === successor) return link.destination;
    if (history.active.ordinal === successor.ordinal - 1 && history.active.section === link.source.section)
      return link.source;
    throw new RangeError('Seam actor frame must be one of its actual Link occurrences');
  };
  const makeView = (history: CourseOccurrenceHistory, s: number, lastSafeS: number) => {
    const port = portFor(history),
      guide = history.active.section.guide;
    if (s - config.step.behind < 0 || s + config.step.ahead > guide.length) return failure('pose_domain_exhausted');
    const demand = courseSectionDrivingDemand(
      guide,
      { minS: s - config.step.behind, maxS: s, maxAdvance: config.step.ahead },
      config.camera,
      config.render,
      { ...config.recovery, lastSafeS },
    );
    const geometry = createCourseGeometryView(history, demand);
    if (!geometry.ok) return geometry;
    const refined = courseOccurrenceDrivingDemand(geometry.value, demand, { ...config.recovery, lastSafeS });
    if (!refined.ok) return refined;
    const covered = createCourseGeometryView(history, refined.value);
    if (!covered.ok) return covered;
    const result = source.createSeamView(covered.value, successor);
    if (!result.ok) return result;
    // Ordinary driver/camera heading queries use chart zero. It must belong to this physical proof.
    guideCoordinateToWorld(result.value.world.guide, port.anchor.s, 0);
    return result;
  };
  const initialHistory = traversal.snapshot(),
    initial = makeView(initialHistory, vehicle.course.s, recovery.lastSafeS);
  if (!initial.ok) return initial;
  const poseAdmission = initial.value.admitMotion(vehicle, vehicle);
  if (!poseAdmission.ok) return poseAdmission;
  const cameraAdmission = initial.value.admitCamera(initialCamera, config.render);
  if (!cameraAdmission.ok) return cameraAdmission;
  let history = initialHistory,
    view = initial.value,
    camera = Object.freeze({ ...initialCamera }),
    previous: Vec2 = Object.freeze({ x: vehicle.x, z: vehicle.z }),
    targetL = config.targetL;
  let sprites = createCourseSpriteObservation(
    view.presentation.worldSprites,
    camera,
    config.render.dMin,
    config.render.dMax,
  );
  const snapshot = () => Object.freeze({ frame: history.active, view, camera, sprites, previous, targetL });
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      snapshot,
      /** Call after one ordinary physical step and camera observation, before publishing the scene. */
      observeStep(observedCamera: CameraState) {
        if (traversal.snapshot() !== history) return failure('stale_actor_frame');
        const admittedMotion = view.admitMotion(previous, vehicle);
        if (!admittedMotion.ok) return admittedMotion;
        const admittedCamera = view.admitCamera(observedCamera, config.render);
        if (!admittedCamera.ok) return admittedCamera;
        const observedSprites = createCourseSpriteObservation(
          view.presentation.worldSprites,
          observedCamera,
          config.render.dMin,
          config.render.dMax,
        );
        const port = portFor(history),
          center = coursePortLateral(port);
        const left = Math.min(...port.carriageway.bands.map((b) => courseBoundaryAt(b.left, port.anchor.s))),
          right = Math.max(...port.carriageway.bands.map((b) => courseBoundaryAt(b.right, port.anchor.s)));
        const gate = compileWorldCrossingGate({
          id: link.id,
          center: port.pose,
          heading: port.pose.heading,
          halfWidth: Math.max(center - left, right - center),
        });
        const crossing = observeWorldCrossingGate(gate, previous, vehicle);
        const direction = history.active === successor ? 'reverse' : 'forward';
        const expected = direction === 'forward' ? 'FORWARD' : 'REVERSE';
        const band = crossing
          ? courseBandAt(port.section.bandPartition, port.anchor.s, crossing.lateral, center)
          : null;
        if (
          !crossing ||
          crossing.direction !== expected ||
          !band ||
          !port.carriageway.bands.includes(band) ||
          !view.world.surfaces.sample(port.anchor.s, center + crossing.lateral).material.supported
        ) {
          const next = makeView(history, vehicle.course.s, recovery.lastSafeS);
          if (!next.ok) return next;
          view = next.value;
          camera = Object.freeze({ ...observedCamera });
          sprites = observedSprites;
          previous = Object.freeze({ x: vehicle.x, z: vehicle.z });
          return Object.freeze({ ok: true as const, committed: false as const });
        }
        const prepared = traversal.prepare(direction);
        if (!prepared.ok) return prepared;
        const movement = prepared.value,
          destination = portFor(movement.history),
          transform = movement.destinationFromSource,
          yaw = Math.atan2(transform.sine, transform.cosine),
          rebase = (s: number) => destination.anchor.s + (s - port.anchor.s),
          nextS = rebase(vehicle.course.s),
          nextSafeS = rebase(recovery.lastSafeS),
          nextTargetL = coursePortLateral(destination) + (targetL - center);
        const next = makeView(movement.history, nextS, nextSafeS);
        if (!next.ok) return next;
        const position = transformPlanarPoint(transform, vehicle),
          velocity = transformPlanarVector(transform, { x: vehicle.velocityX, z: vehicle.velocityZ }),
          oldPrevious = transformPlanarPoint(transform, previous);
        const coordinate = locateWorldOnGuideCoordinateLocal(
          next.value.world.guide,
          position,
          vehicle.course.segmentIndex,
          VEHICLE_PROJECTION_SEARCH_RADIUS,
          false,
        );
        const nextCamera: CameraState = Object.freeze({
          ...observedCamera,
          ...transformPlanarPoint(transform, observedCamera),
          s: rebase(observedCamera.s),
          yaw: wrapAngle(observedCamera.yaw + yaw),
          movementYaw: wrapAngle(observedCamera.movementYaw + yaw),
          guideHeadingAtCar: wrapAngle(observedCamera.guideHeadingAtCar + yaw),
        });
        const nextMotion = next.value.admitMotion(oldPrevious, position);
        if (!nextMotion.ok) return nextMotion;
        const nextCameraAdmission = next.value.admitCamera(nextCamera, config.render);
        if (!nextCameraAdmission.ok) return nextCameraAdmission;
        const nextSprites = reframeCourseSpriteObservation(
          observedSprites,
          transform,
          port.anchor.s,
          destination.anchor.s,
        );
        // All fallible construction and reader checks precede this synchronous, callback-free publication.
        const committed = movement.commit();
        if (!committed.ok) return committed;
        vehicle.x = position.x;
        vehicle.z = position.z;
        vehicle.velocityX = velocity.x;
        vehicle.velocityZ = velocity.z;
        vehicle.yaw = wrapAngle(vehicle.yaw + yaw);
        vehicle.course = coordinate;
        // Pitch/yaw rates are body/up scalars. Derived omegaWorld rotates with the new body basis.
        // Contact caches are scalar observations; the next contact solve reconstructs world vectors.
        rig.yaw = wrapAngle(rig.yaw + yaw);
        rig.movementYaw = wrapAngle(rig.movementYaw + yaw);
        recovery.lastSafeS = nextSafeS;
        history = movement.history;
        view = next.value;
        camera = nextCamera;
        sprites = nextSprites;
        targetL = nextTargetL;
        previous = Object.freeze(position);
        return Object.freeze({
          ok: true as const,
          committed: true as const,
          direction,
          motion: Object.freeze({ previous: Object.freeze(oldPrevious), current: previous }),
          destinationFromSource: transform,
        });
      },
      /** A reported recovery/replacement resets crossing observations, never traversal or progress. */
      resetObservation(observedCamera: CameraState) {
        if (traversal.snapshot() !== history) return failure('stale_actor_frame');
        const next = makeView(history, vehicle.course.s, recovery.lastSafeS);
        if (!next.ok) return next;
        const pose = next.value.admitMotion(vehicle, vehicle);
        if (!pose.ok) return pose;
        const admission = next.value.admitCamera(observedCamera, config.render);
        if (!admission.ok) return admission;
        const nextSprites = createCourseSpriteObservation(
          next.value.presentation.worldSprites,
          observedCamera,
          config.render.dMin,
          config.render.dMax,
        );
        view = next.value;
        camera = Object.freeze({ ...observedCamera });
        sprites = nextSprites;
        previous = Object.freeze({ x: vehicle.x, z: vehicle.z });
        return Object.freeze({ ok: true as const });
      },
    }),
  });
}
