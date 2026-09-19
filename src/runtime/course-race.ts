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
import { createRivalRoster } from './rival-roster.js';
import type { createCourseDrivingGraph } from './course-driving-session.js';

type Session = ReturnType<ReturnType<typeof createCourseDrivingGraph>['createSession']>;
interface Actor {
  readonly vehicle: ArcadeVehicleState;
  readonly recovery: RecoveryState;
  readonly cameraRig: CameraRig;
}

/** Provisional race composition. Physics, source readers and ordered gate rules remain ordinary components. */
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
  const forks = createCourseForkField();
  const sample = (actor: Actor) => ({ x: actor.vehicle.x, z: actor.vehicle.z, s: actor.vehicle.course.s });
  const competitor = (id: string, actor: Actor, session: Session, targetL: number) => ({
    id,
    actor,
    session,
    targetL,
    observer: progress(session, () => actor.vehicle),
    get progress() {
      return this.observer.state;
    },
    timing: createRaceSessionState(),
    finishElapsedSeconds: null as number | null,
  });
  const player = competitor('PLAYER', options.player, options.playerSession, 0);
  const rivals = createRivalRoster(compileSessionConfiguration({ rivalCount: options.rivalCount })).map(
    ({ actorId, rivalIndex }) => {
      const session = options.createSession();
      const targetL = rivalIndex % 2 ? 2 : -2;
      const profile = options.rival;
      const vehicle = createArcadeVehicle(profile.profile, session.view.world, {
        s: 55 + rivalIndex * 12,
        l: targetL,
        initialSpeed: 0,
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
  const move = (c: typeof player, input: DrivingInput, dt: number) => {
    const { actor, session } = c;
    const previous = sample(actor);
    let recovered =
      advanceVehicleWithRecovery(session.view.world, actor.vehicle, {
        state: actor.recovery,
        input,
        dt,
        profile: { ...RECOVERY_PROFILE, targetL: lane(c, actor.vehicle.course.s) },
      }) !== null;
    if (session.history.active.ordinal === 0 && actor.vehicle.course.s < entryS) {
      recoverVehicleToGuideCoordinate(session.view.world, actor.vehicle, {
        state: actor.recovery,
        reason: 'wrong-course',
        target: { s: entryS, l: lane(c, entryS) },
      });
      recovered = true;
    }
    return { c, previous, recovered };
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
  const observations = () => {
    const playerFromReference = invertPlanarTransform(player.session.referenceFromFrame);
    return rivals.flatMap((c) => {
      const vehicle = c.actor.vehicle;
      const s = vehicle.course.s + c.session.referenceSOffset - player.session.referenceSOffset;
      if (s < player.session.view.range.start || s > player.session.view.range.end) return [];
      const transform = composePlanarTransforms(playerFromReference, c.session.referenceFromFrame);
      const velocity = transformPlanarVector(transform, { x: vehicle.velocityX, z: vehicle.velocityZ });
      return [
        {
          id: c.id,
          vehicle: {
            ...vehicle,
            ...transformPlanarPoint(transform, vehicle),
            velocityX: velocity.x,
            velocityZ: velocity.z,
            yaw: wrapAngle(vehicle.yaw + Math.atan2(transform.sine, transform.cosine)),
            course: { ...vehicle.course, s },
          },
        },
      ];
    });
  };
  return Object.freeze({
    player,
    rivals,
    forks,
    get recoveryL() {
      return lane(player, player.actor.vehicle.course.s);
    },
    advance(input: DrivingInput, dt: number) {
      const motions = [
        move(player, input, dt),
        ...rivals.map((c) =>
          move(
            c,
            sampleRivalDrivingInput(c.session.view.world.guide, c.actor.vehicle, (s) => lane(c, s)),
            dt,
          ),
        ),
      ];
      forks.observe(
        motions.map(({ c, previous, recovered }) => ({
          id: c.id,
          session: c.session,
          previous,
          current: c.actor.vehicle,
          recovered,
        })),
      );
      for (const motion of motions) {
        const { c, previous } = motion;
        motion.recovered = legalRecovery(c) || motion.recovered;
        const update = motion.recovered ? (resync(c), null) : c.observer.update();
        if (c.finishElapsedSeconds === null) {
          advanceRaceSession(c.timing, c.progress, update, dt);
          if (update?.justFinished) c.finishElapsedSeconds = c.timing.elapsedSeconds;
        }
        if (c.session.observeStep(c.actor, previous, motion.recovered)) resync(c);
      }
      return motions[0]!.recovered;
    },
    resyncPlayer() {
      legalRecovery(player);
      player.session.observeStep(player.actor, player.actor.vehicle, true);
      resync(player);
    },
    observe(camera: CameraState) {
      const visible = observations();
      return {
        rivals: visible,
        sprites: visible.map((c) =>
          createDynamicVehicleCourseSprite(
            c.id,
            c.vehicle,
            camera.yaw,
            assets[rivalKind],
            player.session.view.world.height,
          ),
        ),
      };
    },
    label() {
      const standings = rankRaceProgress(
        [player, ...rivals].map((c) => ({
          competitorId: c.id,
          sProgress: c.progress.sProgress,
          validatedProgressFloor: c.progress.validatedProgressFloor,
          finishElapsedSeconds: c.finishElapsedSeconds,
        })),
      );
      const rank = standings.find((s) => s.competitorId === player.id)!.rank;
      return `${player.timing.elapsedSeconds < 1 ? 'GO · ' : ''}${player.progress.status === 'FINISHED' ? 'FINISH' : course.type === 'CIRCUIT' ? `LAP ${Math.min(options.lapCount, player.progress.acceptedFinishCount + 1)}/${options.lapCount}` : `ROUTE ${course.entry.fork ? (forks.choice(course.entry.fork)?.source.carriageway.id ?? 'OPEN') : 'GO'}`} · P${rank}/${rivals.length + 1} · ${formatRaceTime(player.timing.elapsedSeconds)}`;
    },
  });
}
