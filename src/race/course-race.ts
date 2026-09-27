import type { ResolvedCourseSession } from './course-session.js';
import { createCheckpointClock } from './checkpoint-clock.js';
import { createRouteProgress, type RouteRaceEvent, type RouteRaceAdmission } from './route-progress.js';
import { createRouteCrossSections } from './route-cross-sections.js';
import { createCourseForkField } from './course-fork-field.js';
import { advanceRaceSession, createRaceSessionState, rankRaceProgress, formatRaceTime } from './race-session.js';
import {
  RECOVERY_SETTINGS,
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
import { createSessionVehicle } from './session-vehicle.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import type { createRouteRuntime } from './route-runtime.js';

type RouteRuntime = ReturnType<typeof createRouteRuntime>;
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
  const driver = compileEnvelopeDriver(envelope, options.session.rivalUtilization, envelope.maximumSpeed);
  const clock = createCheckpointClock(budgets?.initialMs ?? null);
  const startPhase = createStartPhase();
  const lines = createRouteCrossSections(runtime.route, course, configuration.lapCount);
  const forks = createCourseForkField(runtime.route, lines);
  const competitor = (id: string, actor: Actor, targetL: number) => ({
    id,
    actor,
    targetL,
    recoverySettings: { ...RECOVERY_SETTINGS, targetL: (s: number) => forks.recoveryL(s, targetL) },
    observer: createRouteProgress(lines, actor.vehicle.course),
    get progress() {
      return this.observer.state;
    },
    timing: createRaceSessionState(),
    finishElapsedSeconds: null as number | null,
  });
  // Every competitor drives one model of the Session vehicle, spawned at its grid slot with the Session's start speed.
  const model = createVehicleModel(sessionVehicle, SIM_DT);
  const spawn = (slot: (typeof grid)[number], actorModel: VehicleModel) => {
    const vehicle = createVehicle(actorModel, runtime.readers, { s: slot.at.s, l: slot.l, initialSpeed });
    return { vehicle, model: actorModel, recovery: createRecoveryState(vehicle) };
  };
  // Only the interim DEV tuning path replaces the player's model (removed in 10-7b).
  const playerActor: { readonly vehicle: VehicleState; model: VehicleModel; readonly recovery: RecoveryState } = spawn(
    grid[0]!,
    model,
  );
  const player = competitor('PLAYER', playerActor, grid[0]!.l);
  const rivals = createRivalRoster(configuration).map(({ actorId, rivalIndex }) => {
    const slot = grid[rivalIndex + 1]!;
    return competitor(actorId, spawn(slot, model), slot.l);
  });
  const resync = (c: typeof player) => c.observer.resync(c.actor.vehicle.course);
  const lane = (c: typeof player, s: number) => forks.targetL(s, c.targetL);
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
      dt: 0,
      settings: c.recoverySettings,
    },
    input: (s: number) => lane(c, s),
  }));
  const idle: DrivingInput = Object.freeze({ steering: 0, throttle: false, brake: false });
  // READY holds every vehicle with zero clutch capacity; race time and rival driving start at GO,
  // where ordinary updates restore the fixed capacity.
  const holdReady = (input: DrivingInput, dt: number) => {
    for (const motion of motions) {
      motion.step.input = motion === motions[0] ? input : idle;
      updateHeldVehicle(motion.c.actor.vehicle, motion.c.actor.model, motion.step.input);
    }
    if (startPhase.advance(dt)) clock.start();
  };
  const move = (motion: (typeof motions)[number], input: DrivingInput, dt: number) => {
    const { c, previous } = motion;
    const { actor } = c;
    previous.l = actor.vehicle.course.l;
    previous.s = actor.vehicle.course.s;
    motion.current = actor.vehicle;
    motion.step.input = input;
    motion.step.dt = dt;
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
  // Only rivals on the resident Route are observable; this is the single residency decision.
  const visible: CompetitorObservation[] = [];
  const observations = () => {
    visible.length = 0;
    for (let i = 0; i < rivals.length; i += 1)
      if (runtime.route.at(rivals[i]!.actor.vehicle.course.s)) visible.push(rivalObservations[i]!);
  };
  const observed: { readonly player: CompetitorObservation; readonly rivals: readonly CompetitorObservation[] } = {
    player: playerObservation,
    rivals: visible,
  };
  publish();
  // Borrowed fixed-step observation; the camera owner consumes it before the next advance.
  const stepObservation = { recovered: false };
  const noEvents: readonly RouteRaceEvent[] = Object.freeze([]);
  let events = noEvents;
  const clockEvents: { gate: RouteRaceEvent['landmark']; lap: number; u: number; finish: boolean; awardMs: number }[] =
    [];
  let pendingExpiry = Infinity,
    stepStart = 0;
  const admitPlayer: RouteRaceAdmission = (event) => {
    if (stepStart + event.u * stepDuration > pendingExpiry) return false;
    if (event.landmark && !event.finish && budgets) pendingExpiry += budgets.after(event.landmark, event.lap) / 1000;
    return true;
  };
  let stepDuration = 0;

  const step = (input: DrivingInput, dt: number) => {
    if (startPhase.status === 'READY') {
      holdReady(input, dt);
      return;
    }
    if (clock.status !== 'RUNNING') return;
    stepStart = clock.elapsedSeconds;
    stepDuration = dt;
    pendingExpiry = clock.expirySeconds ?? Infinity;
    let minS = Infinity,
      maxS = -Infinity;
    for (const motion of motions) {
      minS = Math.min(minS, motion.c.actor.vehicle.course.s);
      maxS = Math.max(maxS, motion.c.actor.vehicle.course.s);
    }
    runtime.refresh(minS, maxS);
    move(motions[0]!, input, dt);
    for (let i = 1; i < motions.length; i += 1) {
      const motion = motions[i]!;
      move(
        motion,
        sampleEnvelopeDrivingInput(
          runtime.readers.coordinates,
          motion.c.actor.vehicle,
          driver,
          motion.input,
          motion.driverWorkspace,
          runtime.route,
        ),
        dt,
      );
    }
    forks.observe(motions);
    for (const motion of motions) {
      minS = Math.min(minS, motion.c.actor.vehicle.course.s);
      maxS = Math.max(maxS, motion.c.actor.vehicle.course.s);
    }
    runtime.refresh(minS, maxS);
    for (const motion of motions) {
      const { c } = motion;
      motion.recovered = legalRecovery(c) || motion.recovered;
      const update = c.observer.update(
        motion.previous,
        c.actor.vehicle.course,
        motion.recovered,
        c === player ? admitPlayer : undefined,
      );
      if (c.finishElapsedSeconds === null) {
        advanceRaceSession(c.timing, update, dt);
        if (update.justFinished) c.finishElapsedSeconds = c.timing.elapsedSeconds;
      }
      if (c === player) {
        events = update.events;
        clockEvents.length = 0;
        for (const event of events)
          clockEvents.push({
            gate: event.landmark,
            lap: event.lap,
            u: event.u,
            finish: event.finish,
            awardMs: event.finish ? 0 : (budgets?.after(event.landmark, event.lap) ?? 0),
          });
        clock.advance(dt, clockEvents);
      }
    }
    stepObservation.recovered = motions[0]!.recovered;
  };

  return Object.freeze({
    player,
    rivals,
    clock,
    get events() {
      return events;
    },
    start: () => startPhase.begin(),
    forks,
    advance(input: DrivingInput, dt: number) {
      stepObservation.recovered = false;
      motions[0]!.step.input = input;
      step(input, dt);
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
        settings: player.recoverySettings,
      });
      legalRecovery(player);
      resync(player);
      publish();
    },
    /** Interim DEV tuning path until 10-7b: the player alone drives a model of the tuned driving definition. */
    tunePlayerDriving(driving: CompiledDrivingDefinition) {
      playerActor.model = createVehicleModel(
        createSessionVehicle(sessionVehicle.vehicleDefinition, driving, sessionVehicle.surfaceMaterials),
        SIM_DT,
      );
    },
    /** DEV vehicle HUD only: the player's live mechanics for diagnosis. No other consumer may read it. */
    get playerDiagnostics(): { readonly vehicle: VehicleState; readonly model: VehicleModel } {
      return playerActor;
    },
    observe() {
      observations();
      return observed;
    },
    label() {
      const standings = rankRaceProgress(
        competitors.map((c) => ({
          competitorId: c.id,
          s: c.progress.s,
          finishElapsedSeconds: c.finishElapsedSeconds,
        })),
      );
      const rank = standings.find((s) => s.competitorId === player.id)!.rank;
      let state: string = clock.status;
      if (clock.status === 'GOAL' || clock.status === 'GAME_OVER')
        return `${clock.status.replace('_', ' ')} · P${rank}/${rivals.length + 1} · ${formatRaceTime(clock.elapsedSeconds)}`;
      if (startPhase.status === 'READY') return `READY ${Math.ceil(startPhase.remainingSeconds)}`;
      if (clock.status === 'READY') return 'READY';
      if (player.progress.status !== 'FINISHED') {
        if (course.type === 'CIRCUIT')
          state = `LAP ${Math.min(configuration.lapCount, player.progress.acceptedFinishCount + 1)}/${configuration.lapCount}`;
        else {
          const choice = course.entry.fork ? (forks.choice(course.entry.fork)?.from.carriageway.id ?? 'OPEN') : 'GO';
          state = `ROUTE ${choice}`;
        }
      }
      const start = player.timing.elapsedSeconds < 1 ? 'GO · ' : '';
      const remaining = clock.remainingSeconds;
      const timeLeft = remaining === null ? '' : ` · TIME ${Math.ceil(remaining)}`;
      const extension = clock.extensionMs > 0 ? ` · TIME EXTEND +${(clock.extensionMs / 1000).toFixed(1)}` : '';
      return `${start}${state}${timeLeft}${extension} · P${rank}/${rivals.length + 1} · ${formatRaceTime(clock.elapsedSeconds)}`;
    },
  });
}
