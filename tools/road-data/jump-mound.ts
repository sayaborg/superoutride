import { VEHICLE_GRAVITY } from '../../src/vehicle/physics/vehicle-state.js';
import type { Kink } from './road-profile.js';

/**
 * A jump's mound ([Original road data](../../docs/original-road-data.md#profile), Jumps and humps): metres either side
 * of its top, and its height.
 */
export interface Mound {
  readonly half: number;
  readonly height: number;
}

/**
 * ENDURO RACER's jump ([Original road data](../../docs/original-road-data.md#profile), Jumps and humps): the mound a
 * point mass coming to it at `speed`, metres a second, slowed by climbing it under this game's gravity g, leaves along
 * its rising side and comes down on at the end of its falling side, `distance` metres on. Its slope θ, the shallowest
 * with sin 2θ = g D / (2 v²) at its top's speed v, v² = speed² − 2 g D tan θ; its half is D, its height D tan θ, with
 * the top's speed, metres a second. Null where no slope throws the mass that far.
 */
export function jumpMound(speed: number, distance: number): (Mound & { readonly topSpeed: number }) | null {
  const g = VEHICLE_GRAVITY;
  const lack = (theta: number) =>
    Math.sin(2 * theta) * 2 * (speed * speed - 2 * g * distance * Math.tan(theta)) - g * distance;
  // The first slope, in steps of a ten-thousandth of a radian, past which the mass flies far enough, then bisected.
  const STEP = 1e-4;
  for (let theta = STEP; theta <= Math.PI / 4; theta += STEP) {
    if (lack(theta) < 0) continue;
    let [low, high] = [theta - STEP, theta];
    for (let i = 0; i < 60; i++) {
      const middle = (low + high) / 2;
      if (lack(middle) < 0) low = middle;
      else high = middle;
    }
    const height = distance * Math.tan(high);
    return {
      half: distance,
      height: Number(height.toFixed(6)),
      topSpeed: Math.sqrt(speed * speed - 2 * g * height),
    };
  }
  return null;
}

/** A mound at station `top`. */
export interface PlacedMound extends Mound {
  readonly top: number;
}

/**
 * The kinks of `mounds`: each a triangle on the road, the grade kinked up at its foot, down over its top and back at
 * its end; where they overlap the highest of them is taken, kinked where their sides meet. Also how many runs of
 * overlapping mounds there are, how many mounds they join and the longest run's length, metres.
 */
export function moundKinks(mounds: readonly PlacedMound[]) {
  const sorted = [...mounds].sort((a, b) => a.top - b.top);
  const runs: PlacedMound[][] = [];
  for (const m of sorted) {
    const run = runs.at(-1);
    if (run && m.top - m.half < Math.max(...run.map((r) => r.top + r.half))) run.push(m);
    else runs.push([m]);
  }
  const kinks: Kink[] = [];
  for (const run of runs) {
    // The envelope's corners: the feet, the tops and where two mounds' sides cross.
    const corners = new Set(run.flatMap((m) => [m.top - m.half, m.top, m.top + m.half]));
    for (const a of run)
      for (const b of run)
        if (a.top < b.top) {
          // a's falling side meets b's rising side, halfway between their tops where they are alike.
          const [sa, sb] = [a.height / a.half, b.height / b.half];
          corners.add((a.top + b.top) / 2 + (a.height - b.height + ((sa - sb) * (a.top - b.top)) / 2) / (sa + sb));
        }
    const stations = [...corners].sort((p, q) => p - q);
    // Between two corners the grade is the side of the mound highest there, or level where none is.
    const above = (m: PlacedMound, s: number) => m.height * (1 - Math.abs(s - m.top) / m.half);
    const side = (s: number) => {
      const m = run.reduce((best, m) => (above(m, s) > above(best, s) ? m : best));
      return above(m, s) > 0 ? (Math.sign(m.top - s) * m.height) / m.half : 0;
    };
    let grade = 0;
    for (let i = 0; i + 1 < stations.length; i++) {
      const next = side((stations[i]! + stations[i + 1]!) / 2);
      if (next !== grade) kinks.push({ at: stations[i]!, change: next - grade });
      grade = next;
    }
    if (grade !== 0) kinks.push({ at: stations.at(-1)!, change: -grade });
  }
  const joined = runs.filter((run) => run.length > 1);
  return {
    kinks,
    runs: joined.length,
    joined: joined.reduce((n, run) => n + run.length, 0),
    longest: Math.max(
      0,
      ...runs.map((run) => Math.max(...run.map((m) => m.top + m.half)) - Math.min(...run.map((m) => m.top - m.half))),
    ),
  };
}
