import type { RunSetup, RunEntry } from './run-setup.js';
import { createCheckpointClock, raceEventSeconds } from './checkpoint-clock.js';
import { rankRaceProgress } from './race-ranking.js';
import { enumerateCourseRoutes } from '../course/compiler/course-routes.js';
import { createRankLimitJudge, createRunOutcome, type RunStatus } from './run-outcome.js';
import { createRouteProgress, type RouteRaceEvent } from './route-progress.js';
import { createRouteCrossSections } from './route-cross-sections.js';
import { createCourseForkField, LINE } from './course-fork-field.js';
import { rivalExit } from './rival-exit.js';
import { createRecoveryState, recoverVehicle, type RecoveryState } from './recovery.js';
import { createBodyContacts, createContactFaces } from './body-contacts.js';
import { createContactLog, type PlayerContacts } from './contact-log.js';
import type { LaneIntent, PathOffset } from './lane-following.js';
import { createTrafficField, type TrafficMotion } from './traffic.js';
import { createVehiclePlacement } from './vehicle-placement.js';
import { createLaneDriving } from './lane-driving.js';
import { createSlowDown, type SlowDownUtilizations } from './slow-down.js';
import {
  advancePresentVehicle,
  createPresentVehicle,
  type PresentVehicle,
  type VehicleActor,
  type VehicleDriving,
} from './present-vehicle.js';
import { RUN_RULE_LIMITS } from '../course/run-rules.js';
import { createRivalPace } from './rival-pace.js';
import {
  createPlannedDriverWorkspace,
  createVariablePlannedDriver,
  drivingDomainBefore,
  resetPlannedDriving,
} from './planned-driver.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import { createVehicle, updateVehicle, type VehicleState } from '../vehicle/physics/vehicle-physics.js';
import { createStartPhase, type StartStatus } from './start-phase.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { DriverSteering } from '../vehicle/physics/vehicle-calibration.js';
import { driverSteering, type SteeringRule } from '../vehicle/steering-rule.js';
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

/**
 * One accepted crossing: its competitor, line and its kind (a checkpoint or the finish line, which a CIRCUIT's laps
 * cross), the race time (step start + u × SIM_DT), whether it finished the competitor's race, and the clock extension
 * it earned in ms (the player's checkpoints with a time limit; null otherwise).
 */
export interface RaceEvent {
  readonly competitorId: string;
  readonly landmark: RouteRaceEvent['landmark'];
  readonly kind: RouteRaceEvent['kind'];
  readonly lap: number;
  readonly finish: boolean;
  readonly timeSeconds: number;
  readonly extensionMs: number | null;
}

/** A paced rival's pace and the setter of its driver's utilization and speed cap, a fraction of its vehicle's. */
interface RivalPacing {
  readonly pace: ReturnType<typeof createRivalPace>;
  readonly set: (utilization: number, speedFraction: number) => void;
}

/**
 * Field composition over shared course readers, ordinary mechanics and ordered physical gates. The race
 * builds every competitor's mechanics, the player's included, from its run entry's vehicle and each
 * rival's driver from its entry's vehicle; callers supply the player's input only.
 */
