import type {
  ShiftAudioObservation,
  TireAudioObservation,
  VehicleAudioObservation,
} from '../audio/vehicle-audio-observation.js';
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
/** Copy completed observations into two reusable slots; do not run contact or tire solvers here. */
export function readEngineAudio(competitor: CompetitorObservation, result: Observation): void {
  const { powertrain } = competitor;
  result.rpm = powertrain.engineRpm;
  result.effectiveOpening = powertrain.effectiveOpening;
  result.shift.sequence = powertrain.shift.sequence;
  result.shift.direction = powertrain.shift.direction;
  result.shift.fromRpm = powertrain.shift.fromRpm;
  result.shift.toRpm = powertrain.shift.toRpm;
}

/** Player audio also reads the tire observations; rival engines use readEngineAudio. */
export function readVehicleAudio(competitor: CompetitorObservation, result: Observation): void {
  readEngineAudio(competitor, result);
  const { tires } = competitor;
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
