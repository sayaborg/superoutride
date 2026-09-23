import type { CourseGround } from '../course/compiler/course-ground.js';
import type { CompiledLink, CompiledSection } from '../course/compiler/course-graph.js';
import type { CompiledCarriageway } from '../course/course-regions.js';
import { coursePortLateral } from '../course/compiler/course-links.js';
import { compileCoursePhysicalDomains } from '../course/compiler/course-physical-overlap.js';
import { compileCoursePresentationDomains } from '../course/compiler/course-presentation-overlap.js';
import { compilePlanarTransform, composePlanarTransforms, invertPlanarTransform } from '../core/planar-transform.js';
import { clamp, type Vec2 } from '../core/math.js';
import { CURRENT_RENDER_FAR_DEPTH_METERS } from '../view/camera.js';
import { ENVELOPE_DRIVER } from './envelope-driver.js';
import { compileWorldCrossingGate, observeWorldCrossingPlane } from './world-crossing-gate.js';
import { RECOVERY_PROFILE, recoverVehicleToGuideCoordinate, type RecoveryState } from './recovery.js';
import type { ArcadeVehicleState } from '../vehicle/physics/arcade-vehicle-physics.js';
import { reframeVehicle } from '../vehicle/physics/vehicle-reframe.js';
import { createCourseDrivingSource } from '../view/course-driving-view.js';
import { COURSE_DRIVING_POLICY } from './course-driving-policy.js';
import { createCourseGeometryView } from '../course/course-geometry-view.js';
import { createCourseGeometryTraversal, type CourseOccurrenceHistory } from '../course/course-occurrence.js';

interface DrivingActor {
  readonly vehicle: ArcadeVehicleState;
  readonly recovery: RecoveryState;
}
function required<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new RangeError(`Course driving admission failed: ${JSON.stringify(result)}`);
  return result.value;
}
function sameLayout(a: CourseOccurrenceHistory, b: CourseOccurrenceHistory) {
  const same = (x: CourseOccurrenceHistory['active'], y: CourseOccurrenceHistory['active']) =>
    x.section === y.section && x.incoming === y.incoming && x.ordinal === y.ordinal;
  return (
    same(a.active, b.active) &&
    a.occurrences.length === b.occurrences.length &&
    a.selected.length === b.selected.length &&
    a.occurrences.every((o, i) => same(o, b.occurrences[i]!)) &&
    a.selected.every((o, i) => same(o, b.selected[i]!))
  );
}

