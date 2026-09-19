import type { CameraRig } from '../camera/camera.js';
import type { CompiledSection } from '../compiler/course-graph.js';
import { coursePortLateral } from '../compiler/course-links.js';
import { compileCoursePhysicalDomains } from '../compiler/course-physical-overlap.js';
import { compileCoursePresentationDomains } from '../compiler/course-presentation-overlap.js';
import { transformPlanarPoint, transformPlanarVector } from '../core/planar-transform.js';
import { guideCoordinateToWorld } from '../core/guide-coordinate-frame.js';
import { wrapAngle, type Vec2 } from '../core/math.js';
import { compileWorldCrossingGate, observeWorldCrossingGate } from '../gameplay/world-crossing-gate.js';
import type { RecoveryState } from '../gameplay/recovery.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { createCourseDrivingSource } from './course-driving-view.js';
import { createCourseGeometryView } from './course-geometry-view.js';
import { createCourseGeometryTraversal, type CourseOccurrenceHistory } from './course-occurrence.js';

interface DrivingActor {
  readonly vehicle: ArcadeVehicleState;
  readonly recovery: RecoveryState;
  readonly cameraRig: CameraRig;
}

function required<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new RangeError(`Course driving admission failed: ${JSON.stringify(result)}`);
  return result.value;
}

