import type { CompiledCourse } from '../compiler/compiled-course.js';
import { createCourseRaceProgress } from './course-race-progress.js';
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
import { compileSessionConfiguration } from '../gameplay/session-configuration.js';
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
import type { CompiledArcadeVehicleProfile } from '../physics/vehicle-profiles.js';
import type { TorqueProtectionPolicy } from '../physics/torque-protection.js';
import type { CourseSprite } from '../render/course-sprite.js';
import { COURSE_PLAY_SETTINGS } from './course-driving-policy.js';
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
  readonly course: CompiledCourse;
  readonly player: Actor;
  readonly playerSession: Session;
  readonly createSession: () => Session;
  readonly rivalCount: number;
  readonly lapCount: number;
  readonly rival: {
    readonly profile: CompiledArcadeVehicleProfile;
    readonly torqueProtection: TorqueProtectionPolicy;
    readonly kind: 'car' | 'bike';
  };
}) {
  const { course } = options;
  const entryS = course.entry.ports.find((p) => p.kind === 'entry')!.anchor.s;
  const rivalKind = options.rival.kind;
  const progress = createCourseRaceProgress(course, options.lapCount);
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
  const player = competitor('PLAYER', options.player, options.playerSession, COURSE_PLAY_SETTINGS.playerL);
  const rivals = createRivalRoster(compileSessionConfiguration({ rivalCount: options.rivalCount })).map(
    ({ actorId, rivalIndex }) => {
      const session = options.createSession();
      const targetL = (rivalIndex % 2 ? 1 : -1) * COURSE_PLAY_SETTINGS.rivalLane;
      const profile = options.rival;
      const vehicle = createArcadeVehicle(profile.profile, session.view.world, {
        s: COURSE_PLAY_SETTINGS.rivalFirstS + rivalIndex * COURSE_PLAY_SETTINGS.rivalSpacing,
        l: targetL,
        initialSpeed: COURSE_PLAY_SETTINGS.standingSpeed,
        torqueProtection: profile.torqueProtection,
      });
      return competitor(
        actorId,
        { vehicle, recovery: createRecoveryState(vehicle), cameraRig: createCameraRig() },
        session,
        targetL,
      );
    },
  );
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
  return Object.freeze({
    player,
    rivals,
    forks,
    get recoveryL() {
      return lane(player, player.actor.vehicle.course.s);
    },
    advance(input: DrivingInput, dt: number) {
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
        const update = motion.recovered ? (resync(c), null) : c.observer.update(current, section);
        if (c.finishElapsedSeconds === null) {
          advanceRaceSession(c.timing, c.progress, update, dt);
          if (update?.justFinished) c.finishElapsedSeconds = c.timing.elapsedSeconds;
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
      let state = 'FINISH';
      if (player.progress.status !== 'FINISHED') {
        if (course.type === 'CIRCUIT')
          state = `LAP ${Math.min(options.lapCount, player.progress.acceptedFinishCount + 1)}/${options.lapCount}`;
        else {
          const choice = course.entry.fork ? (forks.choice(course.entry.fork)?.source.carriageway.id ?? 'OPEN') : 'GO';
          state = `ROUTE ${choice}`;
        }
      }
      const start = player.timing.elapsedSeconds < 1 ? 'GO · ' : '';
      return `${start}${state} · P${rank}/${rivals.length + 1} · ${formatRaceTime(player.timing.elapsedSeconds)}`;
    },
  });
}
