import type { DrivingInput } from '../vehicle/driving-input.js';
import type { PowertrainShiftObservation } from '../vehicle/physics/automatic-powertrain.js';
import type { VehicleMotionRead, VehicleRenderRead } from '../vehicle/physics/vehicle-contract.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
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
  /** The color of the vehicle's sprite set this competitor is drawn in. */
  readonly color: string;
  readonly form: SessionVehicle['vehicleDefinition']['listing']['form'];
  readonly y: number;
  readonly brakeLampOn: boolean;
  /** Speed over ground, m/s. */
  readonly speed: number;
  /** The vehicle's actual controls: the delivered driver steering offset as a fraction of its maximum, in [-1, 1], and
   * the throttle and brake actuators, in [0, 1]. */
  readonly control: { readonly steering: number; readonly throttle: number; readonly brake: number };
  readonly powertrain: {
    /** The selected forward gear, from 1. */
    readonly gear: number;
    readonly engineRpm: number;
    readonly effectiveOpening: number;
    readonly fuelCut: boolean;
    readonly shift: Readonly<PowertrainShiftObservation>;
    /** The race's simulation seconds at the latest shift; null before the first. */
    readonly shiftSeconds: number | null;
  };
  readonly tires: VehicleTireObservation;
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableTire = Mutable<TireObservation>;
type CompetitorObservationSlot = Mutable<Omit<CompetitorObservation, 'course' | 'control' | 'powertrain' | 'tires'>> & {
  course: { s: number; l: number };
  control: Mutable<CompetitorObservation['control']>;
  powertrain: {
    gear: number;
    engineRpm: number;
    effectiveOpening: number;
    fuelCut: boolean;
    shift: PowertrainShiftObservation;
    shiftSeconds: number | null;
  };
  tires: { front: MutableTire; rear: MutableTire };
};

export function createCompetitorObservation(
  id: string,
  vehicleId: string,
  color: string,
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
    color,
    form,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    renderY: 0,
    course: { s: 0, l: 0 },
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    longitudinalSpeed: 0,
    lateralSpeed: 0,
    sprungPitch: 0,
    lateralAcceleration: 0,
    brakeLampOn: false,
    speed: 0,
    control: { steering: 0, throttle: 0, brake: 0 },
    powertrain: {
      gear: 1,
      engineRpm: 0,
      effectiveOpening: 0,
      fuelCut: false,
      shift: { sequence: 0, direction: 'NONE', fromRpm: 0, toRpm: 0 },
      shiftSeconds: null,
    },
    tires: { front: tire(), rear: tire() },
  };
  return slot;
}

/**
 * The race's copy of one competitor at the end of a fixed step at `simulationSeconds`; the brake lamp follows that
 * step's input.
 */
export function writeCompetitorObservation(
  observation: CompetitorObservation,
  vehicle: VehicleState,
  model: VehicleModel,
  input: DrivingInput,
  simulationSeconds: number,
): void {
  const out = observation as CompetitorObservationSlot;
  out.x = vehicle.x;
  out.y = vehicle.y;
  out.z = vehicle.z;
  out.yaw = vehicle.yaw;
  out.renderY = vehicle.renderY;
  out.course.s = vehicle.course.s;
  out.course.l = vehicle.course.l;
  out.velocityX = vehicle.velocityX;
  out.velocityY = vehicle.velocityY;
  out.velocityZ = vehicle.velocityZ;
  out.longitudinalSpeed = vehicle.longitudinalSpeed;
  out.lateralSpeed = vehicle.lateralSpeed;
  out.sprungPitch = vehicle.sprungPitch;
  out.lateralAcceleration = vehicle.lateralAcceleration;
  out.brakeLampOn = Number(input.brake) > 0;
  out.speed = vehicle.speed;
  const { control } = vehicle;
  out.control.steering = control.deliveredSteerOffset / model.steering.steeringOffsetMax;
  out.control.throttle = control.throttleActuator;
  out.control.brake = control.brakeActuator;
  const { powertrain } = vehicle;
  out.powertrain.gear = powertrain.gear;
  out.powertrain.engineRpm = powertrain.engineRpm;
  out.powertrain.effectiveOpening = powertrain.effectiveOpening;
  out.powertrain.fuelCut = powertrain.fuelCut;
  if (powertrain.shift.sequence !== out.powertrain.shift.sequence) out.powertrain.shiftSeconds = simulationSeconds;
  Object.assign(out.powertrain.shift, powertrain.shift);
  Object.assign(out.tires.front, vehicle.tires.front);
  Object.assign(out.tires.rear, vehicle.tires.rear);
}
