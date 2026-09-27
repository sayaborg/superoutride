import type { ResolvedCourseSession } from './course-session.js';
import { createCheckpointClock, raceEventSeconds } from './checkpoint-clock.js';
import { createRouteProgress, type RouteRaceEvent } from './route-progress.js';
import { createRouteCrossSections } from './route-cross-sections.js';
import { createCourseForkField, type DriverIntent } from './course-fork-field.js';
import { rivalExit } from './rival-exit.js';
import {
  createRecoveryState,
  advanceVehicleWithRecovery,
  recoverVehicle,
  recoverVehicleToPlanCoordinate,
  type RecoveryState,
} from './recovery.js';
import { compileEnvelopeDriver, createEnvelopeDriverWorkspace, sampleEnvelopeDrivingInput } from './envelope-driver.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import { createVehicle, updateHeldVehicle, type VehicleState } from '../vehicle/physics/vehicle-physics.js';
import { createStartPhase } from './start-phase.js';
import { createVehicleModel, type VehicleModel } from '../vehicle/physics/vehicle-model.js';
import { createRivalRoster } from './rival-roster.js';
import {
  createCompetitorObservation,
  writeCompetitorObservation,
  type CompetitorObservation,
} from './competitor-observation.js';
import { SIM_DT } from './fixed-step.js';
import type { createRouteRuntime } from './route-runtime.js';

type RouteRuntime = ReturnType<typeof createRouteRuntime>;

/** One accepted crossing: its competitor, line and race time (step start + u × SIM_DT). */
export interface RaceEvent {
  readonly competitorId: string;
  readonly landmark: RouteRaceEvent['landmark'];
  readonly lap: number;
  readonly finish: boolean;
  readonly timeSeconds: number;
}
interface Actor {
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
  readonly recovery: RecoveryState;
}

/**
 * Field composition over shared course readers, ordinary mechanics and ordered physical gates. The race
 * builds every competitor's mechanics, the player's included, from the Session vehicle; callers supply
 * the player's input only.
 */
