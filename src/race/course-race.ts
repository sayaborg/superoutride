import type { ResolvedCourseSession, SessionEntry } from './course-session.js';
import type { RivalEnvelope } from '../content/rival-envelope.js';
import { createCheckpointClock, raceEventSeconds } from './checkpoint-clock.js';
import { rankRaceProgress } from './race-ranking.js';
import { createRankLimitJudge, createRunOutcome, type RunStatus } from './run-outcome.js';
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
import { createRivalPace } from './rival-pace.js';
import {
  compileEnvelopeDriver,
  createEnvelopeDriverWorkspace,
  createVariableEnvelopeDriver,
  plannedEnvelopeSpeed,
  sampleEnvelopeDrivingInput,
} from './envelope-driver.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import { createVehicle, updateVehicle, type VehicleState } from '../vehicle/physics/vehicle-physics.js';
import { createStartPhase, type StartStatus } from './start-phase.js';
import { createVehicleModel, type VehicleModel } from '../vehicle/physics/vehicle-model.js';
import {
  createCompetitorObservation,
  writeCompetitorObservation,
  type CompetitorObservation,
} from './competitor-observation.js';
import { SIM_DT } from './fixed-step.js';
import type { createRouteRuntime } from './route-runtime.js';

type RouteRuntime = ReturnType<typeof createRouteRuntime>;

/** The one run status: the start phase's WAITING or READY before GO, then the run outcome's. */
export type RaceStatus = Exclude<StartStatus, 'GO'> | RunStatus;

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
 * builds every competitor's mechanics, the player's included, from its Session entry's vehicle and each
 * rival's driver from its entry's envelope; callers supply the player's input only.
 */
