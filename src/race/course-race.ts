import type { ResolvedCourseSession, SessionEntry } from './course-session.js';
import { createCheckpointClock, raceEventSeconds } from './checkpoint-clock.js';
import { rankRaceProgress } from './race-ranking.js';
import { enumerateCourseRoutes } from '../course/compiler/course-routes.js';
import { createRankLimitJudge, createRunOutcome, type RunStatus } from './run-outcome.js';
import { createRouteProgress, type RouteRaceEvent } from './route-progress.js';
import { createRouteCrossSections } from './route-cross-sections.js';
import { createCourseForkField } from './course-fork-field.js';
import { rivalExit } from './rival-exit.js';
import { createRecoveryState, advanceVehicleWithRecovery, recoverVehicle, type RecoveryState } from './recovery.js';
import { createBodyContacts, createContactFaces } from './body-contacts.js';
import type { LaneIntent } from './lane-following.js';
import { createTrafficField, type TrafficMotion } from './traffic.js';
import { createVehiclePlacement } from './vehicle-placement.js';
import { createLaneDriving } from './lane-driving.js';
import {
  createPresentVehicle,
  type PresentVehicle,
  type VehicleActor,
  type VehicleDriving,
} from './present-vehicle.js';
import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import { createRivalPace } from './rival-pace.js';
import { createEnvelopeDriverWorkspace, createVariableEnvelopeDriver, drivingDomainBefore } from './envelope-driver.js';
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
import { createBarrierContacts } from './barrier-contacts.js';
import { createRoadsideObjects, type KnockedObjectObservation } from './object-contacts.js';
import type { createRouteRuntime } from './route-runtime.js';
import type { RouteOccurrence } from '../course/course-route.js';

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

/** A paced rival's pace and the utilization/speed-cap setter of its driver. */
interface RivalPacing {
  readonly pace: ReturnType<typeof createRivalPace>;
  readonly set: (utilization: number, speedCap: number) => void;
}

/**
 * Field composition over shared course readers, ordinary mechanics and ordered physical gates. The race
 * builds every competitor's mechanics, the player's included, from its Session entry's vehicle and each
 * rival's driver from its entry's envelope; callers supply the player's input only.
 */
