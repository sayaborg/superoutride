import type { TireAudioObservation, VehicleAudioObservation } from '../audio/vehicle-audio-observation.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type Observation = Mutable<Omit<VehicleAudioObservation, 'front' | 'rear'>> & {
  front: Mutable<TireAudioObservation>;
  rear: Mutable<TireAudioObservation>;
};
export function createVehicleAudioObservation(): Observation {
  const tire = (): Mutable<TireAudioObservation> => ({
    load: 0,
    rollingSpeed: 0,
    slipSpeed: 0,
    utilization: 0,
    surface: 'VOID',
  });
  return { rpm: 0, idleRpm: 1000, redlineRpm: 7000, throttle: 0, drive: 0, speed: 0, front: tire(), rear: tire() };
}
/** Copy completed observations into two reusable slots; do not run contact or tire solvers here. */
export function readVehicleAudio(vehicle: ArcadeVehicleState, result: Observation): void {
  const { control, powertrain, profile } = vehicle;
  result.rpm = powertrain.engineRpm;
  result.idleRpm = profile.powertrain.idleRpm;
  result.redlineRpm = profile.powertrain.redlineRpm;
  result.throttle = vehicle.actuator.throttle;
  result.drive =
    powertrain.outputDriveTorque > 0
      ? Math.max(0, Math.min(1, control.deliveredDriveTorque / powertrain.outputDriveTorque)) * result.throttle
      : 0;
  result.speed = vehicle.speed;
  result.front.load = vehicle.frontNormalLoad;
  result.front.rollingSpeed = control.frontRollingSpeed;
  result.front.slipSpeed = control.frontSlipSpeed;
  result.front.utilization = control.frontUtilization;
  result.front.surface = control.frontSurface;
  result.rear.load = vehicle.rearNormalLoad;
  result.rear.rollingSpeed = control.rearRollingSpeed;
  result.rear.slipSpeed = control.rearSlipSpeed;
  result.rear.utilization = control.rearUtilization;
  result.rear.surface = control.rearSurface;
}

interface Actor {
  readonly vehicle: ArcadeVehicleState;
}
/** Physical world distance, independent of raster depth and local stage chainage. */
export function nearestAudibleRival(player: ArcadeVehicleState, actors: readonly Actor[]): ArcadeVehicleState | null {
  let nearest: ArcadeVehicleState | null = null;
  let distanceSquared = 100 * 100;
  for (const { vehicle } of actors) {
    if (vehicle === player) continue;
    const d2 = (vehicle.x - player.x) ** 2 + (vehicle.y - player.y) ** 2 + (vehicle.z - player.z) ** 2;
    if (d2 < distanceSquared) {
      nearest = vehicle;
      distanceSquared = d2;
    }
  }
  return nearest;
}
