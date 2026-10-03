import type { ResolvedCourseSession, SessionEntry } from './course-session.js';
import { createCheckpointClock, raceEventSeconds } from './checkpoint-clock.js';
import { rankRaceProgress } from './race-ranking.js';
import { enumerateCourseRoutes } from '../course/compiler/course-routes.js';
import { createRankLimitJudge, createRunOutcome, type RunStatus } from './run-outcome.js';
import { createRouteProgress, type RouteRaceEvent } from './route-progress.js';
import { createRouteCrossSections } from './route-cross-sections.js';
import { createCourseForkField } from './course-fork-field.js';
import { rivalExit } from './rival-exit.js';
import {
  createRecoveryState,
  advanceVehicleWithRecovery,
  recoverVehicle,
  recoverVehicleToPlanCoordinate,
  RECOVERY_POLICY,
  type RecoveryState,
  type RecoveryTarget,
} from './recovery.js';
import { createBodyContacts, footprintsOverlap, type RouteFootprint } from './body-contacts.js';
import { createLaneFollowing, type LaneIntent, type VehicleSighting } from './lane-following.js';
import { createTrafficPositions, trafficDraw } from './traffic.js';
import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import { createRivalPace } from './rival-pace.js';
import {
  createEnvelopeDriverWorkspace,
  createVariableEnvelopeDriver,
  envelopeTargetSpeed,
  plannedEnvelopeSpeed,
  sampleEnvelopeDrivingInput,
  type EnvelopeDriver,
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
/** A present vehicle as contacts and placement read it: its live state and model. */
interface Body {
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
}
/** One traffic vehicle: its mechanics, recovery and driver, its sighting and contact force, and its observation. */
interface TrafficMotion extends Body {
  readonly id: string;
  readonly intent: LaneIntent;
  readonly driver: EnvelopeDriver;
  readonly driverWorkspace: ReturnType<typeof createEnvelopeDriverWorkspace>;
  input: (s: number) => number;
  readonly contactForce: { x: number; y: number; z: number };
  readonly sighting: { s: number; l: number; length: number; width: number; speed: number };
  readonly step: {
    readonly state: RecoveryState;
    input: DrivingInput;
    readonly place: (s: number) => RecoveryTarget;
    readonly externalForce: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly observation: CompetitorObservation;
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
  // A rival's intent drives it; the player's input comes from its composition, so it has no intent here.
  const competitor = (id: string, actor: Actor, intent: LaneIntent | null, stages: SessionEntry['stages']) => ({
    id,
    actor,
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
    recoveryLane: (s: number) => forks.recoveryL(s, intent),
    observer: createRouteProgress(lines, actor.vehicle.course),
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
  const player = competitor(playerEntry!.id, playerActor, null, null);
  // An ahead appearance must lie within the Route the runtime keeps loaded ahead of the player.
  for (const entry of rivalEntries)
    if (entry.ahead && entry.ahead.distance > runtime.coverage.forwardMeters - runtime.coverage.maximumStepMeters)
      throw new RangeError(`${entry.id}: an ahead appearance beyond the loaded Route`);
  // ARCADE rank limits judge the player against every other competitor's crossings.
  const judge = createRankLimitJudge(rankLimits, player.id);
  const rivalDriving = rivalEntries.map(drivingOf);
  const rivals = rivalEntries.map((entry, rivalIndex) => {
    // A grid rival starts in the lane nearest its slot; an ahead entry names its lane.
    const lane = entry.slot ? forks.intentLane(entry.slot.at.s, entry.slot.l) : entry.ahead!.lane;
    // The race assigns each rival's target exits from the Session seed; its grid side implies none.
    const intent: LaneIntent = {
      lane,
      exit: (occurrence) =>
        rivalExit(configuration.seed, rivalIndex, occurrence.ordinal, occurrence.section.fork!.exits.length),
    };
    // Until it appears, an ahead entry's actor waits unmoved at the player's slot; nothing reads it.
    const at = entry.slot ?? playerSlot;
    return competitor(entry.id, spawn(entry, { s: at.at.s, l: at.l, initialSpeed }), intent, entry.stages);
  });
  const resync = (c: typeof player) => c.observer.resync(c.actor.vehicle.course);
  const competitors = [player, ...rivals];
  const motions = competitors.map((c, index) => {
    /** The body contacts' force on this competitor through the current step (N, world). */
    const contactForce = { x: 0, y: 0, z: 0 };
    const motion = {
      c,
      id: c.id,
      index,
      /** A rival's envelope driver, with its pace and utilization/speed-cap setter when paced; null for the player. */
      driving: index === 0 ? null : rivalDriving[index - 1]!,
      previous: { s: 0, l: 0 },
      current: c.actor.vehicle,
      recovered: false,
      driverWorkspace: createEnvelopeDriverWorkspace(),
      contactForce,
      get vehicle() {
        return c.actor.vehicle;
      },
      get model() {
        return c.actor.model;
      },
      step: {
        state: c.actor.recovery,
        input: { steering: 0, throttle: false, brake: false } as DrivingInput,
        place: (s: number) => vacantPlace(motion, s, c.recoveryLane),
        externalForce: contactForce,
      },
      /** The driver's target lateral; a new function whenever its lane changes, since the driver caches by lane. */
      input: (s: number) => forks.targetL(s, c.intent!),
      /** How the drivers see this competitor; the race writes it at the start of every moving step. */
      sighting: { s: 0, l: 0, length: 0, width: 0, speed: 0 },
    };
    return motion;
  });
  // The competitors present in the Session, the player first, in competitor order.
  let active = motions.filter((motion) => motion.c.present);
  // The traffic present, in order of appearance.
  const traffic: TrafficMotion[] = [];
  // Every vehicle present: the present competitors, then the traffic. Contacts, sightings and placement read it.
  const bodies: (Body & {
    readonly sighting: VehicleSighting;
    readonly contactForce: { x: number; y: number; z: number };
  })[] = [];
  const refreshBodies = () => {
    bodies.length = 0;
    bodies.push(...active, ...traffic);
  };
  refreshBodies();
  // Drivers follow and change lanes over the race's sightings of the present vehicles.
  const follow = createLaneFollowing(forks);
  const sightings: VehicleSighting[] = [];
  // Body contacts push present competitors apart; the Session's driving definition holds the spring-damper.
  const bodyContacts = createBodyContacts(runtime.readers.coordinates, playerActor.model.bodyContact);
  const footprint = (model: VehicleModel, s: number, l: number): RouteFootprint => ({
    s,
    l,
    length: model.compiledVehicle.overallLength,
    width: model.compiledVehicle.overallWidth,
  });
  // The present vehicle, other than `self`, that a footprint of `model` at (s, l) would overlap; null when it is free.
  const occupant = (model: VehicleModel, s: number, l: number, self: VehicleState | null = null): Body | null => {
    const at = footprint(model, s, l);
    for (const body of bodies)
      if (
        body.vehicle !== self &&
        footprintsOverlap(at, footprint(body.model, body.vehicle.course.s, body.vehicle.course.l))
      )
        return body;
    return null;
  };
  // Recovery places no vehicle on another's footprint: from station s it backs along the Route behind each vehicle in
  // the way, by the policy's clearance, until the place in its lane there is free (or the resident Route begins).
  const vacantPlace = (self: Body, s: number, lane: (s: number) => number, l = lane(s)): RecoveryTarget => {
    for (
      let other = occupant(self.model, s, l, self.vehicle);
      other && s > runtime.window.start;
      other = occupant(self.model, s, l, self.vehicle)
    ) {
      const behind =
        other.vehicle.course.s -
        (self.model.compiledVehicle.overallLength + other.model.compiledVehicle.overallLength) / 2 -
        RECOVERY_POLICY.placementClearance;
      s = Math.max(runtime.window.start, behind);
      l = lane(s);
    }
    return { s, l };
  };
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
      // An appearance on another vehicle's footprint waits for a later step.
      if (occupant(c.actor.model, s, lane(s))) continue;
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
    if (appeared) {
      active = motions.filter((motion) => motion.c.present);
      refreshBodies();
    }
  };
  const depart = () => {
    let departed = false;
    for (const motion of active) {
      const { c } = motion;
      if (c.stages === null || playerGates < c.stages.last || !outOfView(c.actor.vehicle.course.s)) continue;
      c.present = false;
      departed = true;
    }
    if (departed) {
      active = active.filter((motion) => motion.c.present);
      refreshBodies();
    }
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
  const legalRecovery = (body: Body & { readonly step: { readonly state: RecoveryState } }) => {
    const target = forks.legalTarget(body.vehicle.course.s, body.vehicle.course.l);
    if (!target) return false;
    recoverVehicleToPlanCoordinate(runtime.readers, body.vehicle, body.model, {
      state: body.step.state,
      reason: 'wrong-course',
      // Behind a vehicle in the way, the selected road's centre.
      target: vacantPlace(body, target.s, (s) => forks.recoveryL(s, null), target.l),
    });
    return true;
  };
  // A driver's input this step: it follows or changes lane over the sightings, then drives its lane, a new lane
  // function after a change since the driver caches by lane.
  const drive = (
    driven: Body & {
      readonly sighting: VehicleSighting;
      readonly driverWorkspace: ReturnType<typeof createEnvelopeDriverWorkspace>;
      input: (s: number) => number;
    },
    intent: LaneIntent,
    driver: EnvelopeDriver,
  ): DrivingInput => {
    const lane = intent.lane;
    const speedLimit = follow(
      intent,
      driven.sighting,
      envelopeTargetSpeed(
        runtime.readers.coordinates,
        driven.vehicle,
        driver,
        driven.input,
        driven.driverWorkspace,
        runtime.window,
      ),
      sightings,
    );
    if (intent.lane !== lane) driven.input = (s: number) => forks.targetL(s, intent);
    return sampleEnvelopeDrivingInput(
      runtime.readers.coordinates,
      driven.vehicle,
      driver,
      driven.input,
      driven.driverWorkspace,
      runtime.window,
      speedLimit,
    );
  };
  // Traffic appears at its positions as the appearance line, the farthest rendered station ahead of the player,
  // reaches them, at most `trafficLimit` at once, and leaves once out of view.
  const appearanceLine = () => player.actor.vehicle.course.s - view.cameraDistance + view.far;
  const trafficPositions =
    options.session.traffic && createTrafficPositions(options.session.traffic, configuration.seed, appearanceLine());
  const trafficLimit = Math.min(SESSION_RULE_LIMITS.traffic, SESSION_RULE_LIMITS.vehicles - competitors.length);
  const updateTraffic = () => {
    if (!trafficPositions) return;
    const before = traffic.length;
    for (let i = traffic.length - 1; i >= 0; i -= 1) if (outOfView(traffic[i]!.vehicle.course.s)) traffic.splice(i, 1);
    let changed = traffic.length !== before;
    const { seed } = configuration;
    const { candidates } = options.session.traffic!;
    trafficPositions.pass(appearanceLine(), (position, s) => {
      // A position passes unused when the traffic is full, the Route does not reach it yet or its place is occupied.
      if (traffic.length >= trafficLimit || !runtime.window.at(s)) return;
      const candidate = candidates[trafficDraw(seed, 'vehicle', position, candidates.length)]!;
      const model = modelOf(candidate.vehicle);
      const intent: LaneIntent = {
        lane: 0,
        exit: (occurrence) =>
          trafficDraw(seed, 'exit', position, occurrence.section.fork!.exits.length, occurrence.ordinal),
      };
      intent.lane = trafficDraw(seed, 'lane', position, forks.targetCarriageway(s, intent.exit).road.lanes);
      const lane = (station: number) => forks.targetL(station, intent);
      const l = lane(s);
      if (occupant(model, s, l)) return;
      const speed = plannedEnvelopeSpeed(runtime.readers.coordinates, s, candidate.driver, lane, runtime.window);
      const vehicle = createVehicle(model, runtime.readers, { s, l, initialSpeed: speed });
      const contactForce = { x: 0, y: 0, z: 0 };
      const id = `TRAFFIC_${String(position + 1).padStart(4, '0')}`;
      const color = candidate.colors[trafficDraw(seed, 'color', position, candidate.colors.length)]!;
      const motion: TrafficMotion = {
        id,
        vehicle,
        model,
        intent,
        driver: candidate.driver,
        driverWorkspace: createEnvelopeDriverWorkspace(),
        input: lane,
        contactForce,
        sighting: { s: 0, l: 0, length: 0, width: 0, speed: 0 },
        step: {
          state: createRecoveryState(vehicle),
          input: idle,
          place: (station: number) => vacantPlace(motion, station, (at) => forks.recoveryL(at, intent)),
          externalForce: contactForce,
        },
        observation: createCompetitorObservation(
          id,
          candidate.vehicle.vehicleDefinition.compiledVehicle.id,
          color,
          candidate.vehicle.vehicleDefinition.form,
        ),
      };
      traffic.push(motion);
      writeCompetitorObservation(motion.observation, vehicle, model, idle, simulationSeconds);
      changed = true;
    });
    if (changed) refreshBodies();
  };
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
    for (let i = 0; i < motions.length; i += 1) {
      const motion = motions[i]!;
      writeCompetitorObservation(
        competitorObservations[i]!,
        motion.c.actor.vehicle,
        motion.c.actor.model,
        motion.step.input,
        simulationSeconds,
      );
    }
    for (const motion of traffic)
      writeCompetitorObservation(
        motion.observation,
        motion.vehicle,
        motion.model,
        motion.step.input,
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
    for (const motion of traffic)
      if (runtime.window.at(motion.vehicle.course.s)) visibleTraffic.push(motion.observation);
  };
  const observed: {
    readonly player: CompetitorObservation;
    readonly rivals: readonly CompetitorObservation[];
    /** Traffic observations, separate from the competitors'. */
    readonly traffic: readonly CompetitorObservation[];
  } = {
    player: playerObservation,
    rivals: visible,
    traffic: visibleTraffic,
  };
  publish();
  // Borrowed fixed-step observation; the camera owner consumes it before the next advance.
  const stepObservation = { recovered: false };
  // One ordered stream per step: every competitor's accepted crossings at their race time.
  const noEvents: readonly RaceEvent[] = Object.freeze([]);
  let events = noEvents;
  const stepEvents: RaceEvent[] = [];

  // The player's driving after its finish: the envelope driver at the Session driver utilization, in the lane nearest
  // the position it finished at, planning a stop at its runout distance past the finish, within any Route terminal. A
  // Session without an envelope holds the brake instead.
  const takeoverDriver = playerEntry!.envelope ? options.session.driverOf(playerEntry!.envelope) : null;
  const takeoverWorkspace = createEnvelopeDriverWorkspace();
  const takeoverIntent: LaneIntent = { lane: 0, exit: () => 0 };
  let takeoverLane = (s: number) => forks.targetL(s, takeoverIntent);
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
    const lane = takeoverIntent.lane;
    const speedLimit = follow(
      takeoverIntent,
      active[0]!.sighting,
      envelopeTargetSpeed(
        runtime.readers.coordinates,
        player.actor.vehicle,
        takeoverDriver,
        takeoverLane,
        takeoverWorkspace,
        takeoverDomain,
      ),
      sightings,
    );
    if (takeoverIntent.lane !== lane) takeoverLane = (s: number) => forks.targetL(s, takeoverIntent);
    return sampleEnvelopeDrivingInput(
      runtime.readers.coordinates,
      player.actor.vehicle,
      takeoverDriver,
      takeoverLane,
      takeoverWorkspace,
      takeoverDomain,
      speedLimit,
    );
  };
  /**
   * Moves the present field one step: the player by `input`, each rival by its driver, then fork observation and Route
   * loading. A running step (`stepStart` set) also paces paced rivals; after the run ends they hold their pace.
   */
  const driveField = (input: DrivingInput, stepStart: number | null) => {
    // Drivers see the present vehicles as they stand at the step's start.
    sightings.length = 0;
    for (const motion of bodies) {
      const { vehicle, model } = motion;
      Object.assign(motion.sighting, {
        s: vehicle.course.s,
        l: vehicle.course.l,
        length: model.compiledVehicle.overallLength,
        width: model.compiledVehicle.overallWidth,
        speed: Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed),
      });
      sightings.push(motion.sighting);
    }
    const playerInput = stepStart === null ? afterRunInput(input) : input;
    let minS = Infinity,
      maxS = -Infinity;
    for (const motion of active) {
      minS = Math.min(minS, motion.c.actor.vehicle.course.s);
      maxS = Math.max(maxS, motion.c.actor.vehicle.course.s);
    }
    runtime.refresh(minS, maxS);
    // Contact forces come from the state at the step's start and hold through it.
    bodyContacts(bodies);
    move(active[0]!, playerInput);
    for (let i = 1; i < active.length; i += 1) {
      const motion = active[i]!;
      const driving = motion.driving!;
      if (driving.pace && stepStart !== null) {
        driving.pace.update(motion.c.actor.vehicle.course.s, stepStart);
        driving.set(driving.pace.utilization, driving.pace.speedFraction * driving.driver.envelope.maximumSpeed);
      }
      move(motion, drive(motion, motion.c.intent!, driving.driver));
    }
    // Traffic drives as rivals do; it never selects a route, and recovery keeps it legal like any vehicle.
    for (const motion of traffic) {
      motion.step.input = drive(motion, motion.intent, motion.driver);
      advanceVehicleWithRecovery(runtime.readers, motion.vehicle, motion.model, motion.step);
      legalRecovery(motion);
    }
    forks.observe(active);
    for (const motion of active) {
      minS = Math.min(minS, motion.c.actor.vehicle.course.s);
      maxS = Math.max(maxS, motion.c.actor.vehicle.course.s);
      // After the run ends, progress, events, presence and the clock hold; recovery still keeps the field legal.
      if (stepStart === null) motion.recovered = legalRecovery(motion) || motion.recovered;
    }
    runtime.refresh(minS, maxS);
    updateTraffic();
  };

  const step = (input: DrivingInput) => {
    if (startPhase.status === 'WAITING') return;
    if (startPhase.status === 'READY') {
      holdReady(input);
      return;
    }
    if (outcome.status !== 'RUNNING') {
      driveField(input, null);
      stepObservation.recovered = active[0]!.recovered;
      return;
    }
    const stepStart = clock.beginStep();
    driveField(input, stepStart);
    stepEvents.length = 0;
    let playerFinishSeconds: number | null = null;
    for (const motion of active) {
      const { c } = motion;
      motion.recovered = legalRecovery(motion) || motion.recovered;
      const update = c.observer.update(
        motion.previous,
        c.actor.vehicle.course,
        motion.recovered,
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
    stepObservation.recovered = active[0]!.recovered;
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
    /** One fixed step of SIM_DT; the race takes no step length. */
    advance(input: DrivingInput) {
      stepObservation.recovered = false;
      events = noEvents;
      motions[0]!.step.input = input;
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
        place: motions[0]!.step.place,
      });
      legalRecovery(motions[0]!);
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
