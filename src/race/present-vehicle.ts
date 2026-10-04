import type { Writable } from '../core/writable.js';
import type { Vec3 } from '../core/vector3.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { createEnvelopeDriverWorkspace, EnvelopeDriver } from './envelope-driver.js';
import type { LaneIntent, VehicleSighting } from './lane-following.js';
import type { RecoveryState, RecoveryTarget } from './recovery.js';

/** A vehicle's mechanics: its live state, its model and its recovery state. */
export interface VehicleActor {
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
  readonly recovery: RecoveryState;
}

/**
 * A driver driving a present vehicle: its envelope driver, the lane intent it changes, its plan workspace and its target
 * lateral along the Route (`target`), a new function whenever its lane changes, since the driver caches by lane.
 */
export interface VehicleDriving {
  readonly driver: EnvelopeDriver;
  readonly intent: LaneIntent;
  readonly workspace: ReturnType<typeof createEnvelopeDriverWorkspace>;
  target: (s: number) => number;
}

/**
 * A vehicle present in the Session, competitor or traffic, as contacts, placement, drivers and recovery read it: its
 * mechanics (`actor`, replaced when a competitor appears ahead), the driver driving it now (a rival's, a traffic
 * vehicle's or the player's takeover after GOAL; null while the player drives), its route position at the start of the
 * previous step, whether that step recovered it, the contact force on it, how drivers see it and its recovery step.
 * The race owns and writes every field.
 */
export interface PresentVehicle {
  readonly id: string;
  actor: VehicleActor;
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
  driving: VehicleDriving | null;
  readonly previous: { s: number; l: number };
  recovered: boolean;
  readonly contactForce: Writable<Vec3>;
  readonly sighting: Writable<VehicleSighting>;
  readonly step: {
    readonly state: RecoveryState;
    input: DrivingInput;
    readonly place: (s: number) => RecoveryTarget;
    readonly externalForce: Readonly<Vec3>;
    /** Whether a fixed object holds the vehicle this step; the race writes it for recovery. */
    blocked: boolean;
  };
}

const IDLE: DrivingInput = Object.freeze({ steering: 0, throttle: false, brake: false });

/** A present vehicle over `actor`, driven by `driving` (null for none), recovering to the place `place` resolves. */
export function createPresentVehicle(
  id: string,
  actor: VehicleActor,
  driving: VehicleDriving | null,
  place: (self: PresentVehicle, s: number) => RecoveryTarget,
): PresentVehicle {
  const contactForce = { x: 0, y: 0, z: 0 };
  const present: PresentVehicle = {
    id,
    actor,
    get vehicle() {
      return present.actor.vehicle;
    },
    get model() {
      return present.actor.model;
    },
    driving,
    previous: { s: actor.vehicle.course.s, l: actor.vehicle.course.l },
    recovered: false,
    contactForce,
    sighting: { s: 0, l: 0, length: 0, width: 0, speed: 0, heading: 0, target: 0, driver: null },
    step: {
      get state() {
        return present.actor.recovery;
      },
      input: IDLE,
      place: (s: number) => place(present, s),
      externalForce: contactForce,
      blocked: false,
    },
  };
  return present;
}

/**
 * The lateral a present vehicle is heading for at its station: its driver's target lateral, or its own lateral while
 * no driver drives it.
 */
export function presentTarget(present: PresentVehicle): number {
  const { s, l } = present.vehicle.course;
  return present.driving ? present.driving.target(s) : l;
}
