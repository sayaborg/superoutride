import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import { SIM_DT } from './fixed-step.js';
import { PLANNED_DRIVER } from './planned-driver.js';

/**
 * The AI's safety net, a driver's rule (K, 2026-11-13 and 2026-11-15): a driver asks for the player's manual recovery,
 * whatever holds its vehicle, when the vehicle has stood below the speed deadzone for `standingSeconds` of counted
 * steps, or has gone `progressSeconds` of counted steps without passing the farthest route station it has reached.
 * The two counts are separate, and either asks. Its record is the driver's, kept from one step to the next.
 */
export interface SafetyNet {
  /** Consecutive counted steps the vehicle has stood. */
  standing: number;
  /** The farthest route station the vehicle has reached on this drive; where a recovery places it, that station. */
  farthest: number;
  /** Consecutive counted steps the vehicle has not passed `farthest`. */
  behind: number;
}

/** A driver's safety net before its first counted step. */
export const createSafetyNet = (): SafetyNet => ({ standing: 0, farthest: -Infinity, behind: 0 });

/** One step of a driven vehicle, as the safety net reads it. */
export interface SafetyNetStep {
  /** Whether the step runs: not READY, not after the run ends. */
  readonly running: boolean;
  /** Whether the step recovered the vehicle. */
  readonly recovered: boolean;
  /** Whether the vehicle explodes, which its explosion's recovery ends. */
  readonly exploding: boolean;
  /** The route station of its driver's plan's terminal. */
  readonly terminal: number;
}

/**
 * Counts one step of `vehicle`, after it moved; true when its driver asks for the manual recovery. Only running steps
 * count: a recovered vehicle's counts start again from where it was placed, an exploding vehicle's progress count
 * holds, and a vehicle at its plan's terminal (within `terminalClearance` and a cell of it: the road's end, a lane's
 * end it waits to merge at, the takeover's stop) waits by design, so neither count runs. With no free place behind it,
 * a driver that asked asks again the next step, its counts still full.
 */
export function countSafetyNet(
  net: SafetyNet,
  vehicle: VehicleState,
  step: SafetyNetStep,
  progressSeconds: number = PLANNED_DRIVER.progressSeconds,
): boolean {
  const { s } = vehicle.course;
  const { terminalClearance, spacing, speedDeadzone, standingSeconds } = PLANNED_DRIVER;
  if (step.recovered) {
    placeSafetyNet(net, s);
    return false;
  }
  if (!step.running || step.exploding || step.terminal - s <= terminalClearance + spacing) {
    net.standing = 0;
    if (step.running && !step.exploding) [net.farthest, net.behind] = [Math.max(net.farthest, s), 0];
    return false;
  }
  net.standing = Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed) < speedDeadzone ? net.standing + 1 : 0;
  if (s > net.farthest) [net.farthest, net.behind] = [s, 0];
  else net.behind += 1;
  return net.standing >= Math.round(standingSeconds / SIM_DT) || net.behind >= Math.round(progressSeconds / SIM_DT);
}

/** A recovery placed the vehicle at route station `s`: its farthest point is there, and its counts start again. */
export function placeSafetyNet(net: SafetyNet, s: number): void {
  net.standing = net.behind = 0;
  net.farthest = s;
}
