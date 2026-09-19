import type { CompiledCourse } from '../compiler/compiled-course.js';
import type { CompiledSection } from '../compiler/course-graph.js';
import { guidePathToWorld } from '../core/guide-curve.js';
import {
  compileCircuitRaceRules,
  createCircuitRaceProgressState,
  updateCircuitRaceProgress,
  resyncCircuitRaceProgress,
} from '../gameplay/circuit-race-progress.js';
import {
  compileOrderedRaceCourseRules,
  createOrderedRaceProgressState,
  updateOrderedRaceProgress,
  resyncOrderedRaceProgress,
} from '../gameplay/ordered-race-progress.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import type { createCourseDrivingGraph } from './course-driving-session.js';
type Session = ReturnType<ReturnType<typeof createCourseDrivingGraph>['createSession']>;

/** Upper-level race composition; canonical source gates are shared by every competitor. */
export function createCourseRaceProgress(course: CompiledCourse, lapCount: number) {
  const entryS = (section: CompiledSection) => section.ports.find((p) => p.kind === 'entry')!.anchor.s;
  const sample = (vehicle: ArcadeVehicleState) => ({ x: vehicle.x, z: vehicle.z, s: vehicle.course.s });
  if (course.type === 'CIRCUIT') {
    const section = course.entry,
      loop = section.outgoing[0]!;
    const start = loop.destination.anchor.s,
      finish = loop.source.anchor.s;
    const rules = compileCircuitRaceRules(section.guide, {
      id: course.id,
      lapCount,
      entryS: start,
      finishS: finish,
      checkpointChainages: [0.25, 0.5, 0.75].map((f) => start + (finish - start) * f),
    });
    return (_session: Session, vehicle: () => ArcadeVehicleState) => {
      const state = createCircuitRaceProgressState(rules, sample(vehicle()));
      return {
        state,
        update: () => updateCircuitRaceProgress(state, rules, sample(vehicle())),
        resync: () => resyncCircuitRaceProgress(state, rules, sample(vehicle())),
      };
    };
  }
  const rules = new Map(
    course.sections.map((section) => {
      const finish = section.outgoing.length
        ? Math.min(...section.outgoing.map((l) => l.source.anchor.s))
        : section.raster.length - 60;
      return [
        section,
        compileOrderedRaceCourseRules(section.guide, [
          { kind: 'checkpoint', name: `${section.id}:CP`, s: (entryS(section) + finish) / 2 },
          { kind: 'finish', name: `${section.id}:END`, s: finish },
        ]),
      ] as const;
    }),
  );
  return (session: Session, vehicle: () => ArcadeVehicleState) => {
    let expected = course.entry,
      base = 0;
    let local = createOrderedRaceProgressState(rules.get(expected)!, sample(vehicle()));
    const state = {
      status: 'RUNNING' as 'RUNNING' | 'FINISHED',
      acceptedFinishCount: 0,
      validatedProgressFloor: 0,
      sProgress: 0,
    };
    const publish = () => {
      state.validatedProgressFloor = base + Math.max(0, local.validatedProgressFloor - entryS(expected));
      state.sProgress = base + Math.max(0, local.sProgress - entryS(expected));
      if (local.status === 'FINISHED' && expected.outgoing.length === 0) {
        state.status = 'FINISHED';
        state.acceptedFinishCount = 1;
      }
    };
    publish();
    return {
      state,
      update() {
        if (session.history.active.section !== expected || state.status === 'FINISHED') return null;
        const update = updateOrderedRaceProgress(local, rules.get(expected)!, sample(vehicle()));
        publish();
        return { ...update, status: state.status, justFinished: update.justFinished && expected.outgoing.length === 0 };
      },
      resync() {
        if (state.status === 'FINISHED') return;
        const active = session.history.active;
        if (
          active.section !== expected &&
          local.status === 'FINISHED' &&
          active.incoming?.source.section === expected
        ) {
          base += local.validatedProgressFloor - entryS(expected);
          expected = active.section;
          const s = entryS(expected),
            p = guidePathToWorld(expected.guide, s, 0);
          local = createOrderedRaceProgressState(rules.get(expected)!, { ...p, s });
          local.sProgress = s;
        }
        if (active.section === expected) resyncOrderedRaceProgress(local, rules.get(expected)!, sample(vehicle()));
      },
    };
  };
}
