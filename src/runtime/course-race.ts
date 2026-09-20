import type { ResolvedCourseSession } from './course-session.js';
import { createCheckpointClock } from '../gameplay/checkpoint-clock.js';
import { createCourseRaceProgress, type CourseRaceEvent, type CourseRaceAdmission } from './course-race-progress.js';
import { createCourseForkField } from './course-fork-field.js';
import { createCameraRig, type CameraRig, type CameraState } from '../camera/camera.js';
import {
  composePlanarTransforms,
  invertPlanarTransform,
  transformPlanarPoint,
  transformPlanarVector,
} from '../core/planar-transform.js';
import { wrapAngle } from '../core/math.js';
import {
  advanceRaceSession,
  createRaceSessionState,
  rankRaceProgress,
  formatRaceTime,
} from '../gameplay/race-session.js';
import {
  RECOVERY_PROFILE,
  createRecoveryState,
  advanceVehicleWithRecovery,
  recoverVehicleToGuideCoordinate,
  type RecoveryState,
} from '../gameplay/recovery.js';
import { sampleRivalDrivingInput } from '../gameplay/rival-driver.js';
import type { DrivingInput } from '../input/driving-input.js';
import { createArcadeVehicle, type ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { createDynamicVehicleCourseSprite } from '../render/dynamic-vehicle-sprite.js';
import { createSpriteAssets } from '../visual/sprite-assets.js';
import type { SessionVehicle } from '../gameplay/session-configuration.js';
import type { CourseSprite } from '../render/course-sprite.js';
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
}) {
  const { course, configuration, grid, initialSpeed, budgets } = options.session;
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
  const assets = createSpriteAssets();
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
    input: (s: number) => lane(c, s),
  }));
  const move = (motion: (typeof motions)[number], input: DrivingInput, dt: number) => {
    const { c, previous } = motion;
    const { actor, session } = c;
    previous.x = actor.vehicle.x;
    previous.z = actor.vehicle.z;
    previous.s = actor.vehicle.course.s;
    motion.current = actor.vehicle;
    c.recoveryProfile.targetL = lane(c, actor.vehicle.course.s);
    let recovered =
      advanceVehicleWithRecovery(session.view.world, actor.vehicle, {
        state: actor.recovery,
        input,
        dt,
        profile: c.recoveryProfile,
      }) !== null;
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
  }));
  const observations = () => {
    visible.length = 0;
    const playerFromReference = invertPlanarTransform(player.session.referenceFromFrame);
    for (let i = 0; i < rivals.length; i += 1) {
      const c = rivals[i]!;
      const vehicle = c.actor.vehicle;
      const s = vehicle.course.s + c.session.referenceSOffset - player.session.referenceSOffset;
      if (s < player.session.view.range.start || s > player.session.view.range.end) continue;
      const transform = composePlanarTransforms(playerFromReference, c.session.referenceFromFrame);
      const velocity = transformPlanarVector(transform, { x: vehicle.velocityX, z: vehicle.velocityZ });
      const observation = pool[i]!;
      const coordinate = observation.vehicle.course;
      Object.assign(observation.vehicle, vehicle, transformPlanarPoint(transform, vehicle));
      Object.assign(coordinate, vehicle.course, { s });
      observation.vehicle.course = coordinate;
      observation.vehicle.velocityX = velocity.x;
      observation.vehicle.velocityZ = velocity.z;
      observation.vehicle.yaw = wrapAngle(vehicle.yaw + Math.atan2(transform.sine, transform.cosine));
      visible.push(observation);
    }
  };
  const current = { x: 0, z: 0, s: 0 };
  const observed = { rivals: visible, sprites };
  let events: readonly CourseRaceEvent[] = [];
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
          sampleRivalDrivingInput(motion.session.view.world.guide, motion.c.actor.vehicle, motion.input),
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
          events = update?.events ?? [];
          clock.advance(
            dt,
            events.map((event) => ({
              gate: event.landmark,
              lap: event.lap,
              u: event.u,
              finish: event.finish,
              awardMs: event.finish ? 0 : (budgets?.after(event.landmark, event.lap) ?? 0),
            })),
          );
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
            assets[rivalKind],
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
