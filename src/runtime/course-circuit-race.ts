import type { CompiledSection } from '../compiler/course-graph.js';
import { createCameraRig, type CameraRig, type CameraState } from '../camera/camera.js';
import {
  composePlanarTransforms,
  invertPlanarTransform,
  transformPlanarPoint,
  transformPlanarVector,
} from '../core/planar-transform.js';
import { wrapAngle } from '../core/math.js';
import {
  compileCircuitRaceRules,
  createCircuitRaceProgressState,
  updateCircuitRaceProgress,
  resyncCircuitRaceProgress,
} from '../gameplay/circuit-race-progress.js';
import {
  advanceRaceSession,
  createRaceSessionState,
  rankRaceProgress,
  formatRaceTime,
} from '../gameplay/race-session.js';
import { compileSessionConfiguration } from '../gameplay/session-configuration.js';
import {
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

/** Provisional circuit composition. Physics, source readers and ordered gate rules remain ordinary components. */
export function createCourseCircuitRace(options: {
  readonly section: CompiledSection;
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
  const { section } = options;
  const rivalKind = options.rival.kind;
  const loop = section.outgoing[0];
  if (section.outgoing.length !== 1 || !loop || loop.destination.section !== section)
    throw new RangeError('Circuit race requires one canonical source loop');
  const entryS = loop.destination.anchor.s,
    finishS = loop.source.anchor.s;
  const rules = compileCircuitRaceRules(section.guide, {
    id: 'provisional-race',
    lapCount: options.lapCount,
    entryS,
    finishS,
    checkpointChainages: [0.25, 0.5, 0.75].map((f) => entryS + (finishS - entryS) * f),
  });
  const sample = (actor: Actor) => ({ x: actor.vehicle.x, z: actor.vehicle.z, s: actor.vehicle.course.s });
  const competitor = (id: string, actor: Actor, session: Session, targetL: number) => ({
    id,
    actor,
    session,
    targetL,
    progress: createCircuitRaceProgressState(rules, sample(actor)),
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
  const resync = (c: typeof player) => resyncCircuitRaceProgress(c.progress, rules, sample(c.actor));
  const advance = (c: typeof player, input: DrivingInput, dt: number) => {
    const { actor, session } = c;
    const previous = sample(actor);
    let recovered =
      advanceVehicleWithRecovery(session.view.world, actor.vehicle, { state: actor.recovery, input, dt }) !== null;
    if (session.history.active.ordinal === 0 && actor.vehicle.course.s < entryS) {
      recoverVehicleToGuideCoordinate(session.view.world, actor.vehicle, {
        state: actor.recovery,
        reason: 'wrong-course',
        target: { s: entryS, l: c.targetL },
      });
      recovered = true;
    }
    const update = recovered ? (resync(c), null) : updateCircuitRaceProgress(c.progress, rules, sample(actor));
    if (c.finishElapsedSeconds === null) {
      advanceRaceSession(c.timing, c.progress, update, dt);
      if (update?.justFinished) c.finishElapsedSeconds = c.timing.elapsedSeconds;
    }
    if (session.observeStep(actor, previous, recovered)) resync(c);
    return recovered;
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
    advance(input: DrivingInput, dt: number) {
      const recovered = advance(player, input, dt);
      for (const rival of rivals)
        advance(rival, sampleRivalDrivingInput(rival.session.view.world.guide, rival.actor.vehicle, rival.targetL), dt);
      return recovered;
    },
    resyncPlayer() {
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
      return `${player.timing.elapsedSeconds < 1 ? 'GO · ' : ''}${player.progress.status === 'FINISHED' ? 'FINISH' : `LAP ${Math.min(rules.lapCount, player.progress.acceptedFinishCount + 1)}/${rules.lapCount}`} · P${rank}/${rivals.length + 1} · ${formatRaceTime(player.timing.elapsedSeconds)}`;
    },
  });
}
