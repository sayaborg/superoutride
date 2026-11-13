import { clamp } from '../core/math.js';
import type { CompiledDriving } from '../vehicle/physics/compiled-driving.js';

type RivalRole = CompiledDriving['roles']['rival'];

/**
 * A rival's target utilization at `lead` metres ahead of the player (negative behind): its level utilization level
 * with the player, the least as far ahead as the span and beyond, the most as far behind and beyond, straight between.
 */
export function rivalTargetUtilization(role: RivalRole, lead: number): number {
  const t = clamp(lead / role.spanMeters, -1, 1);
  return t >= 0
    ? role.utilization + (role.leastUtilization - role.utilization) * t
    : role.utilization + (role.mostUtilization - role.utilization) * -t;
}

/**
 * A rival's pace (K, 2026-11-12): its utilization starts at its level and follows its target utilization at its lead
 * over the player (`rivalTargetUtilization`) with the role's response time constant, one fixed step at a time. It reads
 * the lead alone: nothing of the player's vehicle, speed or input, and no schedule.
 */
export function createRivalPace(role: RivalRole, stepSeconds: number) {
  const response = 1 - Math.exp(-stepSeconds / role.responseSeconds);
  let utilization = role.utilization;
  return Object.freeze({
    get utilization() {
      return utilization;
    },
    /** One step's response to its lead over the player, metres along the Route (laps included). */
    update(lead: number) {
      utilization += (rivalTargetUtilization(role, lead) - utilization) * response;
    },
  });
}
