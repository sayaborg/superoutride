import type { CompiledLink, CompiledSection } from '../course/compiler/course-graph.js';
import { createCourseRoute, routeSectionS, type RouteOccurrence } from '../course/course-route.js';
import { createCourseRouteReaders } from '../course/course-route-readers.js';
import type { CompiledCarriageway } from '../course/course-regions.js';
import { PLAN_PROJECTION_WINDOW_METERS } from '../course/geometry/plan-coordinate.js';
import type { ArcadeVehicleState } from '../vehicle/physics/arcade-vehicle-physics.js';
import { ENVELOPE_DRIVER } from './envelope-driver.js';
import { RECOVERY_SETTINGS, recoverVehicleToPlanCoordinate, type RecoveryState } from './recovery.js';
import { COURSE_DRIVING_POLICY } from './course-driving-policy.js';

/** One route for every actor; an actor retains only its current occurrence for legacy progress gates. */
export function createSharedRouteDrivingGraph(
  entry: CompiledSection,
  camera: { readonly distance: number; readonly far: number; readonly near: number },
) {
  const forwardMeters =
    Math.max(camera.distance + camera.far, ENVELOPE_DRIVER.lookahead, PLAN_PROJECTION_WINDOW_METERS) +
    COURSE_DRIVING_POLICY.guard.step.ahead;
  const rearMeters =
    Math.max(
      camera.distance + camera.near,
      RECOVERY_SETTINGS.backtrackDistance + PLAN_PROJECTION_WINDOW_METERS + COURSE_DRIVING_POLICY.guard.contact.behind,
    ) + COURSE_DRIVING_POLICY.guard.step.behind;
  const route = createCourseRoute(entry);
  const readers = createCourseRouteReaders(route);
  const view = Object.freeze({
    world: readers.world,
    renderHeight: readers.displayHeight,
    geometry: readers.geometry,
    range: readers.world.coordinates.domain,
  });
  const metrics = { seamCommits: 0, seamCommitMaxMilliseconds: 0 };
  let closedCarriageways: readonly CompiledCarriageway[] = Object.freeze([]);
  const updateClosed = () => {
    closedCarriageways = Object.freeze(
      route.occurrences.flatMap((occurrence) => {
        const link = occurrence.incoming;
        return link?.from.section.fork
          ? link.from.section.outgoing.filter((other) => other !== link).map((other) => other.from.carriageway)
          : [];
      }),
    );
  };
  const record = (started: number, before: typeof route.occurrences) => {
    if (route.occurrences !== before) {
      updateClosed();
      metrics.seamCommits += 1;
      metrics.seamCommitMaxMilliseconds = Math.max(metrics.seamCommitMaxMilliseconds, performance.now() - started);
    }
  };
  const refresh = (minS: number, maxS: number) => {
    const started = performance.now(),
      before = route.occurrences;
    route.extendThrough(maxS + forwardMeters);
    route.discardBefore(minS - rearMeters);
    record(started, before);
  };
  refresh(0, 0);
  const createSession = () => {
    let occurrence: RouteOccurrence = route.occurrences[0]!;
    return Object.freeze({
      get occurrence() {
        return occurrence;
      },
      get closedCarriageways() {
        return closedCarriageways;
      },
      view,
      route,
      refresh,
      prepareChoice(link: CompiledLink) {
        const frontier = route.occurrences.at(-1)!;
        if (frontier.section !== link.from.section)
          throw new RangeError('Fork selection requires the current route frontier');
        return Object.freeze({
          commit() {
            if (route.occurrences.some((item) => item.incoming === link && item.start > frontier.start)) return;
            const started = performance.now(),
              before = route.occurrences;
            route.append(link);
            route.extendThrough(route.end + forwardMeters);
            record(started, before);
          },
        });
      },
      observeStep(actor: { vehicle: ArcadeVehicleState; recovery: RecoveryState }) {
        const next = route.at(actor.vehicle.course.s);
        if (!next) {
          const s = Math.min(
            route.end - RECOVERY_SETTINGS.backtrackDistance,
            Math.max(route.start + RECOVERY_SETTINGS.backtrackDistance, actor.recovery.lastSafeS),
          );
          recoverVehicleToPlanCoordinate(view.world, actor.vehicle, {
            state: actor.recovery,
            reason: 'wrong-course',
            target: { s, l: actor.vehicle.course.l },
          });
          return 'recovered' as const;
        }
        if (occurrence === next) return null;
        occurrence = next;
        return 'changed' as const;
      },
      /** Current Section station for temporary progress/fork readers; removed in 6-9b. */
      nativeS(s: number) {
        return routeSectionS(occurrence, s);
      },
    });
  };
  return Object.freeze({
    metrics,
    route,
    readers,
    view,
    refresh,
    createSession,
    forwardMeters,
    rearMeters,
  });
}
