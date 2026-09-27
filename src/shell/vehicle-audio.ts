import type {
  ShiftAudioObservation,
  TireAudioObservation,
  VehicleAudioObservation,
} from '../audio/vehicle-audio-observation.js';
import type { VehicleAudioEmitter } from '../audio/audio-scene.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';

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
    surface: null,
  });
  return {
    rpm: 0,
    effectiveOpening: 0,
    shift: { sequence: 0, direction: 'NONE', fromRpm: 0, toRpm: 0 },
    front: tire(),
    rear: tire(),
  };
}
type Emitter = Observation & Mutable<Omit<VehicleAudioEmitter, keyof VehicleAudioObservation>>;
export function createVehicleAudioEmitter(): Emitter {
  return { ...createVehicleAudioObservation(), id: '', x: 0, y: 0, z: 0, yaw: 0 };
}
/** Copy one completed competitor observation into a reusable emitter; do not run contact or tire solvers here. */
export function readVehicleAudio(competitor: CompetitorObservation, result: Emitter): void {
  result.id = competitor.id;
  result.x = competitor.x;
  result.y = competitor.y;
  result.z = competitor.z;
  result.yaw = competitor.yaw;
  const { powertrain, tires } = competitor;
  result.rpm = powertrain.engineRpm;
  result.effectiveOpening = powertrain.effectiveOpening;
  result.shift.sequence = powertrain.shift.sequence;
  result.shift.direction = powertrain.shift.direction;
  result.shift.fromRpm = powertrain.shift.fromRpm;
  result.shift.toRpm = powertrain.shift.toRpm;
  result.front.load = tires.front.load;
  result.front.longitudinalVelocity = tires.front.longitudinalVelocity;
  result.front.lateralVelocity = tires.front.lateralVelocity;
  result.front.wheelSpeed = tires.front.wheelSpeed;
  result.front.wheelAngularSpeed = tires.front.wheelAngularSpeed;
  result.front.longitudinalPower = tires.front.longitudinalPower;
  result.front.lateralPower = tires.front.lateralPower;
  result.front.surface = tires.front.surface;
  result.rear.load = tires.rear.load;
  result.rear.longitudinalVelocity = tires.rear.longitudinalVelocity;
  result.rear.lateralVelocity = tires.rear.lateralVelocity;
  result.rear.wheelSpeed = tires.rear.wheelSpeed;
  result.rear.wheelAngularSpeed = tires.rear.wheelAngularSpeed;
  result.rear.longitudinalPower = tires.rear.longitudinalPower;
  result.rear.lateralPower = tires.rear.lateralPower;
  result.rear.surface = tires.rear.surface;
}