export function createCourseRace(options: {
  readonly session: ResolvedCourseSession;
  readonly runtime: RouteRuntime;
  /** The target exit at each fork occurrence of the player's Session driver, which drives the player on request. */
  readonly playerExit?: (occurrence: RouteOccurrence) => number;
}) {
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
  // Rival driving exists only with an envelope; Session resolution admits no rivals without one. An entry with a pace
  // ratio drives its own driver at the utilization and speed cap its pace sets; the others share their envelope's
  // fixed driver, which the Session compiled.
  const drivingOf = (entry: SessionEntry) => {
    const { envelope } = entry;
    if (!envelope) throw new Error('rivals require an envelope driver');
    if (entry.pace === null) return { driver: options.session.driverOf(envelope), pace: null, set: null };
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
      true,
    );
    return { driver: variable.driver, pace, set: variable.set };
  };
  const clock = createCheckpointClock(budgets);
  const outcome = createRunOutcome();
  const startPhase = createStartPhase();
  const lines = createRouteCrossSections(runtime.route, course, configuration.lapCount);
  // The course's routes as reference runs name them: each its Links in canonical order; a circuit's is empty.
  const routes = enumerateCourseRoutes(course.entry, course.type);
  // The fork field is the fork decider: the only holder of the Route's selection authority.
  const forks = createCourseForkField(runtime.route, lines, runtime.selectSuccessor);
  // A competitor: its present vehicle (`body`), which the race moves, and its part in the race. A rival's driver drives
  // it, paced when `pacing` is set; the player's input comes from its composition until the takeover after GOAL.
  const competitor = (
    id: string,
    actor: VehicleActor,
    driving: VehicleDriving | null,
    pacing: RivalPacing | null,
    stages: SessionEntry['stages'],
  ) => {
    // The race's recovery lane resolver: a rival's lane; the player recovers to the centre of its road.
    const recoveryIntent = driving?.intent ?? null;
    const recoveryLane = (s: number) => forks.recoveryL(s, recoveryIntent);
    const body = createPresentVehicle(id, actor, driving, (self, s) => vacantPlace(self, s, recoveryLane));
    return {
      id,
      /** Its present vehicle. */
      body,
      /** Its mechanics. */
      get actor(): VehicleActor {
        return body.actor;
      },
      /** A paced rival's pace and the utilization/speed-cap setter of its driver; null otherwise. */
      pacing,
      /** The stages this competitor takes part in; null for the whole run. */
      stages,
      /**
       * Whether the competitor is in the Session: one that has not yet appeared or has left is never moved, ranked,
       * judged, drawn or voiced.
       */
      present: stages === null || stages.first === 1,
      /** Whether the competitor has entered the Session; its leaving is final. */
      appeared: stages === null || stages.first === 1,
      observer: createRouteProgress(lines, body.vehicle.course),
      get progress() {
        return this.observer.state;
      },
      /**
       * Race time its current lap began: GO for a competitor on the grid, else its latest FINISH line crossing; null for
       * one that appeared ahead until it first crosses the FINISH line.
       */
      lapStartSeconds: (stages === null || stages.first === 1 ? 0 : null) as number | null,
      /** On a CIRCUIT, its fastest complete lap in seconds; null until it completes one, and on other course types. */
      bestLapSeconds: null as number | null,
      /** On a CIRCUIT, its latest complete lap in seconds; null until it completes one, and on other course types. */
      lastLapSeconds: null as number | null,
      /** The race time of each race line it has crossed (every checkpoint and FINISH line, every lap), in order. */
      crossingSeconds: [] as number[],
      /** The ID of the FINISH gate it finished at; null until it finishes. */
      finishGateId: null as string | null,
      /** Race time of its finish: its last crossing, which no later crossing follows; null until it finishes. */
      get finishSeconds(): number | null {
        return this.finishGateId === null ? null : this.crossingSeconds.at(-1)!;
      },
    };
  };
  // Every competitor drives the model of its entry's vehicle, spawned at its grid slot with the Session's start speed,
  // or, appearing ahead, where and as fast as it appears.
  const spawn = (entry: SessionEntry, at: { s: number; l: number; initialSpeed: number }): VehicleActor => {
    const model = modelOf(entry.vehicle);
    const vehicle = createVehicle(model, runtime.readers, at);
    return { vehicle, model, recovery: createRecoveryState(vehicle) };
  };
  const [playerEntry, ...rivalEntries] = entries;
  const playerSlot = playerEntry!.slot!;
  const playerActor = spawn(playerEntry!, { s: playerSlot.at.s, l: playerSlot.l, initialSpeed });
  const player = competitor(playerEntry!.id, playerActor, null, null, null);
  // An ahead appearance must lie within the Route the runtime keeps loaded ahead of the player.
  for (const entry of rivalEntries)
    if (entry.ahead && entry.ahead.distance > runtime.coverage.forwardMeters - runtime.coverage.maximumStepMeters)
      throw new RangeError(`${entry.id}: an ahead appearance beyond the loaded Route`);
  // ARCADE rank limits judge the player against every other competitor's crossings.
  const judge = createRankLimitJudge(rankLimits, player.id);
  const rivalDriving = rivalEntries.map(drivingOf);
  const rivals = rivalEntries.map((entry, rivalIndex) => {
    // A grid rival starts in the lane nearest its slot; an ahead entry names its lane.
    // The race assigns each rival's target exits from the Session seed; its grid side implies none.
    const exit = (occurrence: RouteOccurrence) =>
      rivalExit(options.session.seed, rivalIndex, occurrence.ordinal, occurrence.section.fork!.exits.length);
    // An ahead entry's lane is read where it appears; until then nothing reads it.
    const intent: LaneIntent = entry.slot
      ? { lane: forks.intentLane(entry.slot.at.s, entry.slot.l, exit), at: entry.slot.at.s, exit }
      : { lane: entry.ahead!.lane, at: 0, exit };
    // Until it appears, an ahead entry's actor waits unmoved at the player's slot; nothing reads it.
    const at = entry.slot ?? playerSlot;
    const { driver, pace, set } = rivalDriving[rivalIndex]!;
    return competitor(
      entry.id,
      spawn(entry, { s: at.at.s, l: at.l, initialSpeed }),
      {
        driver,
        intent,
        workspace: createEnvelopeDriverWorkspace(),
        target: (s: number) => forks.targetL(s, intent),
      },
      pace ? { pace, set: set! } : null,
      entry.stages,
    );
  });
  const resync = (c: typeof player) => c.observer.resync(c.actor.vehicle.course);
  const competitors = [player, ...rivals];
  // The competitors present in the Session, the player first, in competitor order, and their present vehicles.
  let active = competitors.filter((c) => c.present);
  let activeBodies = active.map((c) => c.body);
  // Every vehicle present: the present competitors, then the traffic. Contacts, sightings and placement read it.
  const bodies: PresentVehicle[] = [];
  const refreshBodies = () => {
    activeBodies = active.map((c) => c.body);
    bodies.length = 0;
    bodies.push(...activeBodies, ...traffic);
  };
  // Body contacts push present vehicles apart, by one face rule for every pair (fixed objects included); the Session's
  // driving definition holds the spring-damper.
  const contactFaces = createContactFaces(runtime.readers.coordinates, options.session.bodyContact);
  const bodyContacts = createBodyContacts(contactFaces);
  // Walls and course limits push every present vehicle back with the same spring-damper.
  const barrierContacts = createBarrierContacts(
    runtime.readers.coordinates,
    runtime.window,
    options.session.bodyContact,
    contactFaces,
    SIM_DT,
  );
  // Standing roadside objects push every present vehicle back as a vehicle would; movable ones are knocked away.
  const roadsideObjects = createRoadsideObjects({
    route: runtime.window,
    coordinates: runtime.readers.coordinates,
    height: runtime.readers.height,
    extent: runtime.readers.extent,
    faces: contactFaces,
    step: SIM_DT,
  });
  // Placement and the drivers' lane decisions read the present vehicles.
  const placement = createVehiclePlacement({
    readers: runtime.readers,
    window: runtime.window,
    forks,
    roadsideObjects,
    bodies,
  });
  const { vacantPlace } = placement;
  const laneDriving = createLaneDriving({
    road: runtime.readers,
    window: runtime.window,
    forks,
    roadsideObjects,
    bodies,
  });
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
    for (let i = 0; i < rivals.length; i += 1) {
      const c = rivals[i]!;
      if (c.appeared || playerGates < c.stages!.first - 1) continue;
      const entry = rivalEntries[i]!;
      const s = player.actor.vehicle.course.s + entry.ahead!.distance;
      const { intent, driver } = c.body.driving!;
      // Its lane number is the one of the Carriageway it follows where it appears.
      intent.at = s;
      const lane = (station: number) => forks.targetL(station, intent);
      // An appearance on another vehicle's footprint, or one a vehicle behind could not stop for, waits for a later step.
      if (placement.occupied(c.actor.model, s, lane(s))) continue;
      const speed = laneDriving.appearanceSpeed(c.actor.model, s, intent, driver);
      if (speed === null) continue;
      c.pacing?.pace.join(s);
      c.body.actor = spawn(entry, { s, l: lane(s), initialSpeed: speed });
      c.observer = createRouteProgress(lines, c.actor.vehicle.course, s);
      c.present = c.appeared = true;
      appeared = true;
    }
    if (appeared) {
      active = competitors.filter((c) => c.present);
      refreshBodies();
    }
  };
  const depart = () => {
    let departed = false;
    for (const c of active) {
      if (c.stages === null || playerGates < c.stages.last || !outOfView(c.actor.vehicle.course.s)) continue;
      c.present = false;
      departed = true;
    }
    if (departed) {
      active = active.filter((c) => c.present);
      refreshBodies();
    }
  };
  const idle: DrivingInput = Object.freeze({ steering: 0, throttle: false, brake: false });
  // READY holds every vehicle in its update; race time and rival driving start at GO, where free updates restore
  // the fixed clutch capacity.
  const holdReady = (input: DrivingInput) => {
    for (const body of activeBodies) {
      body.step.input = body === activeBodies[0] ? input : idle;
      updateVehicle(runtime.readers, body.vehicle, body.model, body.step.input, true);
    }
    startPhase.advance();
  };
  const move = (body: PresentVehicle, input: DrivingInput) => {
    const { previous, vehicle } = body;
    previous.l = vehicle.course.l;
    previous.s = vehicle.course.s;
    body.step.input = input;
    body.recovered = advanceVehicleWithRecovery(runtime.readers, vehicle, body.model, body.step) !== null;
  };
  const { legalRecovery } = placement;
  // The traffic field owns traffic appearance, holding and departure; the race supplies what it shares.
  const appearanceLine = () => player.actor.vehicle.course.s - view.cameraDistance + view.far;
  const trafficField = createTrafficField({
    traffic: options.session.traffic,
    seed: options.session.seed,
    limit: SESSION_RULE_LIMITS.traffic,
    runtime,
    forks,
    modelOf,
    placement,
    laneDriving,
    view: { appearanceLine, outOfView },
    simulationSeconds: () => simulationSeconds,
  });
  // The traffic present, in order of appearance.
  const traffic: readonly TrafficMotion[] = trafficField.vehicles;
  refreshBodies();
  // Seconds of every advanced fixed step, READY and after the ending included; it stops only when no step runs.
  let simulationSeconds = 0;
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
    for (let i = 0; i < competitors.length; i += 1) {
      const { body } = competitors[i]!;
      writeCompetitorObservation(
        competitorObservations[i]!,
        body.vehicle,
        body.model,
        body.step.input,
        simulationSeconds,
      );
    }
    for (const vehicle of traffic)
      writeCompetitorObservation(
        vehicle.observation,
        vehicle.vehicle,
        vehicle.model,
        vehicle.step.input,
        simulationSeconds,
      );
  };
  // Only rivals and traffic in the resident window are observable; this is the single residency decision.
  const visible: CompetitorObservation[] = [];
  const visibleTraffic: CompetitorObservation[] = [];
  const observations = () => {
    visible.length = 0;
    for (let i = 0; i < rivals.length; i += 1)
      if (rivals[i]!.present && runtime.window.at(rivals[i]!.actor.vehicle.course.s))
        visible.push(rivalObservations[i]!);
    visibleTraffic.length = 0;
    for (const vehicle of traffic)
      if (runtime.window.at(vehicle.vehicle.course.s)) visibleTraffic.push(vehicle.observation);
  };
  const observed: {
    readonly player: CompetitorObservation;
    readonly rivals: readonly CompetitorObservation[];
    /** Traffic observations, separate from the competitors'. */
    readonly traffic: readonly CompetitorObservation[];
    /** The movable objects knocked so far, flying or landed, in the order they were knocked. */
    readonly knocked: readonly KnockedObjectObservation[];
  } = {
    player: playerObservation,
    rivals: visible,
    traffic: visibleTraffic,
    knocked: roadsideObjects.knocked,
  };
  publish();
  // Borrowed fixed-step observation: whether the step recovered the player and whether a wall or course limit pushed it;
  // the camera owner consumes it before the next advance.
  const stepObservation = { recovered: false, barrier: false };
  // One ordered stream per step: every competitor's accepted crossings at their race time.
  const noEvents: readonly RaceEvent[] = Object.freeze([]);
  let events = noEvents;
  const stepEvents: RaceEvent[] = [];

  // The player's driving after its finish: the envelope driver at the Session driver utilization, in the lane nearest
  // the position it finished at, planning a stop at its runout distance past the finish, within any Route terminal. A
  // Session without an envelope holds the brake instead.
  const takeoverDriver = playerEntry!.envelope ? options.session.driverOf(playerEntry!.envelope) : null;
  const takeoverWorkspace = createEnvelopeDriverWorkspace();
  const takeoverIntent: LaneIntent = { lane: 0, at: 0, exit: () => 0 };
  const takeoverDomain = { start: 0, end: 0, terminal: null as number | null };
  let stopS = Infinity;
  const takeOver = () => {
    const { s, l } = player.actor.vehicle.course;
    takeoverIntent.lane = forks.intentLane(s, l, takeoverIntent.exit);
    takeoverIntent.at = s;
    if (!takeoverDriver) return;
    stopS = s + takeoverDriver.envelope.maximumSpeed ** 2 / (2 * takeoverDriver.braking);
    // The takeover drives the player's vehicle as a driver does, seen through the player's sighting.
    player.body.driving = {
      driver: takeoverDriver,
      intent: takeoverIntent,
      workspace: takeoverWorkspace,
      target: (station: number) => forks.targetL(station, takeoverIntent),
    };
  };
  // Before GOAL the player's Session driver drives the player when the composition asks (an advance without input), as
  // the takeover does after GOAL, toward the composition's target exits from the lane nearest the player at the time.
  const playerIntent: LaneIntent = { lane: 0, at: 0, exit: options.playerExit ?? (() => 0) };
  const playerWorkspace = createEnvelopeDriverWorkspace();
  const handOver = (driven: boolean) => {
    if (outcome.status === 'GOAL') return;
    if (!driven) {
      player.body.driving = null;
      return;
    }
    if (!takeoverDriver) throw new RangeError('A Session without an envelope has no player driver');
    if (player.body.driving) return;
    const { s, l } = player.actor.vehicle.course;
    playerIntent.lane = forks.intentLane(s, l, playerIntent.exit);
    playerIntent.at = s;
    player.body.driving = {
      driver: takeoverDriver,
      intent: playerIntent,
      workspace: playerWorkspace,
      target: (station: number) => forks.targetL(station, playerIntent),
    };
  };
  const holdBrake: DrivingInput = Object.freeze({ steering: 0, throttle: false, brake: true });
  // The player's input this step: its own, or its driver's. After GOAL the takeover drives the player and its input no
  // longer reaches the vehicle; after GAME OVER the throttle is released and the steering and brake still apply.
  const playerInputOf = (input: DrivingInput | null, running: boolean): DrivingInput => {
    if (running) return input ?? laneDriving.drive(player.body);
    if (outcome.status === 'GAME_OVER') return { ...(input ?? laneDriving.drive(player.body)), throttle: false };
    if (!takeoverDriver) return holdBrake;
    return laneDriving.drive(player.body, drivingDomainBefore(runtime.window, stopS, takeoverDomain));
  };
  /**
   * Moves the present field one step: the player by `input`, each rival by its driver, then fork observation and Route
   * loading. A running step (`stepStart` set) also paces paced rivals; after the run ends they hold their pace.
   */
  const driveField = (input: DrivingInput | null, stepStart: number | null) => {
    // Drivers see the present vehicles as they stand at the step's start.
    laneDriving.observe();
    const playerInput = playerInputOf(input, stepStart !== null);
    let minS = Infinity,
      maxS = -Infinity;
    for (const body of activeBodies) {
      minS = Math.min(minS, body.vehicle.course.s);
      maxS = Math.max(maxS, body.vehicle.course.s);
    }
    runtime.refresh(minS, maxS);
    // Contact forces come from the state at the step's start and hold through it.
    contactFaces.beginStep();
    bodyContacts(bodies);
    barrierContacts(bodies, (body) => {
      if (body === player.body) stepObservation.barrier = true;
    });
    roadsideObjects.contacts(bodies);
    // A vehicle a fixed object holds may recover; the step's recovery reads it.
    for (const body of bodies) body.step.blocked = roadsideObjects.blocks(body.id);
    move(activeBodies[0]!, playerInput);
    for (let i = 1; i < active.length; i += 1) {
      const { body, pacing } = active[i]!;
      if (pacing && stepStart !== null) {
        pacing.pace.update(body.vehicle.course.s, stepStart);
        pacing.set(pacing.pace.utilization, pacing.pace.speedFraction * body.driving!.driver.envelope.maximumSpeed);
      }
      move(body, laneDriving.drive(body));
    }
    // Traffic drives as rivals do; it never selects a route, and recovery keeps it legal like any vehicle.
    trafficField.advance();
    roadsideObjects.advance();
    forks.observe(activeBodies);
    for (const body of activeBodies) {
      minS = Math.min(minS, body.vehicle.course.s);
      maxS = Math.max(maxS, body.vehicle.course.s);
      // After the run ends, progress, events, presence and the clock hold; recovery still keeps the field legal.
      if (stepStart === null) body.recovered = legalRecovery(body) || body.recovered;
    }
    runtime.refresh(minS, maxS);
    if (trafficField.update()) refreshBodies();
  };

  const step = (input: DrivingInput | null) => {
    if (startPhase.status === 'WAITING') return;
    if (startPhase.status === 'READY') {
      holdReady(input ?? idle);
      return;
    }
    handOver(input === null);
    if (outcome.status !== 'RUNNING') {
      driveField(input, null);
      stepObservation.recovered = player.body.recovered;
      return;
    }
    const stepStart = clock.beginStep();
    driveField(input, stepStart);
    stepEvents.length = 0;
    let playerFinishSeconds: number | null = null;
    for (const c of active) {
      const { body } = c;
      body.recovered = legalRecovery(body) || body.recovered;
      const update = c.observer.update(
        body.previous,
        body.vehicle.course,
        body.recovered,
        // The clock decides the player's crossing candidates, in time order, against its deadline.
        c === player ? clock.admit : undefined,
      );
      for (const event of update.events) {
        const timeSeconds = raceEventSeconds(stepStart, event.u);
        c.crossingSeconds.push(timeSeconds);
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
        c.finishGateId = stepEvents.at(-1)!.landmark.id;
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
    // Race time stops at the ending: the clock's time is then the ending's, the one record of it.
    clock.completeStep(ending?.seconds ?? clock.stepEndSeconds);
    if (ending) {
      outcome.end(ending.end);
      if (ending.end.status === 'GOAL') takeOver();
    }
    stepObservation.recovered = player.body.recovered;
  };

  return Object.freeze({
    player,
    rivals,
    /**
     * The traffic present, in order of appearance: no competitor, so no rank, route choice, progress, events or records.
     */
    traffic: traffic as readonly {
      readonly id: string;
      readonly vehicle: VehicleState;
      readonly step: { readonly state: RecoveryState };
    }[],
    clock,
    /**
     * Seconds of every fixed step advanced so far, READY and after the ending included: the time base of displays
     * timed across the ending, such as a shift's.
     */
    get simulationSeconds() {
      return simulationSeconds;
    },
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
     * The course route the Route is taking, as reference runs and records name routes (its Link IDs in canonical
     * order; empty on a CIRCUIT): the one enumerated route that holds every Link the Route has appended. Null while
     * more than one still does.
     */
    get routeLinks(): readonly string[] | null {
      const taken = runtime.route.occurrences.flatMap((occurrence) =>
        occurrence.incoming ? [occurrence.incoming] : [],
      );
      const matching = routes.filter(
        (route) => course.type === 'CIRCUIT' || taken.every((link, i) => route[i] === link),
      );
      return matching.length === 1 ? matching[0]!.map((link) => link.id) : null;
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
      /**
       * The race time of the GOAL or GAME OVER, where the race clock stopped; null before. At GOAL it is the player's
       * finish crossing. The field keeps driving after it.
       */
      get endSeconds(): number | null {
        return startPhase.status !== 'GO' || outcome.status === 'RUNNING' ? null : clock.elapsedSeconds;
      },
    }),
    /** The last step's accepted crossings of every competitor, in race-time order. */
    get events() {
      return events;
    },
    start: () => startPhase.begin(),
    forks,
    /**
     * One fixed step of SIM_DT; the race takes no step length. `input` is the player's; null hands the player to its
     * Session driver for the step (the player's own input resumes when one is given).
     */
    advance(input: DrivingInput | null) {
      stepObservation.recovered = false;
      stepObservation.barrier = false;
      events = noEvents;
      player.body.step.input = input ?? idle;
      step(input);
      simulationSeconds += SIM_DT;
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
        place: player.body.step.place,
      });
      legalRecovery(player.body);
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
