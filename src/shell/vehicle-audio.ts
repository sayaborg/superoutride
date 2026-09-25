import { observeVehicleTires } from '../vehicle/physics/vehicle-tire-observation.js';
import { RIVAL_AUDIBLE_METERS } from '../audio/audio-presentation.js';
import type {
  ShiftAudioObservation,
  TireAudioObservation,
  VehicleAudioObservation,
} from '../audio/vehicle-audio-observation.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type Observation = Mutable<Omit<VehicleAudioObservation, 'shift' | 'front' | 'rear'>> & {
  shift: Mutable<ShiftAudioObservation>;
  front: Mutable<TireAudioObservation>;
  rear: Mutable<TireAudioObservation>;
};
export function createVehicleAudioObservation(): Observation {
  const tire = (): Mutable<TireAudioObservation> => ({
    longitudinalVelocity: 0,
    lateralVelocity: 0,
    wheelSpeed: 0,
    wheelAngularSpeed: 0,
    load: 0,
    longitudinalPower: 0,
    lateralPower: 0,
    surface: 'VOID',
  });
  return {
    rpm: 0,
    effectiveOpening: 0,
    shift: { sequence: 0, direction: 'NONE', fromRpm: 0, toRpm: 0 },
    front: tire(),
    rear: tire(),
  };
}
/** Copy completed observations into two reusable slots; do not run contact or tire solvers here. */
export function readEngineAudio(vehicle: VehicleState, result: Observation): void {
  const { powertrain } = vehicle;
  result.rpm = powertrain.engineRpm;
  result.effectiveOpening = powertrain.effectiveOpening;
  result.shift.sequence = powertrain.shift.sequence;
  result.shift.direction = powertrain.shift.direction;
  result.shift.fromRpm = powertrain.shift.fromRpm;
  result.shift.toRpm = powertrain.shift.toRpm;
}

/** Player consumer subscribes to completed tire telemetry; rival engines use readEngineAudio. */
export function readVehicleAudio(vehicle: VehicleState, result: Observation): void {
  readEngineAudio(vehicle, result);
  const tires = observeVehicleTires(vehicle);
  result.front.load = vehicle.frontNormalLoad;
  result.front.longitudinalVelocity = tires.front.longitudinalVelocity;
  result.front.lateralVelocity = tires.front.lateralVelocity;
  result.front.wheelSpeed = tires.front.wheelSpeed;
  result.front.wheelAngularSpeed = tires.front.wheelAngularSpeed;
  result.front.longitudinalPower = tires.front.longitudinalPower;
  result.front.lateralPower = tires.front.lateralPower;
  result.front.surface = tires.front.surface;
  result.rear.load = vehicle.rearNormalLoad;
  result.rear.longitudinalVelocity = tires.rear.longitudinalVelocity;
  result.rear.lateralVelocity = tires.rear.lateralVelocity;
  result.rear.wheelSpeed = tires.rear.wheelSpeed;
  result.rear.wheelAngularSpeed = tires.rear.wheelAngularSpeed;
  result.rear.longitudinalPower = tires.rear.longitudinalPower;
  result.rear.lateralPower = tires.rear.lateralPower;
  result.rear.surface = tires.rear.surface;
}

interface Actor {
  readonly vehicle: VehicleState;
}
/** Physical world distance, independent of raster depth and local stage chainage. */
export function nearestAudibleRival(player: VehicleState, actors: readonly Actor[]): VehicleState | null {
  let nearest: VehicleState | null = null;
  let distanceSquared = RIVAL_AUDIBLE_METERS ** 2;
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
