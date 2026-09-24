import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CompiledCourseLandmark } from '../course/compiler/course-rules.js';
import {
  createCircuitRaceProgressState,
  updateCircuitRaceProgress,
  resyncCircuitRaceProgress,
} from './circuit-race-progress.js';
import {
  compileOrderedRaceCourseRules,
  createOrderedRaceProgressState,
  updateOrderedRaceProgress,
  createOrderedRaceProgressWorkspace,
  resyncOrderedRaceProgress,
} from './ordered-race-progress.js';
import type { ArcadeVehicleState } from '../vehicle/physics/arcade-vehicle-physics.js';
import { routeSectionS, type RouteOccurrence } from '../course/course-route.js';
import type { createSharedRouteDrivingGraph } from './shared-route-driving-session.js';
type Session = ReturnType<ReturnType<typeof createSharedRouteDrivingGraph>['createSession']>;

export type CourseRaceAdmission = (event: {
  readonly landmark: CompiledCourseLandmark | null;
  readonly lap: number;
  readonly u: number;
  readonly finish: boolean;
}) => boolean;

export interface CourseRaceEvent {
  readonly landmark: CompiledCourseLandmark;
  readonly lap: number;
  readonly u: number;
  readonly finish: boolean;
}

/** Gate geometry is prepared once from authored rules; frame transitions never award clock credit. */
export function createCourseRaceProgress(course: CompiledCourse, lapCount: number) {
  if (!course.rules) throw new RangeError('Driving Session requires authored course rules');
  const nativeSample = { x: 0, z: 0, s: 0 };
  const sample = (
    point: { readonly x: number; readonly z: number } & (
      { readonly s: number } | { readonly course: { readonly s: number } }
    ),
    occurrence: RouteOccurrence,
  ) => {
    const t = occurrence.sectionFromWorld;
    const s = 's' in point ? point.s : point.course.s;
    nativeSample.x = t.cosine * point.x + t.sine * point.z + t.translation.x;
    nativeSample.z = -t.sine * point.x + t.cosine * point.z + t.translation.z;
    nativeSample.s = Math.max(
      occurrence.nativeStart,
      Math.min(occurrence.section.raster.length, routeSectionS(occurrence, s)),
    );
    return nativeSample;
  };
  const position = (vehicle: ArcadeVehicleState) => ({ x: vehicle.x, z: vehicle.z, s: vehicle.course.s });
  const rules = new Map(
    course.rules.intervals.map(({ section, checkpoints, finish }) => {
      const authored = [...checkpoints, ...(finish ? [finish] : [])];
      const end = Math.min(...section.outgoing.map((l) => l.from.anchor.s));
      const lap = compileOrderedRaceCourseRules(section.coordinates, [
        ...authored.map((g) => ({
          kind: g === finish ? ('finish' as const) : ('checkpoint' as const),
          name: g.id,
          s: g.anchor.s,
          bounds: g,
        })),
        ...(finish ? [] : [{ kind: 'finish' as const, name: section.id + ':EXIT', s: end }]),
      ]);
      const landmarks = new Map(lap.gates.slice(0, authored.length).map((gate, i) => [gate, authored[i]!]));
      return [section, { lap, landmarks }] as const;
    }),
  );
  const noEvents: readonly CourseRaceEvent[] = Object.freeze([]);
  const events = (
    update: ReturnType<typeof updateOrderedRaceProgress>,
    section: CompiledSection,
    lap: number,
    terminal: boolean,
  ): readonly CourseRaceEvent[] =>
    update.acceptedCrossings.length === 0
      ? noEvents
      : update.acceptedCrossings.flatMap(({ gate, u }) => {
          const landmark = rules.get(section)!.landmarks.get(gate);
          return landmark ? [{ landmark, lap, u, finish: terminal && gate.kind === 'finish' }] : [];
        });
  if (course.type === 'CIRCUIT') {
    const section = course.entry,
      loop = section.outgoing[0]!;
    const circuit = {
      id: course.id,
      lapCount,
      entryS: 0,
      lapLength: loop.from.anchor.s - 0,
      lap: rules.get(section)!.lap,
    };
    return (session: Session, vehicle: () => ArcadeVehicleState) => {
      const workspace = createOrderedRaceProgressWorkspace();
      const result = { ...workspace.update, events: [] as readonly CourseRaceEvent[] };
      const state = createCircuitRaceProgressState(circuit, sample(vehicle(), session.occurrence));
      return {
        state,
        update(current = position(vehicle()), observedOccurrence = session.occurrence, accept?: CourseRaceAdmission) {
          if (observedOccurrence.section !== section) return null;
          const lap = state.acceptedFinishCount + 1;
          const update = updateCircuitRaceProgress(
            state,
            circuit,
            sample(current, observedOccurrence),
            (crossing) =>
              !accept ||
              accept({
                landmark: rules.get(section)!.landmarks.get(crossing.gate) ?? null,
                lap,
                u: crossing.u,
                finish: crossing.gate.kind === 'finish' && lap === lapCount,
              }),
            workspace,
          );
          Object.assign(result, update);
          result.events = events(update, section, lap, lap === lapCount);
          return result;
        },
        resync: () => resyncCircuitRaceProgress(state, circuit, sample(vehicle(), session.occurrence)),
      };
    };
  }
  return (session: Session, vehicle: () => ArcadeVehicleState) => {
    const workspace = createOrderedRaceProgressWorkspace();
    const result = { ...workspace.update, events: [] as readonly CourseRaceEvent[] };
    let expected = course.entry,
      base = 0;
    let local = createOrderedRaceProgressState(rules.get(expected)!.lap, sample(vehicle(), session.occurrence));
    const state = {
      status: 'RUNNING' as 'RUNNING' | 'FINISHED',
      acceptedFinishCount: 0,
      validatedProgressFloor: 0,
      sProgress: 0,
    };
    const publish = () => {
      state.validatedProgressFloor = base + Math.max(0, local.validatedProgressFloor - 0);
      state.sProgress = base + Math.max(0, local.sProgress - 0);
      if (local.status === 'FINISHED' && expected.outgoing.length === 0) {
        state.status = 'FINISHED';
        state.acceptedFinishCount = 1;
      }
    };
    publish();
    return {
      state,
      update(current = position(vehicle()), observedOccurrence = session.occurrence, accept?: CourseRaceAdmission) {
        const section = observedOccurrence.section;
        if (section !== expected || state.status === 'FINISHED') return null;
        const update = updateOrderedRaceProgress(
          local,
          rules.get(expected)!.lap,
          sample(current, observedOccurrence),
          (crossing) =>
            !accept ||
            accept({
              landmark: rules.get(section)!.landmarks.get(crossing.gate) ?? null,
              lap: 1,
              u: crossing.u,
              finish: crossing.gate.kind === 'finish' && expected.outgoing.length === 0,
            }),
          workspace,
        );
        publish();
        Object.assign(result, update);
        result.status = state.status;
        result.justFinished = update.justFinished && expected.outgoing.length === 0;
        result.events = events(update, section, 1, expected.outgoing.length === 0);
        return result;
      },
      resync() {
        if (state.status === 'FINISHED') return;
        const active = session.occurrence;
        if (active.section !== expected && local.status === 'FINISHED' && active.incoming?.from.section === expected) {
          base += local.validatedProgressFloor - 0;
          expected = active.section;
          const s = 0,
            p = expected.coordinates.toWorld(s, 0, createPlanCoordinateSample());
          local = createOrderedRaceProgressState(rules.get(expected)!.lap, { ...p, s });
          local.sProgress = s;
        }
        if (active.section === expected)
          resyncOrderedRaceProgress(local, rules.get(expected)!.lap, sample(vehicle(), active));
      },
    };
  };
}