/** Static readers are shared across the field; actors own only traversal and observation state. */
export function createCourseDrivingGraph(entry: CompiledSection, ground: CourseGround) {
  const sections = new Set<CompiledSection>();
  const visit = (section: CompiledSection) => {
    if (sections.has(section)) return;
    sections.add(section);
    section.outgoing.forEach((link) => visit(link.destination.section));
  };
  visit(entry);
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
  const source = createCourseDrivingSource(
    ground,
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
  type View = Extract<ReturnType<typeof source.createView>, { ok: true }>['value'];
  const cache: { history: CourseOccurrenceHistory; view: View }[] = [];
  const makeView = (history: CourseOccurrenceHistory) => {
    const cached = cache.find((c) => sameLayout(c.history, history));
    if (cached) return { ok: true as const, value: Object.freeze({ ...cached.view, frame: history.active }) };
    const geometry = createCourseGeometryView(history, 'retained');
    if (!geometry.ok) return geometry;
    const result = source.createView(geometry.value);
    if (result.ok) {
      cache.push({ history, view: result.value });
      if (cache.length > COURSE_DRIVING_POLICY.readerCacheSize) cache.shift();
    }
    return result;
  };
  const metrics = { seamCommits: 0, seamCommitMaxMilliseconds: 0 };
  return Object.freeze({ metrics, createSession: () => createSession(entry, source, makeView, metrics) });
}

function createSession(
  entry: CompiledSection,
  source: ReturnType<typeof createCourseDrivingSource>,
  makeView: (
    history: CourseOccurrenceHistory,
  ) =>
    | ReturnType<ReturnType<typeof createCourseDrivingSource>['createView']>
    | Extract<ReturnType<typeof createCourseGeometryView>, { ok: false }>,
  metrics: { seamCommits: number; seamCommitMaxMilliseconds: number },
) {
  let referenceSOffset = 0;
  let referenceFromFrame = compilePlanarTransform({ x: 0, z: 0, heading: 0 }, { x: 0, z: 0, heading: 0 });
  const traversal = createCourseGeometryTraversal(entry, COURSE_DRIVING_POLICY.traversal);
  for (;;) {
    const history = traversal.snapshot();
    const frontier = history.selected.at(-1) ?? history.occurrences.at(-1)!;
    if (frontier.section.outgoing.length !== 1) break;
    const result = traversal.select(frontier, frontier.section.outgoing[0]!);
    if (!result.ok) {
      if (result.reason === 'selection_limit') break;
      required(result);
    }
  }
  let view = required(makeView(traversal.snapshot()));
  let closedCarriageways: readonly CompiledCarriageway[] = [];
  const prepareGates = () => {
    const history = traversal.snapshot();
    const index = history.occurrences.indexOf(history.active);
    const successor = history.occurrences[index + 1] ?? history.selected[0];
    closedCarriageways = Object.freeze(
      [...history.occurrences, ...history.selected].flatMap((o) => {
        const link = o.incoming;
        return link?.source.section.fork
          ? link.source.section.outgoing.filter((other) => other !== link).map((other) => other.source.carriageway)
          : [];
      }),
    );
    return [
      ...(successor ? [{ direction: 'forward' as const, successor, port: successor.incoming!.source }] : []),
      ...(index > 0
        ? [{ direction: 'reverse' as const, successor: history.active, port: history.active.incoming!.destination }]
        : []),
    ].map((candidate) => ({
      ...candidate,
      // A seam observes the full plane, including excursions outside the admitted contact domain.
      gate: compileWorldCrossingGate({
        id: candidate.successor.incoming!.id,
        center: candidate.port.pose,
        heading: candidate.port.pose.heading,
        halfWidth: Math.max(COURSE_DRIVING_POLICY.guard.pose.left, COURSE_DRIVING_POLICY.guard.pose.right),
      }),
      guard: required(source.createMotionGuard(history.active, candidate.successor)),
    }));
  };
  let gates = prepareGates();
  const recover = (actor: DrivingActor, candidate: (typeof gates)[number]) => {
    const s = clamp(
      candidate.port.anchor.s + (candidate.direction === 'forward' ? -1 : 1) * RECOVERY_PROFILE.backtrackDistance,
      view.range.start,
      view.range.end,
    );
    recoverVehicleToGuideCoordinate(view.world, actor.vehicle, {
      state: actor.recovery,
      reason: 'wrong-course',
      target: { s, l: coursePortLateral(candidate.port) },
    });
    return 'recovered' as const;
  };
  const reframe = (actor: DrivingActor, candidate: (typeof gates)[number]) => {
    const started = performance.now();
    const { direction } = candidate;
    const prepared = traversal.prepare(direction, { selectUnique: true });
    if (!prepared.ok) return recover(actor, candidate);
    const movement = prepared.value;
    const admitted = makeView(movement.history);
    if (!admitted.ok) return recover(actor, candidate);
    const next = admitted.value;
    const link = direction === 'forward' ? movement.to.incoming! : movement.from.incoming!;
    const from = direction === 'forward' ? link.source : link.destination;
    const to = direction === 'forward' ? link.destination : link.source;
    const transform = movement.destinationFromSource;
    const rebase = (s: number) => to.anchor.s + (s - from.anchor.s);
    const { vehicle, recovery } = actor;
    const nextS = rebase(vehicle.course.s);
    if (nextS < next.range.start || nextS > next.range.end) return recover(actor, candidate);
    if (!movement.commit().ok) return recover(actor, candidate);
    reframeVehicle(
      vehicle,
      next.world.guide,
      transform,
      nextS,
      vehicle.course.l + coursePortLateral(to) - coursePortLateral(from),
    );
    recovery.lastSafeS = rebase(recovery.lastSafeS);
    referenceSOffset += from.anchor.s - to.anchor.s;
    referenceFromFrame = composePlanarTransforms(referenceFromFrame, invertPlanarTransform(transform));
    view = next;
    gates = prepareGates();
    metrics.seamCommits += 1;
    metrics.seamCommitMaxMilliseconds = Math.max(metrics.seamCommitMaxMilliseconds, performance.now() - started);
    return Object.freeze({ direction, destinationFromSource: transform });
  };
  return Object.freeze({
    prepareChoice(link: CompiledLink) {
      const history = traversal.snapshot();
      const from =
        history.occurrences.find((o) => o.ordinal >= history.active.ordinal && o.section === link.source.section) ??
        history.selected.find((o) => o.section === link.source.section);
      if (!from) throw new RangeError('Route choice needs its retained forward occurrence');
      const choice = required(traversal.prepareSelection(from, link));
      const next = required(makeView(choice.history));
      return Object.freeze({
        commit() {
          required(choice.commit());
          view = next;
          gates = prepareGates();
        },
      });
    },
    get closedCarriageways() {
      return closedCarriageways;
    },
    get referenceSOffset() {
      return referenceSOffset;
    },
    get referenceFromFrame() {
      return referenceFromFrame;
    },
    get view() {
      return view;
    },
    get history() {
      return traversal.snapshot();
    },
    /** Recovery is an observation reset, never a physical crossing or progress award. */
    observeStep(actor: DrivingActor, previous: Vec2, recovered: boolean) {
      for (const candidate of gates) {
        const crossing = recovered ? null : observeWorldCrossingPlane(candidate.gate, previous, actor.vehicle);
        const crossed = crossing?.direction === (candidate.direction === 'forward' ? 'FORWARD' : 'REVERSE');
        const recoveredAcross =
          recovered &&
          (candidate.direction === 'forward'
            ? actor.vehicle.course.s >= candidate.port.anchor.s
            : actor.vehicle.course.s < candidate.port.anchor.s);
        if (!crossed && !recoveredAcross) continue;
        if (crossed && !candidate.guard.admitMotion(previous, actor.vehicle).ok) return recover(actor, candidate);
        return reframe(actor, candidate);
      }
      return null;
    },
  });
}
