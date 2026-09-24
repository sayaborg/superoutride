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
  recoverVehicleToPlanCoordinate,
  type RecoveryState,
} from './recovery.js';
import {
  compileEnvelopeDriver,
  createEnvelopeDriverWorkspace,
  sampleEnvelopeDrivingInput,
  type VehicleEnvelope,
} from './envelope-driver.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import { createArcadeVehicle, type ArcadeVehicleState } from '../vehicle/physics/arcade-vehicle-physics.js';
import type { SessionVehicle } from './session-configuration.js';
import { createRivalRoster } from './rival-roster.js';
import type { createRouteRuntime } from './route-runtime.js';

type RouteRuntime = ReturnType<typeof createRouteRuntime>;
interface Actor {
  readonly vehicle: ArcadeVehicleState;
  readonly recovery: RecoveryState;
}

/** Borrowed actor state in the observer's active frame, valid until the next observe(). */
export interface RaceActorObservation {
  readonly id: string;
  readonly vehicle: ArcadeVehicleState;
  readonly kind: SessionVehicle['kind'];
  readonly paletteVariant: 'base' | 'braking';
}

/** Field composition over shared course readers, ordinary mechanics and ordered physical gates. */
export function createCourseRace(options: {
  readonly session: ResolvedCourseSession;
  readonly player: Actor;
  readonly runtime: RouteRuntime;
  readonly rival: SessionVehicle;
  readonly rivalEnvelope?: VehicleEnvelope;
}) {
  const { course, configuration, grid, initialSpeed, budgets } = options.session;
  const { runtime } = options;
  if (configuration.rivalCount && !options.rivalEnvelope)
    throw new RangeError('Rivals require a current vehicle envelope');
  const driver = options.rivalEnvelope
    ? compileEnvelopeDriver(options.rivalEnvelope, options.session.rivalUtilization, options.rivalEnvelope.maximumSpeed)
    : null;
  const clock = createCheckpointClock(budgets?.initialMs ?? null);
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
  const player = competitor('PLAYER', options.player, grid[0]!.l);
  const rivals = createRivalRoster(configuration).map(({ actorId, rivalIndex }) => {
    const slot = grid[rivalIndex + 1]!;
    const targetL = slot.l;
    const profile = options.rival;
    const vehicle = createArcadeVehicle(profile.profile, runtime.readers, {
      s: slot.anchor.s,
      l: targetL,
      initialSpeed,
      torqueProtection: profile.torqueProtection,
      steeringCalibration: profile.steeringCalibration,
      tireFrictionCalibration: profile.tireFrictionCalibration,
    });
    return competitor(actorId, { vehicle, recovery: createRecoveryState(vehicle) }, targetL);
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
  const actorInputs = new Map(motions.map((motion) => [motion.c.id, motion.step]));
  const move = (motion: (typeof motions)[number], input: DrivingInput, dt: number) => {
    const { c, previous } = motion;
    const { actor } = c;
    previous.l = actor.vehicle.course.l;
    previous.s = actor.vehicle.course.s;
    motion.current = actor.vehicle;
    motion.step.input = input;
    motion.step.dt = dt;
    const recovered = advanceVehicleWithRecovery(runtime.readers, actor.vehicle, motion.step) !== null;
    motion.recovered = recovered;
  };
  const legalRecovery = (c: typeof player) => {
    const target = forks.legalTarget(c.actor.vehicle.course.s, c.actor.vehicle.course.l);
    if (!target) return false;
    recoverVehicleToPlanCoordinate(runtime.readers, c.actor.vehicle, {
      state: c.actor.recovery,
      reason: 'wrong-course',
      target,
    });
    return true;
  };
  const visible: RaceActorObservation[] = [];
  const pool = rivals.map((c) => ({
    id: c.id,
    kind: options.rival.kind,
    paletteVariant: 'base' as 'base' | 'braking',
    vehicle: c.actor.vehicle,
  }));
  const observations = () => {
    visible.length = 0;
    for (let i = 0; i < rivals.length; i += 1) {
      const c = rivals[i]!;
      const vehicle = c.actor.vehicle;
      if (!runtime.route.at(vehicle.course.s)) continue;
      const observation = pool[i]!;
      observation.paletteVariant = actorInputs.get(c.id)?.input.brake ? 'braking' : 'base';
      visible.push(observation);
    }
  };
  const observed = { rivals: visible };
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

  return Object.freeze({
    player,
    rivals,
    clock,
    get events() {
      return events;
    },
    start: () => clock.start(),
    forks,
    recoveryL: (s: number) => forks.recoveryL(s, player.targetL),
    advance(input: DrivingInput, dt: number) {
      stepObservation.recovered = false;
      if (clock.status !== 'RUNNING') return stepObservation;
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
            driver!,
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
          if (update?.justFinished) c.finishElapsedSeconds = c.timing.elapsedSeconds;
        }
        if (c === player) {
          events = update?.events ?? noEvents;
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
      return stepObservation;
    },
    resyncPlayer() {
      legalRecovery(player);
      resync(player);
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
      const countdown = remaining === null ? '' : ` · TIME ${Math.ceil(remaining)}`;
      const extension = clock.extensionMs > 0 ? ` · TIME EXTEND +${(clock.extensionMs / 1000).toFixed(1)}` : '';
      return `${start}${state}${countdown}${extension} · P${rank}/${rivals.length + 1} · ${formatRaceTime(clock.elapsedSeconds)}`;
    },
  });
}
