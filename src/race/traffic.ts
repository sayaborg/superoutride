import { mix } from './rival-exit.js';
import type { ResolvedTraffic, TrafficCandidate } from './course-session.js';
import type { DriverIntent, TargetCarriageway } from './course-fork-field.js';
import type { LaneIntent } from './lane-following.js';
import { createEnvelopeDriverWorkspace, type EnvelopeDriver } from './envelope-driver.js';
import {
  advanceVehicleWithRecovery,
  createRecoveryState,
  type RecoveryState,
  type RecoveryTarget,
} from './recovery.js';
import {
  createCompetitorObservation,
  writeCompetitorObservation,
  type CompetitorObservation,
} from './competitor-observation.js';
import { createVehicle, type VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';

/** Salts separating the Session seed's traffic draws: the position offset and, per position, vehicle, color, lane, exits. */
const TRAFFIC_SALTS = Object.freeze({
  offset: 0x7f4a7c15,
  vehicle: 0x632be5ab,
  color: 0x9e3779b1,
  lane: 0x85ebca77,
  exit: 0xc2b2ae3d,
});
/** The 32-bit hash range, mapping a hash to [0, 1). */
const HASH_RANGE = 2 ** 32;

/** A draw for traffic position `position` from the Session seed: an integer in [0, count). */
export function trafficDraw(
  seed: number,
  kind: Exclude<keyof typeof TRAFFIC_SALTS, 'offset'>,
  position: number,
  count: number,
  ordinal = 0,
): number {
  return mix(mix(mix(seed ^ TRAFFIC_SALTS[kind]) ^ position) ^ ordinal) % count;
}

/**
 * The Session's traffic positions on the Route: stations `offset + k × spacing` (k = 0, 1, …) with the offset in
 * [0, spacing) drawn from the Session seed. `pass(line, visit)` visits, in order, each position the appearance line
 * has reached since the previous call; positions at or before the line at creation are never visited.
 */
export function createTrafficPositions(traffic: ResolvedTraffic, seed: number, startLine: number) {
  const { spacing } = traffic;
  const offset = (mix(seed ^ TRAFFIC_SALTS.offset) / HASH_RANGE) * spacing;
  let next = Math.max(0, Math.floor((startLine - offset) / spacing) + 1);
  return Object.freeze({
    pass(line: number, visit: (position: number, s: number) => void) {
      for (let s = offset + next * spacing; s <= line; s = offset + next * spacing) visit(next++, s);
    },
  });
}

/** A present vehicle as contacts and placement read it: its live state and model. */
export interface TrafficBody {
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
}

/** One traffic vehicle: its mechanics, recovery and driver, its sighting and contact force, and its observation. */
export interface TrafficMotion extends TrafficBody {
  readonly id: string;
  readonly intent: LaneIntent;
  readonly driver: EnvelopeDriver;
  /** Its driver's planning braking (m/s²). */
  readonly braking: number;
  readonly driverWorkspace: ReturnType<typeof createEnvelopeDriverWorkspace>;
  input: (s: number) => number;
  readonly contactForce: { x: number; y: number; z: number };
  readonly sighting: { s: number; l: number; length: number; width: number; speed: number; target: number };
  readonly step: {
    readonly state: RecoveryState;
    input: DrivingInput;
    readonly place: (s: number) => RecoveryTarget;
    readonly externalForce: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly observation: CompetitorObservation;
}

/**
 * The Session's traffic: it appears at its positions as the appearance line, the farthest rendered station ahead of
 * the player, reaches them, at most `limit` at once, drives as rivals do and leaves once out of view. The race supplies
 * the Route, placement and driving it shares with competitors.
 */
export function createTrafficField(options: {
  readonly traffic: ResolvedTraffic | null;
  readonly seed: number;
  readonly limit: number;
  readonly runtime: {
    readonly readers: VehicleWorld & { readonly coordinates: PlanCoordinateReader };
    readonly window: {
      readonly start: number;
      readonly end: number;
      readonly terminal: number | null;
      at(s: number): unknown;
    };
  };
  readonly forks: {
    targetL(s: number, intent: DriverIntent): number;
    targetCarriageway(s: number, exit: DriverIntent['exit']): TargetCarriageway;
    recoveryL(s: number, intent: DriverIntent | null): number;
  };
  readonly modelOf: (vehicle: TrafficCandidate['vehicle']) => VehicleModel;
  readonly occupant: (model: VehicleModel, s: number, l: number) => TrafficBody | null;
  readonly vacantPlace: (self: TrafficMotion, s: number, lane: (s: number) => number) => RecoveryTarget;
  /** How fast a vehicle appears at (s, lane(s)) under its driver; null when it cannot appear there now. */
  readonly appearanceSpeed: (
    model: VehicleModel,
    s: number,
    lane: (s: number) => number,
    driver: EnvelopeDriver,
  ) => number | null;
  readonly appearanceLine: () => number;
  readonly outOfView: (s: number) => boolean;
  readonly simulationSeconds: () => number;
  readonly idle: DrivingInput;
}) {
  const { runtime, forks, modelOf, occupant, vacantPlace, appearanceSpeed, appearanceLine, outOfView, idle, seed } =
    options;
  const vehicles: TrafficMotion[] = [];
  const positions = options.traffic && createTrafficPositions(options.traffic, seed, appearanceLine());
  return Object.freeze({
    /** The traffic present, in order of appearance. */
    vehicles: vehicles as readonly TrafficMotion[],
    /** One step of every traffic vehicle: its driver's input, ordinary mechanics with recovery, then the legal road. */
    advance(
      drive: (motion: TrafficMotion, intent: LaneIntent, driver: EnvelopeDriver) => DrivingInput,
      legalRecovery: (motion: TrafficMotion) => boolean,
    ) {
      for (const motion of vehicles) {
        motion.step.input = drive(motion, motion.intent, motion.driver);
        advanceVehicleWithRecovery(runtime.readers, motion.vehicle, motion.model, motion.step);
        legalRecovery(motion);
      }
    },
    /** Traffic out of view leaves, then the positions the appearance line reached appear; true when either changed. */
    update(): boolean {
      if (!positions) return false;
      const before = vehicles.length;
      for (let i = vehicles.length - 1; i >= 0; i -= 1)
        if (outOfView(vehicles[i]!.vehicle.course.s)) vehicles.splice(i, 1);
      let changed = vehicles.length !== before;
      const { candidates } = options.traffic!;
      positions.pass(appearanceLine(), (position, s) => {
        // A position passes unused when the traffic is full, the Route does not reach it yet, its place is occupied or a
        // vehicle behind could not stop for it.
        if (vehicles.length >= options.limit || !runtime.window.at(s)) return;
        const candidate = candidates[trafficDraw(seed, 'vehicle', position, candidates.length)]!;
        const model = modelOf(candidate.vehicle);
        const intent: LaneIntent = {
          lane: 0,
          exit: (occurrence) =>
            trafficDraw(seed, 'exit', position, occurrence.section.fork!.exits.length, occurrence.ordinal),
        };
        intent.lane = trafficDraw(seed, 'lane', position, forks.targetCarriageway(s, intent.exit).road.lanes);
        const lane = (station: number) => forks.targetL(station, intent);
        const l = lane(s);
        if (occupant(model, s, l)) return;
        const speed = appearanceSpeed(model, s, lane, candidate.driver);
        if (speed === null) return;
        const vehicle = createVehicle(model, runtime.readers, { s, l, initialSpeed: speed });
        const contactForce = { x: 0, y: 0, z: 0 };
        const id = `TRAFFIC_${String(position + 1).padStart(4, '0')}`;
        const color = candidate.colors[trafficDraw(seed, 'color', position, candidate.colors.length)]!;
        const motion: TrafficMotion = {
          id,
          vehicle,
          model,
          intent,
          driver: candidate.driver,
          braking: candidate.driver.braking,
          driverWorkspace: createEnvelopeDriverWorkspace(),
          input: lane,
          contactForce,
          sighting: { s: 0, l: 0, length: 0, width: 0, speed: 0, target: 0 },
          step: {
            state: createRecoveryState(vehicle),
            input: idle,
            place: (station: number) => vacantPlace(motion, station, (at) => forks.recoveryL(at, intent)),
            externalForce: contactForce,
          },
          observation: createCompetitorObservation(
            id,
            candidate.vehicle.vehicleDefinition.compiledVehicle.id,
            color,
            candidate.vehicle.vehicleDefinition.form,
          ),
        };
        vehicles.push(motion);
        writeCompetitorObservation(motion.observation, vehicle, model, idle, options.simulationSeconds());
        changed = true;
      });
      return changed;
    },
  });
}