export function createCourseRace(options: { readonly session: ResolvedCourseSession; readonly runtime: RouteRuntime }) {
  const { course, configuration, grid, budgets } = options.session;
  const { initialSpeed } = configuration;
  const { runtime } = options;
  const { vehicle: sessionVehicle, envelope } = options.session;
  // Rival driving exists only with an envelope; Session resolution admits no rivals without one.
  const driver = envelope
    ? compileEnvelopeDriver(envelope, options.session.rivalUtilization, envelope.maximumSpeed)
    : null;
  const clock = createCheckpointClock(budgets);
  const startPhase = createStartPhase();
  const lines = createRouteCrossSections(runtime.route, course, configuration.lapCount);
  // The fork field is the fork decider: the only holder of the Route's selection authority.
  const forks = createCourseForkField(runtime.route, lines, runtime.selectSuccessor);
  // A rival's intent drives it; the player's input comes from its composition, so it has no intent here.
  const competitor = (id: string, actor: Actor, lane: number, intent: DriverIntent | null) => ({
    id,
    actor,
    lane,
    intent,
    /** The race's recovery lane resolver for this competitor. */
    recoveryLane: (s: number) => forks.recoveryL(s, lane),
    observer: createRouteProgress(lines, actor.vehicle.course),
    get progress() {
      return this.observer.state;
    },
    /** Race time of this competitor's finish event; null until it finishes. */
    finishSeconds: null as number | null,
  });
  // Every competitor drives one model of the Session vehicle, spawned at its grid slot with the Session's start speed.
  const model = createVehicleModel(sessionVehicle, SIM_DT);
  const spawn = (slot: (typeof grid)[number]): Actor => {
    const vehicle = createVehicle(model, runtime.readers, { s: slot.at.s, l: slot.l, initialSpeed });
    return { vehicle, model, recovery: createRecoveryState(vehicle) };
  };
  const playerActor = spawn(grid[0]!);
  const player = competitor('PLAYER', playerActor, grid[0]!.l, null);
  const rivals = createRivalRoster(configuration).map(({ actorId, rivalIndex }) => {
    const slot = grid[rivalIndex + 1]!;
    // The race assigns each rival's target exits from the Session seed; its grid side implies none.
    const intent: DriverIntent = {
      lane: slot.l,
      exit: (occurrence) =>
        rivalExit(configuration.seed, rivalIndex, occurrence.ordinal, occurrence.section.fork!.exits.length),
    };
    return competitor(actorId, spawn(slot), slot.l, intent);
  });
  if (!driver && rivals.length > 0) throw new Error('rivals require an envelope driver');
  const resync = (c: typeof player) => c.observer.resync(c.actor.vehicle.course);
  const competitors = [player, ...rivals];
  const motions = competitors.map((c) => ({
    c,
    id: c.id,
    previous: { s: 0, l: 0 },
    current: c.actor.vehicle,
    recovered: false,
    driverWorkspace: createEnvelopeDriverWorkspace(),
    step: {
      state: c.actor.recovery,
      input: { steering: 0, throttle: false, brake: false } as DrivingInput,
      lane: c.recoveryLane,
    },
    input: (s: number) => forks.targetL(s, c.intent!),
  }));
  const idle: DrivingInput = Object.freeze({ steering: 0, throttle: false, brake: false });
  // READY holds every vehicle with zero clutch capacity; race time and rival driving start at GO,
  // where ordinary updates restore the fixed capacity.
  const holdReady = (input: DrivingInput) => {
    for (const motion of motions) {
      motion.step.input = motion === motions[0] ? input : idle;
      updateHeldVehicle(motion.c.actor.vehicle, motion.c.actor.model, motion.step.input);
    }
    if (startPhase.advance()) clock.start();
  };
  const move = (motion: (typeof motions)[number], input: DrivingInput) => {
    const { c, previous } = motion;
    const { actor } = c;
    previous.l = actor.vehicle.course.l;
    previous.s = actor.vehicle.course.s;
    motion.current = actor.vehicle;
    motion.step.input = input;
    const recovered = advanceVehicleWithRecovery(runtime.readers, actor.vehicle, actor.model, motion.step) !== null;
    motion.recovered = recovered;
  };
  const legalRecovery = (c: typeof player) => {
    const target = forks.legalTarget(c.actor.vehicle.course.s, c.actor.vehicle.course.l);
    if (!target) return false;
    recoverVehicleToPlanCoordinate(runtime.readers, c.actor.vehicle, c.actor.model, {
      state: c.actor.recovery,
      reason: 'wrong-course',
      target,
    });
    return true;
  };
  // Borrowed competitor observations: every advance overwrites them at the end of its fixed step.
  const playerObservation = createCompetitorObservation(
    player.id,
    sessionVehicle.vehicleDefinition.compiledVehicle.id,
    sessionVehicle.vehicleDefinition.form,
  );
  const rivalObservations = rivals.map((c) =>
    createCompetitorObservation(
      c.id,
      sessionVehicle.vehicleDefinition.compiledVehicle.id,
      sessionVehicle.vehicleDefinition.form,
    ),
  );
  const competitorObservations = [playerObservation, ...rivalObservations];
  const publish = () => {
    for (let i = 0; i < motions.length; i += 1) {
      const motion = motions[i]!;
      writeCompetitorObservation(competitorObservations[i]!, motion.c.actor.vehicle, motion.step.input);
    }
  };
  // Only rivals in the resident window are observable; this is the single residency decision.
  const visible: CompetitorObservation[] = [];
  const observations = () => {
    visible.length = 0;
    for (let i = 0; i < rivals.length; i += 1)
      if (runtime.window.at(rivals[i]!.actor.vehicle.course.s)) visible.push(rivalObservations[i]!);
  };
  const observed: { readonly player: CompetitorObservation; readonly rivals: readonly CompetitorObservation[] } = {
    player: playerObservation,
    rivals: visible,
  };
  publish();
  // Borrowed fixed-step observation; the camera owner consumes it before the next advance.
  const stepObservation = { recovered: false };
  // One ordered stream per step: every competitor's accepted crossings at their race time.
  const noEvents: readonly RaceEvent[] = Object.freeze([]);
  let events = noEvents;
  const stepEvents: RaceEvent[] = [];

  const step = (input: DrivingInput) => {
    if (startPhase.status === 'READY') {
      holdReady(input);
      return;
    }
    if (clock.status !== 'RUNNING') return;
    const stepStart = clock.beginStep();
    let minS = Infinity,
      maxS = -Infinity;
    for (const motion of motions) {
      minS = Math.min(minS, motion.c.actor.vehicle.course.s);
      maxS = Math.max(maxS, motion.c.actor.vehicle.course.s);
    }
    runtime.refresh(minS, maxS);
    move(motions[0]!, input);
    for (let i = 1; i < motions.length; i += 1) {
      const motion = motions[i]!;
      move(
        motion,
        sampleEnvelopeDrivingInput(
          runtime.readers.coordinates,
          motion.c.actor.vehicle,
          driver!,
          motion.input,
          motion.driverWorkspace,
          runtime.window,
        ),
      );
    }
    forks.observe(motions);
    for (const motion of motions) {
      minS = Math.min(minS, motion.c.actor.vehicle.course.s);
      maxS = Math.max(maxS, motion.c.actor.vehicle.course.s);
    }
    runtime.refresh(minS, maxS);
    stepEvents.length = 0;
    let playerFinishSeconds: number | null = null;
    for (const motion of motions) {
      const { c } = motion;
      motion.recovered = legalRecovery(c) || motion.recovered;
      const update = c.observer.update(
        motion.previous,
        c.actor.vehicle.course,
        motion.recovered,
        // The clock decides the player's crossing candidates, in time order, against its deadline.
        c === player ? clock.admit : undefined,
      );
      for (const event of update.events)
        stepEvents.push(
          Object.freeze({
            competitorId: c.id,
            landmark: event.landmark,
            lap: event.lap,
            finish: event.finish,
            timeSeconds: raceEventSeconds(stepStart, event.u),
          }),
        );
      if (update.justFinished) {
        c.finishSeconds = stepEvents.at(-1)!.timeSeconds;
        if (c === player) playerFinishSeconds = c.finishSeconds;
      }
    }
    // Time order; a stable sort keeps competitor order (player, then rivals) for equal times.
    events = stepEvents.length
      ? Object.freeze([...stepEvents].sort((a, b) => a.timeSeconds - b.timeSeconds))
      : noEvents;
    clock.completeStep(playerFinishSeconds);
    stepObservation.recovered = motions[0]!.recovered;
  };

  return Object.freeze({
    player,
    rivals,
    clock,
    /** The last step's accepted crossings of every competitor, in race-time order. */
    get events() {
      return events;
    },
    start: () => startPhase.begin(),
    forks,
    /** One fixed step of SIM_DT; the race takes no step length. */
    advance(input: DrivingInput) {
      stepObservation.recovered = false;
      events = noEvents;
      motions[0]!.step.input = input;
      step(input);
      publish();
      return stepObservation;
    },
    /**
     * Manual recovery of the player: the ordinary recovery toward its lane, then a legal-road check and a
     * progress baseline reset that award no progress, then a fresh observation.
     */
    recoverPlayer() {
      recoverVehicle(runtime.readers, playerActor.vehicle, playerActor.model, {
        state: playerActor.recovery,
        reason: 'manual',
        lane: player.recoveryLane,
      });
      legalRecovery(player);
      resync(player);
      publish();
    },
    /** DEV vehicle HUD only: the player's live mechanics for diagnosis. No other consumer may read it. */
    get playerDiagnostics(): { readonly vehicle: VehicleState; readonly model: VehicleModel } {
      return playerActor;
    },
    observe() {
      observations();
      return observed;
    },
    /** Start phase facts: its status and the seconds until GO. */
    startPhase: Object.freeze({
      get status() {
        return startPhase.status;
      },
      get remainingSeconds() {
        return startPhase.remainingSeconds;
      },
    }),
    /** The read-only Route, whose entry occurrence carries the entry fork's choice. */
    route: runtime.route,
    courseType: course.type,
    lapCount: configuration.lapCount,
    /** A competitor's clock: its finish time, else race time. */
    competitorSeconds: (c: typeof player) => c.finishSeconds ?? clock.elapsedSeconds,
  });
}
