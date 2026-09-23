import type { ResolvedCourseSession } from './course-session.js';
import { createCheckpointClock } from './checkpoint-clock.js';
import { createCourseRaceProgress, type CourseRaceEvent, type CourseRaceAdmission } from './course-race-progress.js';
import { createCourseForkField } from './course-fork-field.js';
import { createCameraRig, type CameraRig, type CameraState } from '../view/camera.js';
import { composePlanarTransforms, invertPlanarTransform } from '../core/planar-transform.js';
import { wrapAngle } from '../core/math.js';
import { advanceRaceSession, createRaceSessionState, rankRaceProgress, formatRaceTime } from './race-session.js';
import {
  RECOVERY_PROFILE,
  createRecoveryState,
  advanceVehicleWithRecovery,
  recoverVehicleToGuideCoordinate,
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
import { createDynamicVehicleCourseSprite } from '../view/dynamic-vehicle-sprite.js';
import { createVehiclePaletteVariant, type SpriteAssets } from '../image/sprite-assets.js';
import type { SessionVehicle } from './session-configuration.js';
import type { CourseSprite } from '../view/course-sprite.js';
import { createRivalRoster } from './rival-roster.js';
import type { createCourseDrivingGraph } from './course-driving-session.js';

type Session = ReturnType<ReturnType<typeof createCourseDrivingGraph>['createSession']>;
interface Actor {
  readonly vehicle: ArcadeVehicleState;
  readonly recovery: RecoveryState;
  readonly cameraRig: CameraRig;
}

/** Field composition over shared course readers, ordinary mechanics and ordered physical gates. */
export function createCourseRace(options: {
  readonly session: ResolvedCourseSession;
  readonly player: Actor;
  readonly playerSession: Session;
  readonly createSession: () => Session;
  readonly rival: SessionVehicle;
  readonly rivalEnvelope?: VehicleEnvelope;
  readonly sprites: SpriteAssets;
}) {
  const { course, configuration, grid, initialSpeed, budgets } = options.session;
  if (configuration.rivalCount && !options.rivalEnvelope)
    throw new RangeError('Rivals require a current vehicle envelope');
  const driver = options.rivalEnvelope
    ? compileEnvelopeDriver(options.rivalEnvelope, options.session.rivalUtilization, options.rivalEnvelope.maximumSpeed)
    : null;
  const clock = createCheckpointClock(budgets?.initialMs ?? null);
  const entryS = course.entry.ports.find((p) => p.kind === 'entry')!.anchor.s;
  const rivalKind = options.rival.kind;
  const progress = createCourseRaceProgress(course, configuration.lapCount);
  const forks = createCourseForkField(course.sections);
  const competitor = (id: string, actor: Actor, session: Session, targetL: number) => ({
    id,
    actor,
    session,
    targetL,
    recoveryProfile: { ...RECOVERY_PROFILE, targetL },
    observer: progress(session, () => actor.vehicle),
    get progress() {
      return this.observer.state;
    },
    timing: createRaceSessionState(),
    finishElapsedSeconds: null as number | null,
  });
  const player = competitor('PLAYER', options.player, options.playerSession, grid[0]!.l);
  const rivals = createRivalRoster(configuration).map(({ actorId, rivalIndex }) => {
    const session = options.createSession();
    const slot = grid[rivalIndex + 1]!;
    const targetL = slot.l;
    const profile = options.rival;
    const vehicle = createArcadeVehicle(profile.profile, session.view.world, {
      s: slot.anchor.s,
      l: targetL,
      initialSpeed,
      torqueProtection: profile.torqueProtection,
      steeringCalibration: profile.steeringCalibration,
      tireFrictionCalibration: profile.tireFrictionCalibration,
    });
    return competitor(
      actorId,
      { vehicle, recovery: createRecoveryState(vehicle), cameraRig: createCameraRig() },
      session,
      targetL,
    );
  });
  const assets = options.sprites;
  const brakingAssets =
    options.rival.profile.id === 'TESTAROSSA'
      ? createVehiclePaletteVariant(assets.car, assets.car.assets[0]![0]!.paletteChoices[1]!)
      : assets[rivalKind];
  const resync = (c: typeof player) => c.observer.resync();
  const lane = (c: typeof player, s: number) => forks.targetL(c.session.history.active.section, s, c.targetL);
  const competitors = [player, ...rivals];
  const motions = competitors.map((c) => ({
    c,
    id: c.id,
    session: c.session,
    previous: { x: 0, z: 0, s: 0 },
    current: c.actor.vehicle,
    recovered: false,
    driverWorkspace: createEnvelopeDriverWorkspace(),
    step: {
      state: c.actor.recovery,
      input: { steering: 0, throttle: false, brake: false } as DrivingInput,
      dt: 0,
      profile: c.recoveryProfile,
    },
    input: (s: number) => lane(c, s),
  }));
  const actorInputs = new Map(motions.map((motion) => [motion.c.id, motion.step]));
  const move = (motion: (typeof motions)[number], input: DrivingInput, dt: number) => {
    const { c, previous } = motion;
    const { actor, session } = c;
    previous.x = actor.vehicle.x;
    previous.z = actor.vehicle.z;
    previous.s = actor.vehicle.course.s;
    motion.current = actor.vehicle;
    c.recoveryProfile.targetL = lane(c, actor.vehicle.course.s);
    motion.step.input = input;
    motion.step.dt = dt;
    let recovered = advanceVehicleWithRecovery(session.view.world, actor.vehicle, motion.step) !== null;
    if (session.history.active.ordinal === 0 && actor.vehicle.course.s < entryS) {
      recoverVehicleToGuideCoordinate(session.view.world, actor.vehicle, {
        state: actor.recovery,
        reason: 'wrong-course',
        target: { s: entryS, l: lane(c, entryS) },
      });
      recovered = true;
    }
    motion.recovered = recovered;
  };
  const legalRecovery = (c: typeof player) => {
    const target = forks.legalTarget(c.session, c.actor.vehicle.course.s, c.actor.vehicle.course.l);
    if (!target) return false;
    recoverVehicleToGuideCoordinate(c.session.view.world, c.actor.vehicle, {
      state: c.actor.recovery,
      reason: 'wrong-course',
      target,
    });
    return true;
  };
  const visible: { id: string; vehicle: ArcadeVehicleState }[] = [];
  const sprites: CourseSprite[] = [];
  const pool = rivals.map((c) => ({
    id: c.id,
    vehicle: { ...c.actor.vehicle, course: { ...c.actor.vehicle.course } },
    playerFrame: player.session.referenceFromFrame,
    rivalFrame: c.session.referenceFromFrame,
    transform: composePlanarTransforms(
      invertPlanarTransform(player.session.referenceFromFrame),
      c.session.referenceFromFrame,
    ),
  }));
  const observations = () => {
    visible.length = 0;
    for (let i = 0; i < rivals.length; i += 1) {
      const c = rivals[i]!;
      const vehicle = c.actor.vehicle;
      const s = vehicle.course.s + c.session.referenceSOffset - player.session.referenceSOffset;
      if (s < player.session.view.range.start || s > player.session.view.range.end) continue;
      const observation = pool[i]!;
      if (
        observation.playerFrame !== player.session.referenceFromFrame ||
        observation.rivalFrame !== c.session.referenceFromFrame
      ) {
        observation.playerFrame = player.session.referenceFromFrame;
        observation.rivalFrame = c.session.referenceFromFrame;
        observation.transform = composePlanarTransforms(
          invertPlanarTransform(observation.playerFrame),
          observation.rivalFrame,
        );
      }
      const transform = observation.transform;
      const coordinate = observation.vehicle.course;
      Object.assign(observation.vehicle, vehicle);
      observation.vehicle.x = transform.cosine * vehicle.x + transform.sine * vehicle.z + transform.translation.x;
      observation.vehicle.z = -transform.sine * vehicle.x + transform.cosine * vehicle.z + transform.translation.z;
      coordinate.s = s;
      coordinate.l = vehicle.course.l;
      coordinate.segmentIndex = vehicle.course.segmentIndex;
      coordinate.distanceSquared = vehicle.course.distanceSquared;
      observation.vehicle.course = coordinate;
      observation.vehicle.velocityX = transform.cosine * vehicle.velocityX + transform.sine * vehicle.velocityZ;
      observation.vehicle.velocityZ = -transform.sine * vehicle.velocityX + transform.cosine * vehicle.velocityZ;
      observation.vehicle.yaw = wrapAngle(vehicle.yaw + Math.atan2(transform.sine, transform.cosine));
      visible.push(observation);
    }
  };
  const current = { x: 0, z: 0, s: 0 };
  const observed = { rivals: visible, sprites };
  const noEvents: readonly CourseRaceEvent[] = Object.freeze([]);
  let events = noEvents;
  const clockEvents: { gate: CourseRaceEvent['landmark']; lap: number; u: number; finish: boolean; awardMs: number }[] =
    [];
  let pendingExpiry = Infinity,
    stepStart = 0;
  const admitPlayer: CourseRaceAdmission = (event) => {
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
    get recoveryL() {
      return lane(player, player.actor.vehicle.course.s);
    },
    advance(input: DrivingInput, dt: number) {
      if (clock.status !== 'RUNNING') return false;
      stepStart = clock.elapsedSeconds;
      stepDuration = dt;
      pendingExpiry = clock.expirySeconds ?? Infinity;
      move(motions[0]!, input, dt);
      for (let i = 1; i < motions.length; i += 1) {
        const motion = motions[i]!;
        move(
          motion,
          sampleEnvelopeDrivingInput(
            motion.session.view.world.guide,
            motion.c.actor.vehicle,
            driver!,
            motion.input,
            motion.driverWorkspace,
          ),
          dt,
        );
      }
      forks.observe(motions);
      for (const motion of motions) {
        const { c, previous } = motion;
        motion.recovered = legalRecovery(c) || motion.recovered;
        const section = c.session.history.active.section;
        current.x = c.actor.vehicle.x;
        current.z = c.actor.vehicle.z;
        current.s = c.actor.vehicle.course.s;
        const transition = c.session.observeStep(c.actor, previous, motion.recovered);
        motion.recovered ||= transition === 'recovered';
        const update = motion.recovered
          ? (resync(c), null)
          : c.observer.update(current, section, c === player ? admitPlayer : undefined);
        if (c.finishElapsedSeconds === null) {
          advanceRaceSession(c.timing, c.progress, update, dt);
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
        if (transition) resync(c);
      }
      return motions[0]!.recovered;
    },
    resyncPlayer() {
      legalRecovery(player);
      player.session.observeStep(player.actor, player.actor.vehicle, true);
      resync(player);
    },
    observe(camera: CameraState) {
      observations();
      sprites.length = 0;
      for (const c of visible)
        sprites.push(
          createDynamicVehicleCourseSprite(
            c.id,
            c.vehicle,
            camera.yaw,
            actorInputs.get(c.id)?.input.brake ? brakingAssets : assets[rivalKind],
            player.session.view.world.height,
          ),
        );
      return observed;
    },
    label() {
      const standings = rankRaceProgress(
        competitors.map((c) => ({
          competitorId: c.id,
          sProgress: c.progress.sProgress,
          validatedProgressFloor: c.progress.validatedProgressFloor,
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
          const choice = course.entry.fork ? (forks.choice(course.entry.fork)?.source.carriageway.id ?? 'OPEN') : 'GO';
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