export function createCourseRace(options: {
  readonly setup: RunSetup;
  readonly runtime: RouteRuntime;
  /** The target exit at each fork occurrence of the player's run driver, which drives the player on request. */
  readonly playerExit?: (occurrence: RouteOccurrence) => number;
  /**
   * The steering rule the player drives by while the player's own input reaches its vehicle; the default rule when
   * absent. A driver, the player's run driver included, drives by its own rule.
   */
  readonly playerSteering?: SteeringRule;
  /** The player's SLOW DOWN stages' utilizations; the owner's (`SLOW_DOWN.utilizations`) when absent. */
  readonly slowDownUtilizations?: SlowDownUtilizations;
}) {
  const { course, configuration, budgets, entries, rankLimits, paceSchedule } = options.setup;
  const { initialSpeed } = configuration;
  const { runtime } = options;
  // Entries sharing a vehicle share its model, which the run built, and unpaced entries sharing a vehicle share its
  // fixed driver. Every planned driver steers by `PLANNED_DRIVER.steering`; the player's own input by its own rule
  // (`playerSteering`), else by the default rule, resolved once on each model's vehicle.
  const defaultSteerings = new Map<VehicleModel, Readonly<DriverSteering>>();
  const modelOf = (vehicle: RunEntry['vehicle']) => {
    const { model } = options.setup.mechanicsOf(vehicle);
    if (!defaultSteerings.has(model))
      defaultSteerings.set(model, driverSteering(vehicle.drivingDefinition.compiledDriving.defaultSteering, model));
    return model;
  };
  const defaultSteering = (model: VehicleModel) => defaultSteerings.get(model)!;
  const steeringOf = (body: PresentVehicle) => body.driving?.driver.steering ?? defaultSteering(body.model);
  // An entry with a pace ratio drives its own driver at the utilization and speed cap its pace sets; the others share
  // their vehicle's fixed driver, which the run compiled.
  const drivingOf = (entry: RunEntry) => {
    if (entry.pace === null) return { driver: options.setup.driverOf(entry.vehicle), pace: null, set: null };
    if (!paceSchedule) throw new Error('a paced rival requires the pace schedule');
    const pace = createRivalPace(
      runtime.route,
      paceSchedule,
      entry.pace,
      entry.vehicle.drivingDefinition.compiledDriving.rivalPace,
      SIM_DT,
    );
    const { model, limits, speedCap } = options.setup.mechanicsOf(entry.vehicle);
    const variable = createVariablePlannedDriver(model, limits, pace.utilization, pace.speedFraction * speedCap, true);
    const set = (utilization: number, speedFraction: number) => variable.set(utilization, speedFraction * speedCap);
    return { driver: variable.driver, pace, set };
  };
  const clock = createCheckpointClock(budgets);
  const outcome = createRunOutcome();
  const startPhase = createStartPhase();
  const lines = createRouteCrossSections(runtime.route, course, configuration.lapCount);
  // The course's routes as reference runs name them: each its Links in canonical order; a circuit's is empty.
  const routes = enumerateCourseRoutes(course.entry, course.type);
  // The fork field is the fork decider: the only holder of the Route's selection authority. A choice changes what every
  // driver's path returns beyond the fork, so each present driver takes a new path function, as on a change of lane:
  // its plan caches by path.
  const forks = createCourseForkField(
    runtime.route,
    lines,
    (link) => {
      runtime.selectSuccessor(link);
      for (const { driving } of bodies)
        if (driving) {
          const { intent } = driving;
          driving.target = (station: number) => forks.targetL(station, intent);
        }
    },
    options.setup.racingLines,
  );
  // A circuit's lap: its Sections around the cycle from the entry.
  let lapLength: number | null = null;
  if (course.type === 'CIRCUIT') {
    lapLength = 0;
    let section = course.entry;
    do {
      lapLength += section.coordinates.domain.end;
      section = section.outgoing[0]!.to.section;
    } while (section !== course.entry);
  }
  // A driver takes the racing line of its exits at route station s from lateral l, holding l's offset from the line
  // (written to `offset`).
  const lineProbe: LaneIntent = { lane: LINE, at: 0, exit: () => 0 };
  const lineOffset = (): PathOffset => ({ from: 0, to: 0, at: 0, length: 0, alongside: new Map(), passing: null });
  const takeLine = (intent: LaneIntent, s: number, l: number, offset = lineOffset()) => {
    lineProbe.exit = intent.exit;
    const from = l - forks.targetL(s, lineProbe);
    intent.lane = LINE;
    intent.at = s;
    intent.offset = () => from;
    Object.assign(offset, { from, to: from, at: s, length: 0, passing: null });
    offset.alongside.clear();
    return offset;
  };
  // A competitor: its present vehicle (`body`), which the race moves, and its part in the race. A rival's driver drives
  // it, paced when `pacing` is set; the player's input comes from its composition until the takeover after GOAL.
  const competitor = (
    id: string,
    actor: VehicleActor,
    driving: VehicleDriving | null,
    pacing: RivalPacing | null,
    stages: RunEntry['stages'],
  ) => {
    // The race's recovery lane resolver: a rival's lane; the player recovers to the centre of the lane nearest it.
    const recoveryIntent = driving?.intent ?? null;
    const recoveryLane = (s: number) => forks.recoveryL(s, recoveryIntent, body.vehicle.course.l);
    const body = createPresentVehicle(id, actor, driving, defaultSteering(actor.model), (self, s) =>
      vacantPlace(self, s, recoveryLane),
    );
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
       * Whether the competitor is in the run: one that has not yet appeared or has left is never moved, ranked,
       * judged, drawn or voiced.
       */
      present: stages === null || stages.first === 1,
      /** Whether the competitor has entered the run; its leaving is final. */
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
  // Every competitor drives the model of its entry's vehicle, spawned at its grid slot with the run's start speed,
  // or, appearing ahead, where and as fast as it appears.
  const spawn = (entry: RunEntry, at: { s: number; l: number; initialSpeed: number }): VehicleActor => {
    const model = modelOf(entry.vehicle);
    const vehicle = createVehicle(model, runtime.readers, at);
    return { vehicle, model, recovery: createRecoveryState(vehicle) };
  };
  const [playerEntry, ...rivalEntries] = entries;
  const playerSlot = playerEntry!.slot!;
  const playerActor = spawn(playerEntry!, { s: playerSlot.at.s, l: playerSlot.l, initialSpeed });
  const player = competitor(playerEntry!.id, playerActor, null, null, null);
  // SLOW DOWN for the player, planned with its vehicle's mechanics.
  const slowDown = createSlowDown(
    runtime.readers,
    runtime.window,
    options.setup.mechanicsOf(playerEntry!.vehicle),
    options.slowDownUtilizations,
  );
  // The player's own steering rule on its vehicle, resolved once; its driver's rule while a driver drives it.
  const playerOwnSteering = options.playerSteering
    ? driverSteering(options.playerSteering, playerActor.model)
    : defaultSteering(playerActor.model);
  // An ahead appearance must lie within the Route the runtime keeps loaded ahead of the player.
  for (const entry of rivalEntries)
    if (entry.ahead && entry.ahead.distance > runtime.coverage.forwardMeters - runtime.coverage.maximumStepMeters)
      throw new RangeError(`${entry.id}: an ahead appearance beyond the loaded Route`);
  // RACE rank limits judge the player against every other competitor's crossings.
  const judge = createRankLimitJudge(rankLimits, player.id);
  const rivalDriving = rivalEntries.map(drivingOf);
  const rivals = rivalEntries.map((entry, rivalIndex) => {
    // A grid rival takes the racing line from its slot; an ahead entry names its lane.
    // The race assigns each rival's target exits from the run seed; its grid side implies none.
    const exit = (occurrence: RouteOccurrence) =>
      rivalExit(options.setup.seed, rivalIndex, occurrence.ordinal, occurrence.section.fork!.exits.length);
    // An ahead entry's lane is read where it appears; until then nothing reads it.
    const intent: LaneIntent = entry.slot ? { lane: LINE, at: 0, exit } : { lane: entry.ahead!.lane, at: 0, exit };
    // A grid rival takes the racing line from its slot; an ahead entry when it appears, from its lane.
    const offset = entry.slot ? takeLine(intent, entry.slot.at.s, entry.slot.l) : lineOffset();
    // Until it appears, an ahead entry's actor waits unmoved at the player's slot; nothing reads it.
    const at = entry.slot ?? playerSlot;
    const { driver, pace, set } = rivalDriving[rivalIndex]!;
    return competitor(
      entry.id,
      spawn(entry, { s: at.at.s, l: at.l, initialSpeed }),
      {
        driver,
        intent,
        offset,
        workspace: createPlannedDriverWorkspace(),
        target: (s: number) => forks.targetL(s, intent),
      },
      pace ? { pace, set: set! } : null,
      entry.stages,
    );
  });
  const resync = (c: typeof player) => c.observer.resync(c.actor.vehicle.course);
  const competitors = [player, ...rivals];
  // The competitors present in the run, the player first, in competitor order, and their present vehicles.
  let active = competitors.filter((c) => c.present);
  let activeBodies = active.map((c) => c.body);
  // Every vehicle present: the present competitors, then the traffic. Contacts, sightings and placement read it.
  const bodies: PresentVehicle[] = [];
  const refreshBodies = () => {
    activeBodies = active.map((c) => c.body);
    bodies.length = 0;
    bodies.push(...activeBodies, ...traffic);
  };
  // Body contacts push present vehicles apart, by one face rule for every pair (fixed objects included); the run's
  // driving definition holds the spring-damper.
  const contactFaces = createContactFaces(runtime.readers.coordinates, options.setup.bodyContact);
  // The player's contacts of each step, published at its end.
  const contactLog = createContactLog(player.id);
  let playerContacts: PlayerContacts = contactLog.publish();
  const bodyContacts = createBodyContacts(contactFaces, SIM_DT, contactLog);
  // Walls and course limits push every present vehicle back with the same spring-damper.
  const barrierContacts = createBarrierContacts(
    runtime.readers.coordinates,
    runtime.window,
    options.setup.bodyContact,
    contactFaces,
    SIM_DT,
    contactLog,
  );
  // Standing roadside objects push every present vehicle back as a vehicle would; movable ones are knocked away.
  const roadsideObjects = createRoadsideObjects({
    route: runtime.window,
    coordinates: runtime.readers.coordinates,
    height: runtime.readers.height,
    extent: runtime.readers.extent,
    faces: contactFaces,
    step: SIM_DT,
    log: contactLog,
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
    lapLength,
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
      const { intent, driver, offset } = c.body.driving!;
      // Its lane number is a lane of the Section where it appears; it takes the racing line from that lane's centre.
      intent.lane = entry.ahead!.lane;
      intent.offset = undefined;
      intent.at = s;
      takeLine(intent, s, forks.targetL(s, intent), offset!);
      c.body.driving!.target = (station: number) => forks.targetL(station, intent);
      const lane = c.body.driving!.target;
      // An appearance on another vehicle's footprint, or one a vehicle behind could not stop for, waits for a later step.
      if (placement.occupied(c.actor.model, s, lane(s))) continue;
      const speed = laneDriving.appearanceSpeed(c.actor.model, s, intent, driver);
      if (speed === null) continue;
      c.pacing?.pace.join(s);
      c.body.actor = spawn(entry, { s, l: lane(s), initialSpeed: speed });
      // It starts where it appears: it moved from nowhere, so its contacts sweep nothing before it.
      Object.assign(c.body.previous, { s, l: lane(s) });
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
      body.step.steering = body === activeBodies[0] ? playerOwnSteering : steeringOf(body);
      updateVehicle(runtime.readers, body.vehicle, body.model, body.step.input, body.step.steering, true);
    }
    startPhase.advance();
  };
  const move = (body: PresentVehicle, input: DrivingInput, steering = steeringOf(body)) =>
    advancePresentVehicle(runtime.readers, body, input, steering);
  const { legalRecovery } = placement;
  // The traffic field owns traffic appearance, holding and departure; the race supplies what it shares.
  const appearanceLine = () => player.actor.vehicle.course.s - view.cameraDistance + view.far;
  const trafficField = createTrafficField({
    traffic: options.setup.traffic,
    seed: options.setup.seed,
    limit: RUN_RULE_LIMITS.traffic,
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
      vehicle.vehicleDefinition.listing.form,
    ),
  );
  const playerObservation = competitorObservations[0]!,
    rivalObservations = competitorObservations.slice(1);
  const publish = () => {
    for (let i = 0; i < competitors.length; i += 1) {
      const { body } = competitors[i]!;
      writeCompetitorObservation(competitorObservations[i]!, body.vehicle, body.step.input, simulationSeconds);
    }
    for (const vehicle of traffic)
      writeCompetitorObservation(vehicle.observation, vehicle.vehicle, vehicle.step.input, simulationSeconds);
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
  // Borrowed fixed-step observation: whether the step recovered the player and the ids of the vehicles a wall or course
  // limit pushed, each once; the camera owner consumes it before the next advance.
  const pushedIds: string[] = [];
  const stepObservation = { recovered: false, barriers: pushedIds as readonly string[] };
  // One ordered stream per step: every competitor's accepted crossings at their race time.
  const noEvents: readonly RaceEvent[] = Object.freeze([]);
  let events = noEvents;
  const stepEvents: RaceEvent[] = [];
  const candidates: { c: typeof player; crossing: RouteRaceEvent; timeSeconds: number }[] = [];

  // The player's driving after its finish: its vehicle's run driver on the racing line, taken from where the vehicle is
  // at the end of the step it finished in, planning a stop its runout distance past that station, within any Route
  // terminal.
  const takeoverDriver = options.setup.driverOf(playerEntry!.vehicle);
  const takeoverWorkspace = createPlannedDriverWorkspace();
  const takeoverIntent: LaneIntent = { lane: LINE, at: 0, exit: () => 0 };
  const takeoverDomain = { start: 0, end: 0, terminal: null as number | null };
  let stopS = Infinity;
  const takeOver = () => {
    const { s, l } = player.actor.vehicle.course;
    const offset = takeLine(takeoverIntent, s, l);
    stopS = s + takeoverDriver.speedCap ** 2 / (2 * takeoverDriver.braking);
    // The takeover drives the player's vehicle as a driver does, seen through the player's sighting.
    player.body.driving = {
      driver: takeoverDriver,
      intent: takeoverIntent,
      offset,
      workspace: takeoverWorkspace,
      target: (station: number) => forks.targetL(station, takeoverIntent),
    };
  };
  // Before GOAL the player's run driver drives the player when the composition asks (an advance without input), as
  // the takeover does after GOAL, toward the composition's target exits from the lane nearest the player at the time.
  const playerIntent: LaneIntent = { lane: LINE, at: 0, exit: options.playerExit ?? (() => 0) };
  const playerWorkspace = createPlannedDriverWorkspace();
  const handOver = (driven: boolean) => {
    if (outcome.status === 'GOAL') return;
    if (!driven) {
      player.body.driving = null;
      return;
    }
    if (player.body.driving) return;
    const { s, l } = player.actor.vehicle.course;
    const offset = takeLine(playerIntent, s, l);
    // The run driver takes the vehicle over afresh.
    resetPlannedDriving(playerWorkspace);
    player.body.driving = {
      driver: takeoverDriver,
      intent: playerIntent,
      offset,
      workspace: playerWorkspace,
      target: (station: number) => forks.targetL(station, playerIntent),
    };
  };
  // The player's input this step: its own, or its driver's. After GOAL the takeover drives the player and its input no
  // longer reaches the vehicle; after GAME OVER the throttle is released and the steering and brake still apply.
  // The player's steering rule this step: its own while its own input reaches the vehicle (running, or after GAME OVER),
  // else its driver's rule.
  const playerSteeringOf = (input: DrivingInput | null, running: boolean) =>
    input !== null && (running || outcome.status === 'GAME_OVER') ? playerOwnSteering : takeoverDriver.steering;
  const playerInputOf = (input: DrivingInput | null, running: boolean): DrivingInput => {
    if (running) return input ?? laneDriving.drive(player.body);
    if (outcome.status === 'GAME_OVER') return { ...(input ?? laneDriving.drive(player.body)), throttle: false };
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
      if (!pushedIds.includes(body.id)) pushedIds.push(body.id);
    });
    roadsideObjects.contacts(bodies);
    // A vehicle a fixed object holds may recover; the step's recovery reads it.
    for (const body of bodies) body.step.blocked = roadsideObjects.blocks(body.id);
    move(activeBodies[0]!, playerInput, playerSteeringOf(input, stepStart !== null));
    for (let i = 1; i < active.length; i += 1) {
      const { body, pacing } = active[i]!;
      if (pacing && stepStart !== null) {
        pacing.pace.update(body.vehicle.course.s, stepStart);
        pacing.set(pacing.pace.utilization, pacing.pace.speedFraction);
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
      if (stepStart === null) legalRecovery(body);
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
    // The step's crossing candidates of every competitor, in race-time order; a stable sort keeps competitor order
    // (player, then rivals) for equal times, and each competitor's own crossings stay in route order.
    candidates.length = 0;
    for (const c of active) {
      const { body } = c;
      legalRecovery(body);
      for (const crossing of c.observer.crossings(body.previous, body.vehicle.course, body.recovered))
        candidates.push({ c, crossing, timeSeconds: raceEventSeconds(stepStart, crossing.u) });
    }
    candidates.sort((x, y) => x.timeSeconds - y.timeSeconds);
    // The facts are decided in time order up to the earliest ending, and none after it: the player's finish, a rank
    // failure, or expiry. The clock decides the player's candidates against its deadline (one exactly at it is
    // accepted, and a checkpoint's award extends it at once); any other crossing at or after the deadline follows the
    // expiry, so expiry wins an exact tie with a rank failure. The player's own crossing is ordered first among equal
    // times, so it wins an exact tie with either failure.
    stepEvents.length = 0;
    let ending: { seconds: number; end: Parameters<typeof outcome.end>[0] } | null = null;
    for (const { c, crossing, timeSeconds } of candidates) {
      const deadline = clock.deadlineSeconds;
      if (c === player ? !clock.admit(crossing) : deadline !== null && deadline <= timeSeconds) {
        ending = { seconds: deadline!, end: { status: 'GAME_OVER', cause: 'TIME' } };
        break;
      }
      const finished = c.observer.accept();
      c.crossingSeconds.push(timeSeconds);
      const event: RaceEvent = Object.freeze({
        competitorId: c.id,
        landmark: crossing.landmark,
        kind: crossing.kind,
        lap: crossing.lap,
        finish: crossing.finish,
        timeSeconds,
        extensionMs: c === player ? clock.extensionAt(timeSeconds) : null,
      });
      stepEvents.push(event);
      if (course.type === 'CIRCUIT' && crossing.kind === 'finish') {
        if (c.lapStartSeconds !== null) {
          c.lastLapSeconds = timeSeconds - c.lapStartSeconds;
          c.bestLapSeconds = Math.min(c.bestLapSeconds ?? Infinity, c.lastLapSeconds);
        }
        c.lapStartSeconds = timeSeconds;
      }
      if (c === player) playerGates += 1;
      if (finished) c.finishGateId = crossing.landmark.id;
      if (judge.observe([event]) !== null) {
        ending = { seconds: timeSeconds, end: { status: 'GAME_OVER', cause: 'RANK' } };
        break;
      }
      if (finished && c === player) {
        ending = { seconds: timeSeconds, end: { status: 'GOAL' } };
        break;
      }
    }
    const expiry = clock.expirySeconds;
    if (ending === null && expiry !== null) ending = { seconds: expiry, end: { status: 'GAME_OVER', cause: 'TIME' } };
    events = stepEvents.length ? Object.freeze([...stepEvents]) : noEvents;
    // Race time stops at the ending: the clock's time is then the ending's, the one record of it.
    clock.completeStep(ending?.seconds ?? clock.stepEndSeconds);
    if (ending) {
      // Presence holds from the ending: the step's end, after it, makes no departure or appearance.
      outcome.end(ending.end);
      if (ending.end.status === 'GOAL') takeOver();
    } else {
      depart();
      appear();
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
    /**
     * The SLOW DOWN stage (0 when it does not show): while the player's own input drives it in a running run and it is
     * not in flight, the highest stage whose plan along its lateral its speed exceeds half a second ahead, held for a
     * blink period before it falls ([SLOW DOWN](../../docs/browser.md#slow-down)).
     */
    get slowDown() {
      return slowDown.stage;
    },
    /** The player's STAGE: one more than the race gates the player has crossed since GO, across laps. */
    get stage() {
      return playerGates + 1;
    },
    /** The player's LAP on a CIRCUIT: one more than its accepted finishes, at most the run's lap count if any. */
    get lap() {
      return Math.min(configuration.lapCount ?? Infinity, player.progress.acceptedFinishCount + 1);
    },
    /**
     * The player's rank among the competitors present in the run (`rankRaceProgress`) and their count: the one
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
    /**
     * The run's one status (WAITING and READY before GO, then RUNNING, GOAL, GAME_OVER or ENDED) and GAME OVER cause.
     */
    outcome: Object.freeze({
      get status(): RaceStatus {
        return startPhase.status === 'GO' ? outcome.status : startPhase.status;
      },
      get cause() {
        return outcome.cause;
      },
      /**
       * The race time of the GOAL, GAME OVER or ENDED, where the race clock stopped; null before. At GOAL it is the
       * player's finish crossing. The field keeps driving after it.
       */
      get endSeconds(): number | null {
        return startPhase.status !== 'GO' || outcome.status === 'RUNNING' ? null : clock.elapsedSeconds;
      },
    }),
    /** The last step's accepted crossings of every competitor, in race-time order. */
    get events() {
      return events;
    },
    /**
     * The last step's contacts of the player's vehicle: each barrier line pushing it, with its friction's power, and
     * each contact that began, with its counterpart and its damper term's work.
     */
    get playerContacts(): PlayerContacts {
      return playerContacts;
    },
    start: () => startPhase.begin(),
    /**
     * Whether the player can end the run now: a running run without a finish (its run has no lap count), which
     * ends only so.
     */
    get endable(): boolean {
      return configuration.lapCount === null && startPhase.status === 'GO' && outcome.status === 'RUNNING';
    },
    /** The player ends a run without a finish, between steps: ENDED, its race time the clock's now. */
    end() {
      if (!this.endable) throw new Error('Only a running run without a finish is ended by the player');
      outcome.end({ status: 'ENDED' });
    },
    forks,
    /**
     * One fixed step of SIM_DT; the race takes no step length. `input` is the player's; null hands the player to its
     * Run driver for the step (the player's own input resumes when one is given).
     */
    advance(input: DrivingInput | null) {
      stepObservation.recovered = false;
      pushedIds.length = 0;
      events = noEvents;
      player.body.step.input = input ?? idle;
      step(input);
      simulationSeconds += SIM_DT;
      slowDown.update(
        playerActor.vehicle,
        input !== null && startPhase.status === 'GO' && outcome.status === 'RUNNING',
      );
      playerContacts = contactLog.publish();
      publish();
      return stepObservation;
    },
    /**
     * Manual recovery of the player: the ordinary recovery toward its lane, then a legal-road check and a
     * progress baseline reset that award no progress, then a fresh observation.
     */
    recoverPlayer() {
      // With no free place behind it, the request does nothing.
      const recovered = recoverVehicle(runtime.readers, playerActor.vehicle, playerActor.model, {
        state: playerActor.recovery,
        reason: 'manual',
        place: player.body.step.place,
      });
      if (!recovered) return;
      player.body.recovered = true;
      legalRecovery(player.body);
      resync(player);
      publish();
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
    /** The laps to the finish; null for a run without a finish. */
    lapCount: configuration.lapCount,
    /** A competitor's clock: its finish time, else race time. */
    competitorSeconds: (c: typeof player) => c.finishSeconds ?? clock.elapsedSeconds,
  });
}

type CourseRace = ReturnType<typeof createCourseRace>;

/**
 * The race facts displays and sound effects read (the HUD, RESULT and the run's effects): the run's published state,
 * never its controls, mechanics or other competitors' internals.
 */
export type RaceFacts = Pick<
  CourseRace,
  | 'events'
  | 'simulationSeconds'
  | 'slowDown'
  | 'stage'
  | 'lap'
  | 'lapCount'
  | 'courseType'
  | 'standing'
  | 'nextRankLimit'
  | 'stageRivalGap'
  | 'outcome'
> & {
  readonly clock: Pick<CourseRace['clock'], 'elapsedSeconds' | 'deadlineSeconds' | 'lastExtension'>;
  readonly countdown: Pick<CourseRace['countdown'], 'signalLamps'>;
  readonly player: {
    readonly id: string;
    readonly crossingSeconds: readonly number[];
    readonly lapStartSeconds: number | null;
    readonly lastLapSeconds: number | null;
    readonly bestLapSeconds: number | null;
  };
};
