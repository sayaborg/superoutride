import {
  resyncCircuitRaceProgress,
  updateCircuitRaceProgress,
  type CircuitRaceProgressState,
  type CircuitRaceRules,
} from '../gameplay/circuit-race-progress.js';
import { advanceRaceSession, type RaceSessionState } from '../gameplay/race-session.js';
import {
  advanceVehicleWithRecovery,
  type RecoveryProfile,
  type RecoveryReason,
  type RecoveryState,
} from '../gameplay/recovery.js';
import type { DrivingInput } from '../input/driving-input.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import type { VehicleWorld } from '../physics/vehicle-contract.js';

export interface CircuitDrivingActor {
  readonly vehicle: ArcadeVehicleState;
  readonly recovery: RecoveryState;
  readonly raceProgress: CircuitRaceProgressState;
  readonly raceSession: RaceSessionState;
}

/** Circuit progress observes motion only after an ordinary step, never after recovery. */
export function advanceCircuitDrivingActor(
  world: VehicleWorld,
  actor: CircuitDrivingActor,
  { rules, input, dt, profile }: { rules: CircuitRaceRules; input: DrivingInput; dt: number; profile: RecoveryProfile },
): RecoveryReason | null {
  const recovered = advanceVehicleWithRecovery(world, actor.vehicle, { state: actor.recovery, input, dt, profile });
  const sample = { x: actor.vehicle.x, z: actor.vehicle.z, sWindow: actor.vehicle.course.s };
  const update = recovered === null ? updateCircuitRaceProgress(actor.raceProgress, rules, sample) : null;
  if (recovered !== null) resyncCircuitRaceProgress(actor.raceProgress, rules, sample);
  advanceRaceSession(actor.raceSession, actor.raceProgress, update, dt);
  return recovered;
}
