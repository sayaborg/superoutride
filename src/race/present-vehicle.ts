import type { Writable } from '../core/writable.js';
import type { Vec3 } from '../core/vector3.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import { updateVehicle, type VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { DriverSteering } from '../vehicle/physics/vehicle-calibration.js';
import type { createPlannedDriverWorkspace, PlannedDriver } from './planned-driver.js';
import type { LaneIntent, PathOffset, VehicleSighting } from './lane-following.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import { advanceVehicleWithRecovery, recoverVehicle, type RecoveryState, type RecoveryTarget } from './recovery.js';
import { advanceContactResponse, contactResponseStopped, type ContactResponseState } from './contact-response.js';

/** A vehicle's mechanics: its live state, its model and its recovery state. */
export interface VehicleActor {
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
  readonly recovery: RecoveryState;
  readonly contactResponse: ContactResponseState;
}

/**
 * A driver driving a present vehicle: its planned driver, the lane intent it changes, its offset from the racing line
 * when it drives the line, its plan workspace and its target lateral along the Route (`target`), a new function
 * whenever its lane or offset changes, since the driver caches by path.
 */
export interface VehicleDriving {
  readonly driver: PlannedDriver;
  readonly intent: LaneIntent;
  /** Its offset from the racing line when it drives the line (its intent's lane is `LINE`); null while it keeps lanes. */
  readonly offset: PathOffset | null;
  readonly workspace: ReturnType<typeof createPlannedDriverWorkspace>;
  target: (s: number) => number;
}

/**
 * A vehicle present in the run, competitor or traffic, as contacts, placement, drivers and recovery read it: its
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
    /** The steering rule of whoever drives the vehicle this step. */
    steering: DriverSteering;
    readonly place: (s: number) => RecoveryTarget | null;
    readonly externalForce: Readonly<Vec3>;
    /** Whether a fixed object holds the vehicle this step; the race writes it for recovery. */
    blocked: boolean;
  };
}

const IDLE: DrivingInput = Object.freeze({ steering: 0, throttle: false, brake: false });

/**
 * A present vehicle over `actor`, driven by `driving` (null for none) by the steering rule `steering` until a step names
 * another, recovering to the place `place` resolves.
 */
export function createPresentVehicle(
  id: string,
  actor: VehicleActor,
  driving: VehicleDriving | null,
  steering: DriverSteering,
  place: (self: PresentVehicle, s: number) => RecoveryTarget | null,
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
    sighting: {
      s: 0,
      l: 0,
      length: 0,
      width: 0,
      speed: 0,
      heading: 0,
      target: 0,
      driver: null,
      standing: false,
      fixed: false,
    },
    step: {
      get state() {
        return present.actor.recovery;
      },
      input: IDLE,
      steering,
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

/**
 * One fixed step of a present vehicle under `input` and the steering rule `steering` of whoever drives it: its ordinary mechanics with recovery, from its position at the
 * step's start (`previous`). It records whether the step recovered it, so contacts sweep nothing to a recovered place;
 * every other recovery placement (a return to the legal road, a manual recovery) records it the same way.
 */
export function advancePresentVehicle(
  world: VehicleWorld,
  body: PresentVehicle,
  input: DrivingInput,
  steering: DriverSteering,
): void {
  const { previous, vehicle } = body;
  previous.s = vehicle.course.s;
  previous.l = vehicle.course.l;
  body.step.input = input;
  body.step.steering = steering;
  const response = body.actor.contactResponse;
  if (contactResponseStopped(response)) {
    body.step.input = IDLE;
    updateVehicle(world, vehicle, body.model, IDLE, steering, true);
    body.recovered = advanceContactResponse(response, body.model.step, () =>
      recoverVehicle(world, vehicle, body.model, {
        state: body.actor.recovery,
        place: body.step.place,
        reason: 'explosion',
      }),
    );
    return;
  }
  advanceContactResponse(response, body.model.step, () => false);
  body.recovered = advanceVehicleWithRecovery(world, vehicle, body.model, body.step) !== null;
}
