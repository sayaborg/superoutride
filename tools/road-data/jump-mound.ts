import { VEHICLE_GRAVITY } from '../../src/vehicle/physics/vehicle-state.js';
import type { Kink } from './road-profile.js';

/**
 * A jump's mound ([Original road data](../../docs/original-road-data.md#profile), Jumps): metres either side of its
 * top, and its height.
 */
export interface Mound {
  readonly half: number;
  readonly height: number;
}

/**
 * The mound that throws a point mass as the original throws its vehicle (K, 2026-10-25): leaving its top along its
 * rising side at the original's top speed `speed`, metres a second, under this game's gravity, the mass comes down at
 * the end of its falling side after the original's flight `seconds`. Its slope θ has sin θ = g T / (4 v), its half is
 * the flight's distance v T cos θ, its height v T sin θ.
 */
export function moundOf(speed: number, seconds: number): Mound {
  const sin = (VEHICLE_GRAVITY * seconds) / (4 * speed);
  if (!(sin > 0 && sin < 1)) throw new RangeError(`No mound throws a mass at ${speed} m/s for ${seconds} s`);
  const round = (value: number) => Number(value.toFixed(6));
  return {
    half: round(speed * seconds * Math.sqrt(1 - sin * sin)),
    height: round(speed * seconds * sin),
  };
}

/**
 * The kinks of `mound`s with their tops at stations `tops`: the grade kinked up at a foot, down over a top and back at
 * an end. Where two overlap the higher of them is taken, kinked up again where their sides meet halfway between their
 * tops. Also how many runs of overlapping mounds there are, how many mounds they join and the longest run's length,
 * metres.
 */
export function moundKinks(tops: readonly number[], mound: Mound) {
  const { half, height } = mound;
  const slope = height / half;
  const sorted = [...new Set(tops)].sort((a, b) => a - b);
  const kinks: Kink[] = [];
  const runs: number[][] = [];
  for (const top of sorted) {
    const run = runs.at(-1);
    if (run && top - run.at(-1)! < 2 * half) run.push(top);
    else runs.push([top]);
  }
  for (const run of runs) {
    kinks.push({ at: run[0]! - half, change: slope });
    run.forEach((top, i) => {
      if (i > 0) kinks.push({ at: (run[i - 1]! + top) / 2, change: 2 * slope });
      kinks.push({ at: top, change: -2 * slope });
    });
    kinks.push({ at: run.at(-1)! + half, change: slope });
  }
  const joined = runs.filter((run) => run.length > 1);
  return {
    kinks,
    runs: joined.length,
    joined: joined.reduce((n, run) => n + run.length, 0),
    longest: Math.max(...runs.map((run) => run.at(-1)! - run[0]! + 2 * half)),
  };
}
