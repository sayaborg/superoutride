import type { VehicleDrivingRead } from '../vehicle/physics/vehicle-contract.js';
import type { VehicleLimits } from '../vehicle/vehicle-limits.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import {
  compilePlannedDriver,
  createPlannedCornering,
  createPlannedDriverWorkspace,
  plannedSpeedAhead,
  readRoadAhead,
  type DriverRoad,
  type DrivingDomain,
} from './planned-driver.js';

/**
 * SLOW DOWN ([Browser](../../docs/browser.md#slow-down)): the player's vehicle planned as a driver at each of
 * `utilizations` (its stages, ascending: the owner's values, which DEV changes) along the path that keeps its lateral,
 * read in steps of `lateralResolution` metres so that the plan's cells are reused while the lateral holds. Its stage is
 * the highest whose plan's speed `aheadSeconds` of its speed ahead its speed exceeds. The red stage blinks, shown and
 * hidden for `blinkSteps` fixed steps each, and a stage holds at least one blink period before it falls.
 */
export const SLOW_DOWN = Object.freeze({
  utilizations: Object.freeze([0.85, 0.9, 0.95]) as SlowDownUtilizations,
  aheadSeconds: 0.5,
  lateralResolution: 0.25,
  blinkSteps: 8,
});
/** The utilizations of the yellow, orange and red stages, ascending. */
export type SlowDownUtilizations = readonly [number, number, number];
/** A SLOW DOWN stage: 0 when it does not show, else 1 to 3, the yellow, orange and red stages. */
export type SlowDownStage = 0 | 1 | 2 | 3;
/** Fixed steps a stage holds at least before it falls or goes out: one blink period. */
const HOLD_STEPS = 2 * SLOW_DOWN.blinkSteps;

/**
 * The player's SLOW DOWN warning over the race's road and planning domain, for the player vehicle's mechanics, its
 * stages at `utilizations`. The plans share the road's cells and keep their cornering speeds apart.
 */
export function createSlowDown(
  road: DriverRoad,
  domain: DrivingDomain,
  mechanics: { readonly model: VehicleModel; readonly limits: VehicleLimits; readonly speedCap: number },
  utilizations: SlowDownUtilizations = SLOW_DOWN.utilizations,
) {
  const { aheadSeconds, lateralResolution } = SLOW_DOWN;
  const stages = utilizations.map((utilization) => ({
    driver: compilePlannedDriver(mechanics.model, mechanics.limits, utilization, mechanics.speedCap, false),
    cornering: createPlannedCornering(),
  }));
  const workspace = createPlannedDriverWorkspace();
  let stage: SlowDownStage = 0,
    held = 0;
  return {
    /** The stage after the latest step. */
    get stage() {
      return stage;
    },
    /**
     * Decide the stage after a step: 0 unless the player's own input drives the vehicle while the run is running, and 0
     * while neither tire is loaded (in flight). Otherwise a higher stage shows at once, and a lower one once the shown
     * stage has held for a blink period.
     */
    update(vehicle: VehicleDrivingRead, driving: boolean) {
      if (!driving || (vehicle.tires.front.load === 0 && vehicle.tires.rear.load === 0)) {
        stage = 0;
        held = 0;
        return;
      }
      const lateral = Math.round(vehicle.course.l / lateralResolution) * lateralResolution;
      const speed = Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed);
      readRoadAhead(road, vehicle, lateral, workspace, domain);
      // The highest stage exceeded, from the top: a stage's plan is read only while no higher one is exceeded.
      let next: SlowDownStage = 0;
      for (let k = stages.length - 1; k >= 0 && next === 0; k--) {
        const { driver, cornering } = stages[k]!;
        if (speed > plannedSpeedAhead(driver, workspace, cornering, domain, speed, speed * aheadSeconds))
          next = (k + 1) as SlowDownStage;
      }
      held++;
      if (next > stage || (next < stage && held >= HOLD_STEPS)) {
        stage = next;
        held = 0;
      }
    },
  };
}
