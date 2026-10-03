import { mix } from './rival-exit.js';
import type { ResolvedTraffic } from './course-session.js';

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
