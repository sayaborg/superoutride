import { mix } from './rival-exit.js';
import type { ResolvedTraffic, TrafficCandidate } from './course-session.js';
import type { createCourseForkField } from './course-fork-field.js';
import type { LaneIntent } from './lane-following.js';
import type { createLaneDriving } from './lane-driving.js';
import type { createVehiclePlacement } from './vehicle-placement.js';
import { createEnvelopeDriverWorkspace } from './envelope-driver.js';
import { advanceVehicleWithRecovery, createRecoveryState } from './recovery.js';
import { createPresentVehicle, type PresentVehicle, type VehicleDriving } from './present-vehicle.js';
import {
  createCompetitorObservation,
  writeCompetitorObservation,
  type CompetitorObservation,
} from './competitor-observation.js';
import { createVehicle } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
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

/** One traffic vehicle: a present vehicle its driver always drives, and its observation. */
export interface TrafficMotion extends PresentVehicle {
  readonly driving: VehicleDriving;
  readonly observation: CompetitorObservation;
}

/**
 * The Session's traffic: it appears at its positions as the appearance line, the farthest rendered station ahead of
 * the player, reaches them, at most `limit` at once, drives as rivals do and leaves once out of view. It shares the
 * Route, the vehicle models, placement and the drivers' lane decisions with the competitors, and reads the player's
 * view (`appearanceLine`, `outOfView`).
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
  readonly forks: ReturnType<typeof createCourseForkField>;
  readonly modelOf: (vehicle: TrafficCandidate['vehicle']) => VehicleModel;
  readonly placement: ReturnType<typeof createVehiclePlacement>;
  readonly laneDriving: ReturnType<typeof createLaneDriving>;
  readonly view: { readonly appearanceLine: () => number; readonly outOfView: (s: number) => boolean };
  readonly simulationSeconds: () => number;
}) {
  const { runtime, forks, modelOf, placement, laneDriving, seed } = options;
  const { appearanceLine, outOfView } = options.view;
  const vehicles: TrafficMotion[] = [];
  const positions = options.traffic && createTrafficPositions(options.traffic, seed, appearanceLine());
  return Object.freeze({
    /** The traffic present, in order of appearance. */
    vehicles: vehicles as readonly TrafficMotion[],
    /** One step of every traffic vehicle: its driver's input, ordinary mechanics with recovery, then the legal road. */
    advance() {
      for (const motion of vehicles) {
        motion.step.input = laneDriving.drive(motion);
        motion.previous.s = motion.vehicle.course.s;
        motion.previous.l = motion.vehicle.course.l;
        advanceVehicleWithRecovery(runtime.readers, motion.vehicle, motion.model, motion.step);
        placement.legalRecovery(motion);
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
        // vehicle behind whose driver does not pass could not stop for it.
        if (vehicles.length >= options.limit || !runtime.window.at(s)) return;
        const candidate = candidates[trafficDraw(seed, 'vehicle', position, candidates.length)]!;
        const model = modelOf(candidate.vehicle);
        const intent: LaneIntent = {
          lane: 0,
          ordinal: 0,
          exit: (occurrence) =>
            trafficDraw(seed, 'exit', position, occurrence.section.fork!.exits.length, occurrence.ordinal),
        };
        const appearing = forks.targetCarriageway(s, intent.exit);
        intent.lane = trafficDraw(seed, 'lane', position, appearing.road.lanes);
        intent.ordinal = appearing.occurrence.ordinal;
        const lane = (station: number) => forks.targetL(station, intent);
        const l = lane(s);
        if (placement.occupied(model, s, l)) return;
        const speed = placement.appearanceSpeed(model, s, intent, candidate.driver);
        if (speed === null) return;
        const vehicle = createVehicle(model, runtime.readers, { s, l, initialSpeed: speed });
        const id = `TRAFFIC_${String(position + 1).padStart(4, '0')}`;
        const color = candidate.colors[trafficDraw(seed, 'color', position, candidate.colors.length)]!;
        const driving = {
          driver: candidate.driver,
          intent,
          workspace: createEnvelopeDriverWorkspace(),
          target: lane,
        };
        const motion: TrafficMotion = Object.assign(
          createPresentVehicle(
            id,
            { vehicle, model, recovery: createRecoveryState(vehicle) },
            driving,
            (self, station) => placement.vacantPlace(self, station, (at) => forks.recoveryL(at, intent)),
          ),
          {
            driving,
            observation: createCompetitorObservation(
              id,
              candidate.vehicle.vehicleDefinition.compiledVehicle.id,
              color,
              candidate.vehicle.vehicleDefinition.form,
            ),
          },
        );
        vehicles.push(motion);
        writeCompetitorObservation(motion.observation, vehicle, model, motion.step.input, options.simulationSeconds());
        changed = true;
      });
      return changed;
    },
  });
}
