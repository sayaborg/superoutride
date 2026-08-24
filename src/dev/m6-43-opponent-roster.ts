import type { GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import type { RaceCourseRules, RaceProgressState } from '../gameplay/race-progress.js';
import { createRaceProgressState } from '../gameplay/race-progress.js';
import { createM5RecoveryState, type M5RecoveryState } from '../gameplay/recovery.js';
import { createRaceSessionState, type RaceSessionState } from '../gameplay/race-session.js';
import type { CompiledRaceMode, OpponentRosterSlot } from '../gameplay/race-mode.js';
import { createM5Car, type M5CarState } from '../physics/car-physics.js';
import type { SurfaceMapReader } from '../physics/surface-map.js';
import type { LiveRouteRuntimeAssembly } from '../runtime/live-route-runtime.js';
import {
  createLiveRouteTravelerState,
  type LiveRouteChoicePlan,
  type LiveRouteTravelerState,
} from '../runtime/live-route-traveler.js';
import type { CyclicHeightProfile } from '../visual/height-profile.js';
import { createM640RivalRouteChoicePlan } from './m6-40-rival-live-route.js';

export const M6_43_DEV_OPPONENT_SPAWN_BASE_S = 95;
export const M6_43_DEV_OPPONENT_SPAWN_SPACING_S = 10;

export interface M643LiveOpponent {
  readonly slot: OpponentRosterSlot;
  readonly vehicle: M5CarState;
  readonly recovery: M5RecoveryState;
  readonly raceProgress: RaceProgressState;
  readonly raceSession: RaceSessionState;
  readonly traveler: LiveRouteTravelerState;
  readonly routePlan: LiveRouteChoicePlan;
}

/**
 * Concrete DEV integration for a compiled game-mode opponent roster.
 *
 * The generic game-mode layer knows no M5 vehicle type. This factory is intentionally allowed
 * to own the current DEV car/recovery/race diagnostic wiring so browser main can iterate a
 * variable-length array instead of owning one special `rival` state bundle.
 */
export function createM643LiveOpponentRoster(
  mode: CompiledRaceMode,
  live: LiveRouteRuntimeAssembly,
  initialGuide: GuideCoordinateSource,
  initialHeight: CyclicHeightProfile,
  initialSurface: SurfaceMapReader,
  raceRules: RaceCourseRules,
): readonly M643LiveOpponent[] {
  const lastSpawnS = mode.rivalCount === 0
    ? M6_43_DEV_OPPONENT_SPAWN_BASE_S
    : opponentSpawnS(mode.rivalCount - 1);
  if (lastSpawnS >= raceRules.courseLength) {
    throw new RangeError('DEV opponent roster does not fit inside the initial race course');
  }

  return Object.freeze(mode.opponents.map((slot) => {
    const vehicle = createM5Car(initialGuide, initialHeight, initialSurface, opponentSpawnS(slot.rosterIndex));
    return {
      slot,
      vehicle,
      recovery: createM5RecoveryState(vehicle),
      raceProgress: createRaceProgressState(raceRules, {
        x: vehicle.x,
        z: vehicle.z,
        sLocal: vehicle.course.s,
      }),
      raceSession: createRaceSessionState(),
      traveler: createLiveRouteTravelerState(live, { x: vehicle.x, z: vehicle.z }),
      routePlan: createM640RivalRouteChoicePlan(live),
    };
  }));
}

export function opponentSpawnS(rosterIndex: number): number {
  if (!Number.isInteger(rosterIndex) || rosterIndex < 0) {
    throw new RangeError('opponent rosterIndex must be an integer >= 0');
  }
  return M6_43_DEV_OPPONENT_SPAWN_BASE_S + rosterIndex * M6_43_DEV_OPPONENT_SPAWN_SPACING_S;
}