export function createCourseRace(options: { readonly session: ResolvedCourseSession; readonly runtime: RouteRuntime }) {
  const { course, configuration, budgets, entries, rankLimits, paceSchedule } = options.session;
  const { initialSpeed } = configuration;
  const { runtime } = options;
  // Entries sharing a vehicle share its model, and unpaced entries sharing an envelope share its fixed driver.
  const models = new Map<SessionEntry['vehicle'], VehicleModel>();
  const modelOf = (vehicle: SessionEntry['vehicle']) => {
    let model = models.get(vehicle);
    if (!model) models.set(vehicle, (model = createVehicleModel(vehicle, SIM_DT)));
    return model;
  };
  const drivers = new Map<RivalEnvelope, ReturnType<typeof compileEnvelopeDriver>>();
  // Rival driving exists only with an envelope; Session resolution admits no rivals without one. An entry with a pace
  // ratio drives its own driver at the utilization and speed cap its pace sets; the others share their envelope's
  // fixed driver.
  const drivingOf = (entry: SessionEntry) => {
    const { envelope } = entry;
    if (!envelope) throw new Error('rivals require an envelope driver');
    if (entry.pace === null) return { driver: driverOf(envelope), pace: null, set: null };
    if (!paceSchedule) throw new Error('a paced rival requires the pace schedule');
    const pace = createRivalPace(
      runtime.route,
      paceSchedule,
      entry.pace,
      entry.vehicle.drivingDefinition.compiledDriving.rivalPace,
      SIM_DT,
    );
    const variable = createVariableEnvelopeDriver(
      envelope,
      pace.utilization,
      pace.speedFraction * envelope.maximumSpeed,
    );
    return { driver: variable.driver, pace, set: variable.set };
  };
  const driverOf = (envelope: RivalEnvelope) => {
    let driver = drivers.get(envelope);
    if (!driver)
      drivers.set(
        envelope,
        (driver = compileEnvelopeDriver(envelope, options.session.rivalUtilization, envelope.maximumSpeed)),
      );
    return driver;
  };
  const clock = createCheckpointClock(budgets);
  const outcome = createRunOutcome();
  const startPhase = createStartPhase();
  const lines = createRouteCrossSections(runtime.route, course, configuration.lapCount);
  // The fork field is the fork decider: the only holder of the Route's selection authority.
  const forks = createCourseForkField(runtime.route, lines, runtime.selectSuccessor);
  // A rival's intent drives it; the player's input comes from its composition, so it has no intent here.
  const competitor = (
    id: string,
    actor: Actor,
    lane: number,
    intent: DriverIntent | null,
    stages: SessionEntry['stages'],
  ) => ({
    id,
    actor,
    lane,
    intent,
    /** The stages this competitor takes part in; null for the whole run. */
    stages,
    /**
     * Whether the competitor is in the Session: one that has not yet appeared or has left is never moved, ranked,
     * judged, drawn or voiced.
     */
    present: stages === null || stages.first === 1,
    /** Whether the competitor has entered the Session; its leaving is final. */
    appeared: stages === null || stages.first === 1,
    /** The race's recovery lane resolver for this competitor. */
    recoveryLane: (s: number) => forks.recoveryL(s, lane),
    observer: createRouteProgress(lines, actor.vehicle.course),
    get progress() {
      return this.observer.state;
    },
    /** Race time of this competitor's finish event; null until it finishes. */
    finishSeconds: null as number | null,
    /**
     * Race time its current lap began: GO for a competitor on the grid, else its latest FINISH line crossing; null for
     * one that appeared ahead until it first crosses the FINISH line.
     */
    lapStartSeconds: (stages === null || stages.first === 1 ? 0 : null) as number | null,
    /** On a CIRCUIT, its fastest complete lap in seconds; null until it completes one, and on other course types. */
    bestLapSeconds: null as number | null,
    /** On a CIRCUIT, its latest complete lap in seconds; null until it completes one, and on other course types. */
    lastLapSeconds: null as number | null,
  });
  // Every competitor drives the model of its entry's vehicle, spawned at its grid slot with the Session's start speed,
  // or, appearing ahead, where and as fast as it appears.
  const spawn = (entry: SessionEntry, at: { s: number; l: number; initialSpeed: number }): Actor => {
    const model = modelOf(entry.vehicle);
    const vehicle = createVehicle(model, runtime.readers, at);
    return { vehicle, model, recovery: createRecoveryState(vehicle) };
  };
  const [playerEntry, ...rivalEntries] = entries;
  const playerSlot = playerEntry!.slot!;
  const playerActor = spawn(playerEntry!, { s: playerSlot.at.s, l: playerSlot.l, initialSpeed });
  const player = competitor(playerEntry!.id, playerActor, playerSlot.l, null, null);
  // An ahead appearance must lie within the Route the runtime keeps loaded ahead of the player.
  for (const entry of rivalEntries)
    if (entry.ahead && entry.ahead.distance > runtime.coverage.forwardMeters - runtime.coverage.maximumStepMeters)
      throw new RangeError(`${entry.id}: an ahead appearance beyond the loaded Route`);
  // ARCADE rank limits judge the player against every other competitor's crossings.
  const judge = createRankLimitJudge(rankLimits, player.id);
  const rivalDriving = rivalEntries.map(drivingOf);
  const rivals = rivalEntries.map((entry, rivalIndex) => {
    const lane = entry.slot ? entry.slot.l : entry.ahead!.lateral;
    // The race assigns each rival's target exits from the Session seed; its grid side implies none.
    const intent: DriverIntent = {
      lane,
      exit: (occurrence) =>
        rivalExit(configuration.seed, rivalIndex, occurrence.ordinal, occurrence.section.fork!.exits.length),
    };
    // Until it appears, an ahead entry's actor waits unmoved at the player's slot; nothing reads it.
    const at = entry.slot ?? playerSlot;
    return competitor(entry.id, spawn(entry, { s: at.at.s, l: at.l, initialSpeed }), lane, intent, entry.stages);
  });
  const resync = (c: typeof player) => c.observer.resync(c.actor.vehicle.course);
  const competitors = [player, ...rivals];
  const motions = competitors.map((c, index) => ({
    c,
    id: c.id,
    index,
    /** A rival's envelope driver, with its pace and utilization/speed-cap setter when paced; null for the player. */
    driving: index === 0 ? null : rivalDriving[index - 1]!,
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
  // The competitors present in the Session, the player first, in competitor order.
  let active = motions.filter((motion) => motion.c.present);
  // The race gates the player has crossed since GO, across laps: the player is in STAGE playerGates + 1.
  let playerGates = 0;
  const { view } = runtime.coverage;
  // A competitor out of view lies behind the camera or beyond the farthest rendered depth.
  const outOfView = (s: number) => {
    const cameraS = player.actor.vehicle.course.s - view.cameraDistance;
    return s < cameraS || s - cameraS > view.far;
  };
  // An entry from a later stage appears ahead of the player when the player enters that stage, in its lane, at its
  // driver's planned speed there; its progress counts the gates after that station.
  const appear = () => {
    let appeared = false;
    for (const motion of motions) {
      const { c } = motion;
      if (c.appeared || playerGates < c.stages!.first - 1) continue;
      const entry = rivalEntries[motion.index - 1]!;
      const s = player.actor.vehicle.course.s + entry.ahead!.distance;
      const lane = (station: number) => forks.targetL(station, c.intent!);
      const driving = motion.driving!;
      driving.pace?.join(s);
      const speed = plannedEnvelopeSpeed(runtime.readers.coordinates, s, driving.driver, lane, runtime.window);
      c.actor = spawn(entry, { s, l: lane(s), initialSpeed: speed });
      c.observer = createRouteProgress(lines, c.actor.vehicle.course, s);
      motion.current = c.actor.vehicle;
      motion.step.state = c.actor.recovery;
      c.present = c.appeared = true;
      appeared = true;
    }
    if (appeared) active = motions.filter((motion) => motion.c.present);
  };
  const depart = () => {
    let departed = false;
    for (const motion of active) {
      const { c } = motion;
      if (c.stages === null || playerGates < c.stages.last || !outOfView(c.actor.vehicle.course.s)) continue;
      c.present = false;
      departed = true;
    }
    if (departed) active = active.filter((motion) => motion.c.present);
  };
  const idle: DrivingInput = Object.freeze({ steering: 0, throttle: false, brake: false });
  // READY holds every vehicle in its update; race time and rival driving start at GO, where free updates restore
  // the fixed clutch capacity.
  const holdReady = (input: DrivingInput) => {
    for (const motion of active) {
      motion.step.input = motion === active[0] ? input : idle;
      updateVehicle(runtime.readers, motion.c.actor.vehicle, motion.c.actor.model, motion.step.input, true);
    }
    startPhase.advance();
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
  const competitorObservations = entries.map(({ id, vehicle, color }) =>
    createCompetitorObservation(
      id,
      vehicle.vehicleDefinition.compiledVehicle.id,
      color,
      vehicle.vehicleDefinition.form,
    ),
  );
  const playerObservation = competitorObservations[0]!,
    rivalObservations = competitorObservations.slice(1);
  const publish = () => {
    for (let i = 0; i < motions.length; i += 1) {
      const motion = motions[i]!;
      writeCompetitorObservation(
        competitorObservations[i]!,
        motion.c.actor.vehicle,
        motion.c.actor.model,
        motion.step.input,
      );
    }
  };
  // Only rivals in the resident window are observable; this is the single residency decision.
  const visible: CompetitorObservation[] = [];
  const observations = () => {
    visible.length = 0;
    for (let i = 0; i < rivals.length; i += 1)
      if (rivals[i]!.present && runtime.window.at(rivals[i]!.actor.vehicle.course.s))
        visible.push(rivalObservations[i]!);
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

  // The player's driving after its finish: the envelope driver at the Session driver utilization, holding the lateral
  // position it finished at and planning a stop at its runout distance past the finish, within any Route terminal. A
  // Session without an envelope holds the brake instead.
  const takeoverDriver = playerEntry!.envelope ? driverOf(playerEntry!.envelope) : null;
  const takeoverWorkspace = createEnvelopeDriverWorkspace();
  const takeoverIntent: { lane: number; exit: DriverIntent['exit'] } = { lane: 0, exit: () => 0 };
  const takeoverLane = (s: number) => forks.targetL(s, takeoverIntent);
  const takeoverDomain = { start: 0, end: 0, terminal: null as number | null };
  let stopS = Infinity;
  const takeOver = () => {
    const { s, l } = player.actor.vehicle.course;
    takeoverIntent.lane = forks.intentLane(s, l);
    if (takeoverDriver) stopS = s + takeoverDriver.envelope.maximumSpeed ** 2 / (2 * takeoverDriver.braking);
  };
  const holdBrake: DrivingInput = Object.freeze({ steering: 0, throttle: false, brake: true });
  // After GOAL the takeover drives the player and its input no longer reaches the vehicle; after GAME OVER the
  // throttle is released and the player's steering and brake still apply.
  const afterRunInput = (input: DrivingInput): DrivingInput => {
    if (outcome.status === 'GAME_OVER') return { ...input, throttle: false };
    if (!takeoverDriver) return holdBrake;
    const { window } = runtime;
    takeoverDomain.start = window.start;
    takeoverDomain.end = window.end;
    takeoverDomain.terminal = Math.min(window.terminal ?? Infinity, stopS);
    return sampleEnvelopeDrivingInput(
      runtime.readers.coordinates,
      player.actor.vehicle,
      takeoverDriver,
      takeoverLane,
      takeoverWorkspace,
      takeoverDomain,
    );
  };
  /**
   * Moves the present field one step: the player by `input`, each rival by its driver, then fork observation and Route
   * loading. A running step (`stepStart` set) also paces paced rivals; after the run ends they hold their pace.
   */
  const driveField = (input: DrivingInput, stepStart: number | null) => {
    let minS = Infinity,
      maxS = -Infinity;
    for (const motion of active) {
      minS = Math.min(minS, motion.c.actor.vehicle.course.s);
      maxS = Math.max(maxS, motion.c.actor.vehicle.course.s);
    }
    runtime.refresh(minS, maxS);
    move(active[0]!, input);
    for (let i = 1; i < active.length; i += 1) {
      const motion = active[i]!;
      const driving = motion.driving!;
      if (driving.pace && stepStart !== null) {
        driving.pace.update(motion.c.actor.vehicle.course.s, stepStart);
        driving.set(driving.pace.utilization, driving.pace.speedFraction * driving.driver.envelope.maximumSpeed);
      }
      move(
        motion,
        sampleEnvelopeDrivingInput(
          runtime.readers.coordinates,
          motion.c.actor.vehicle,
          driving.driver,
          motion.input,
          motion.driverWorkspace,
          runtime.window,
        ),
      );
    }
    forks.observe(active);
    for (const motion of active) {
      minS = Math.min(minS, motion.c.actor.vehicle.course.s);
      maxS = Math.max(maxS, motion.c.actor.vehicle.course.s);
      // After the run ends, progress, events, presence and the clock hold; recovery still keeps the field legal.
      if (stepStart === null) motion.recovered = legalRecovery(motion.c) || motion.recovered;
    }
    runtime.refresh(minS, maxS);
  };

  const step = (input: DrivingInput) => {
    if (startPhase.status === 'WAITING') return;
    if (startPhase.status === 'READY') {
      holdReady(input);
      return;
    }
    if (outcome.status !== 'RUNNING') {
      driveField(afterRunInput(input), null);
      stepObservation.recovered = active[0]!.recovered;
      return;
    }
    const stepStart = clock.beginStep();
    driveField(input, stepStart);
    stepEvents.length = 0;
    let playerFinishSeconds: number | null = null;
    for (const motion of active) {
      const { c } = motion;
      motion.recovered = legalRecovery(c) || motion.recovered;
      const update = c.observer.update(
        motion.previous,
        c.actor.vehicle.course,
        motion.recovered,
        // The clock decides the player's crossing candidates, in time order, against its deadline.
        c === player ? clock.admit : undefined,
      );
      for (const event of update.events) {
        const timeSeconds = raceEventSeconds(stepStart, event.u);
        stepEvents.push(
          Object.freeze({
            competitorId: c.id,
            landmark: event.landmark,
            lap: event.lap,
            finish: event.finish,
            timeSeconds,
          }),
        );
        if (course.type === 'CIRCUIT' && event.kind === 'finish') {
          if (c.lapStartSeconds !== null) {
            c.lastLapSeconds = timeSeconds - c.lapStartSeconds;
            c.bestLapSeconds = Math.min(c.bestLapSeconds ?? Infinity, c.lastLapSeconds);
          }
          c.lapStartSeconds = timeSeconds;
        }
      }
      if (c === player) playerGates += update.events.length;
      if (update.justFinished) {
        c.finishSeconds = stepEvents.at(-1)!.timeSeconds;
        if (c === player) playerFinishSeconds = c.finishSeconds;
      }
    }
    depart();
    appear();
    // Time order; a stable sort keeps competitor order (player, then rivals) for equal times.
    events = stepEvents.length
      ? Object.freeze([...stepEvents].sort((a, b) => a.timeSeconds - b.timeSeconds))
      : noEvents;
    // The earliest ending decides the outcome: the player's finish, a rank failure, then expiry. The player's own
    // crossing wins an exact tie with either failure, and expiry wins an exact tie with a rank failure.
    let ending: { seconds: number; end: Parameters<typeof outcome.end>[0] } | null =
      playerFinishSeconds === null ? null : { seconds: playerFinishSeconds, end: { status: 'GOAL' } };
    const rankFailure = judge.observe(events);
    if (rankFailure !== null && (ending === null || rankFailure < ending.seconds))
      ending = { seconds: rankFailure, end: { status: 'GAME_OVER', cause: 'RANK' } };
    const expiry = clock.expirySeconds;
    if (
      expiry !== null &&
      (ending === null || expiry < ending.seconds || (expiry === ending.seconds && ending.end.status === 'GAME_OVER'))
    )
      ending = { seconds: expiry, end: { status: 'GAME_OVER', cause: 'TIME' } };
    clock.completeStep(ending?.seconds ?? clock.stepEndSeconds);
    if (ending) {
      outcome.end(ending.end, ending.seconds);
      if (ending.end.status === 'GOAL') takeOver();
    }
    stepObservation.recovered = active[0]!.recovered;
  };

  return Object.freeze({
    player,
    rivals,
    clock,
    /** The player's STAGE: one more than the race gates the player has crossed since GO, across laps. */
    get stage() {
      return playerGates + 1;
    },
    /**
     * The player's rank among the competitors present in the Session (`rankRaceProgress`) and their count: the one
     * standing every display reads.
     */
    get standing(): { readonly rank: number; readonly count: number } {
      const present = [player, ...rivals.filter((c) => c.present)];
      const standings = rankRaceProgress(
        present.map((c) => ({ competitorId: c.id, s: c.progress.s, finishSeconds: c.finishSeconds })),
      );
      return { rank: standings.find((s) => s.competitorId === player.id)!.rank, count: present.length };
    },
    /**
     * The rank limit N of the player's next race gate: the player fails there when N other competitors cross it first.
     * Null when that gate has none or the player has finished.
     */
    get nextRankLimit(): number | null {
      const next = player.progress.next;
      return next && Object.hasOwn(rankLimits, next.landmark.id) ? rankLimits[next.landmark.id]! : null;
    },
    /**
     * When the only present rival takes part in a stage interval holding the player's STAGE (one rival per stage), its
     * Route station less the player's, in metres: positive while it is ahead. Null otherwise.
     */
    get stageRivalGap(): number | null {
      const present = rivals.filter((c) => c.present);
      if (present.length !== 1) return null;
      const [rival] = present;
      const stage = playerGates + 1;
      if (rival!.stages === null || stage < rival!.stages.first || stage > rival!.stages.last) return null;
      return rival!.progress.s - player.progress.s;
    },
    /** The run's one status (WAITING and READY before GO, then RUNNING, GOAL or GAME_OVER) and GAME OVER cause. */
    outcome: Object.freeze({
      get status(): RaceStatus {
        return startPhase.status === 'GO' ? outcome.status : startPhase.status;
      },
      get cause() {
        return outcome.cause;
      },
      /** The race time of the GOAL or GAME OVER; null before. The field keeps driving after it. */
      get endSeconds() {
        return outcome.endSeconds;
      },
    }),
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
    /** The countdown to GO: the seconds until GO and the signal lamps lit, both 0 from GO. */
    countdown: Object.freeze({
      get remainingSeconds() {
        return startPhase.remainingSeconds;
      },
      get signalLamps() {
        return startPhase.signalLamps;
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