/** One actor's finite occurrence history; source geometry and images stay shared. */
export function createCourseDrivingSession(entry: CompiledSection) {
  const sections = new Set<CompiledSection>();
  const visit = (section: CompiledSection) => {
    if (sections.has(section)) return;
    sections.add(section);
    section.outgoing.forEach((link) => visit(link.destination.section));
  };
  visit(entry);
  const links = [...sections].flatMap((section) => section.outgoing);
  // Guard consumers cover contact plus one fixed step. Render, driver and recovery read spans.
  const pose = { behind: 2, ahead: 2, left: 32, right: 32 };
  const step = { behind: 4, ahead: 4, left: 2, right: 2 };
  const contact = { behind: 5, ahead: 5, left: 2, right: 2 };
  const zero = { behind: 0, ahead: 0, left: 0, right: 0 };
  const source = createCourseDrivingSource(
    required(
      compileCoursePhysicalDomains(links, {
        pose,
        step,
        consumers: { contact, driverLookahead: zero, reverseRecovery: zero },
      }),
    ),
    required(
      compileCoursePresentationDomains(links, {
        pose,
        step,
        consumers: { cameraRender: contact, groundFilter: zero, scenery: zero },
      }),
    ),
  );
  const traversal = createCourseGeometryTraversal(entry, { retainBehind: 500, selectAhead: 500, maxOccurrences: 8 });
  const select = () => {
    for (;;) {
      const history = traversal.snapshot();
      const frontier = history.selected.at(-1) ?? history.occurrences.at(-1)!;
      if (frontier.section.outgoing.length !== 1) return;
      const result = traversal.select(frontier, frontier.section.outgoing[0]!);
      if (!result.ok) {
        if (result.reason === 'selection_limit') return;
        throw new RangeError(`Course successor selection failed: ${result.reason}`);
      }
    }
  };
  const makeView = (history: CourseOccurrenceHistory) => {
    const section = history.active.section;
    const minS = history.active.incoming?.destination.anchor.s ?? 0;
    const maxS = Math.min(section.raster.length, ...section.outgoing.map((link) => link.source.anchor.s));
    const extent = { behind: 0, ahead: 0 };
    const consumers = { cameraRender: extent, contact: extent, driverLookahead: extent, reverseRecovery: extent };
    const pose = { minS, maxS, maxAdvance: 0 };
    const bounds = required(createCourseGeometryView(history, { pose, consumers })).availableRange;
    const span = { behind: minS - bounds.start, ahead: bounds.end - maxS };
    return required(
      source.createView(
        required(
          createCourseGeometryView(history, {
            pose,
            consumers: { cameraRender: span, contact: span, driverLookahead: span, reverseRecovery: span },
          }),
        ),
      ),
    );
  };
  select();
  let view = makeView(traversal.snapshot());
  const reframe = (actor: DrivingActor, direction: 'forward' | 'reverse') => {
    const movement = required(traversal.prepare(direction));
    const link = direction === 'forward' ? movement.to.incoming! : movement.from.incoming!;
    const from = direction === 'forward' ? link.source : link.destination;
    const to = direction === 'forward' ? link.destination : link.source;
    const next = makeView(movement.history);
    const transform = movement.destinationFromSource;
    const yaw = Math.atan2(transform.sine, transform.cosine);
    const rebase = (s: number) => to.anchor.s + (s - from.anchor.s);
    const { vehicle, recovery, cameraRig } = actor;
    const position = transformPlanarPoint(transform, vehicle);
    const velocity = transformPlanarVector(transform, { x: vehicle.velocityX, z: vehicle.velocityZ });
    const coordinate = guideCoordinateToWorld(
      next.world.guide,
      rebase(vehicle.course.s),
      vehicle.course.l + coursePortLateral(to) - coursePortLateral(from),
    );
    const nextSafeS = rebase(recovery.lastSafeS);
    // Fallible reader construction precedes this synchronous publication. No force or progress correction.
    required(movement.commit());
    vehicle.x = position.x;
    vehicle.z = position.z;
    vehicle.velocityX = velocity.x;
    vehicle.velocityZ = velocity.z;
    vehicle.yaw = wrapAngle(vehicle.yaw + yaw);
    vehicle.course = {
      s: coordinate.s,
      l: coordinate.l,
      segmentIndex: coordinate.segmentIndex,
      distanceSquared: vehicle.course.distanceSquared,
    };
    recovery.lastSafeS = nextSafeS;
    cameraRig.yaw = wrapAngle(cameraRig.yaw + yaw);
    cameraRig.movementYaw = wrapAngle(cameraRig.movementYaw + yaw);
    view = next;
    return direction;
  };
  return Object.freeze({
    get view() {
      return view;
    },
    get history() {
      return traversal.snapshot();
    },
    /** Recovery/replacement changes observations without inventing a gate crossing. */
    observeStep(actor: DrivingActor, previous: Vec2, recovered: boolean) {
      const history = traversal.snapshot();
      const index = history.occurrences.indexOf(history.active);
      const successor = history.occurrences[index + 1] ?? history.selected[0];
      const candidates = [
        ...(successor ? [{ direction: 'forward' as const, successor, port: successor.incoming!.source }] : []),
        ...(index > 0
          ? [{ direction: 'reverse' as const, successor: history.active, port: history.active.incoming!.destination }]
          : []),
      ];
      for (const candidate of candidates) {
        const { port, direction } = candidate;
        const gate = compileWorldCrossingGate({
          id: candidate.successor.incoming!.id,
          center: port.pose,
          heading: port.pose.heading,
          halfWidth: Math.max(pose.left, pose.right),
        });
        const crossing = recovered ? null : observeWorldCrossingGate(gate, previous, actor.vehicle);
        const crossed = crossing?.direction === (direction === 'forward' ? 'FORWARD' : 'REVERSE');
        const recoveredAcross =
          recovered &&
          (direction === 'forward' ? actor.vehicle.course.s >= port.anchor.s : actor.vehicle.course.s < port.anchor.s);
        if (!crossed && !recoveredAcross) continue;
        if (crossed) {
          const geometry = required(
            createCourseGeometryView(history, {
              pose: { minS: port.anchor.s, maxS: port.anchor.s, maxAdvance: 0 },
              consumers: {
                cameraRender: { behind: 6, ahead: 6 },
                contact: { behind: 6, ahead: 6 },
                driverLookahead: { behind: 6, ahead: 6 },
                reverseRecovery: { behind: 6, ahead: 6 },
              },
            }),
          );
          const admission = required(source.createSeamView(geometry, candidate.successor)).admitMotion(
            previous,
            actor.vehicle,
          );
          if (!admission.ok)
            throw new RangeError(`Course crossing exceeds fixed-step contact guard: ${JSON.stringify(admission)}`);
        }
        return reframe(actor, direction);
      }
      return null;
    },
  });
}
