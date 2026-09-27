import type { DrivingInput } from '../vehicle/driving-input.js';
import type { PowertrainShiftObservation } from '../vehicle/physics/automatic-powertrain.js';
import type { VehicleMotionRead, VehicleRenderRead } from '../vehicle/physics/vehicle-contract.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { TireObservation, VehicleTireObservation } from '../vehicle/physics/vehicle-tire-observation.js';
import type { SessionVehicle } from '../content/session-vehicle.js';

/**
 * One competitor's values for display, camera and audio, copied by the race at the end of every fixed
 * step. It holds no vehicle state or model. Borrowed: the race overwrites the same object on the
 * next advance, so a consumer reads it before then and never retains it.
 */
export interface CompetitorObservation extends VehicleMotionRead, VehicleRenderRead {
  readonly id: string;
  readonly vehicleId: string;
  readonly form: SessionVehicle['vehicleDefinition']['form'];
  readonly y: number;
  readonly brakeLampOn: boolean;
  readonly powertrain: {
    readonly engineRpm: number;
    readonly effectiveOpening: number;
    readonly shift: Readonly<PowertrainShiftObservation>;
  };
  readonly tires: VehicleTireObservation;
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableTire = Mutable<TireObservation>;
type CompetitorObservationSlot = Mutable<Omit<CompetitorObservation, 'course' | 'powertrain' | 'tires'>> & {
  course: { s: number };
  powertrain: { engineRpm: number; effectiveOpening: number; shift: PowertrainShiftObservation };
  tires: { front: MutableTire; rear: MutableTire };
};

export function createCompetitorObservation(
  id: string,
  vehicleId: string,
  form: CompetitorObservation['form'],
): CompetitorObservation {
  const tire = (): MutableTire => ({
    longitudinalVelocity: 0,
    lateralVelocity: 0,
    wheelSpeed: 0,
    wheelAngularSpeed: 0,
    load: 0,
    longitudinalPower: 0,
    lateralPower: 0,
    surface: null,
  });
  const slot: CompetitorObservationSlot = {
    id,
    vehicleId,
    form,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    renderY: 0,
    course: { s: 0 },
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    longitudinalSpeed: 0,
    lateralSpeed: 0,
    sprungPitch: 0,
    lateralAcceleration: 0,
    brakeLampOn: false,
    powertrain: { engineRpm: 0, effectiveOpening: 0, shift: { sequence: 0, direction: 'NONE', fromRpm: 0, toRpm: 0 } },
    tires: { front: tire(), rear: tire() },
  };
  return slot;
}

/** The race's copy of one competitor at the end of a fixed step; the brake lamp follows that step's input. */
export function writeCompetitorObservation(
  observation: CompetitorObservation,
  vehicle: VehicleState,
  input: DrivingInput,
): void {
  const out = observation as CompetitorObservationSlot;
  out.x = vehicle.x;
  out.y = vehicle.y;
  out.z = vehicle.z;
  out.yaw = vehicle.yaw;
  out.renderY = vehicle.renderY;
  out.course.s = vehicle.course.s;
  out.velocityX = vehicle.velocityX;
  out.velocityY = vehicle.velocityY;
  out.velocityZ = vehicle.velocityZ;
  out.longitudinalSpeed = vehicle.longitudinalSpeed;
  out.lateralSpeed = vehicle.lateralSpeed;
  out.sprungPitch = vehicle.sprungPitch;
  out.lateralAcceleration = vehicle.lateralAcceleration;
  out.brakeLampOn = Number(input.brake) > 0;
  const { powertrain } = vehicle;
  out.powertrain.engineRpm = powertrain.engineRpm;
  out.powertrain.effectiveOpening = powertrain.effectiveOpening;
  Object.assign(out.powertrain.shift, powertrain.shift);
  Object.assign(out.tires.front, vehicle.tires.front);
  Object.assign(out.tires.rear, vehicle.tires.rear);
}
