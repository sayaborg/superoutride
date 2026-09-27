/** One 32-bit integer avalanche step; integer arithmetic only, so every runtime computes the same value. */
function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A rival's target exit at a fork occurrence: hash(seed, rival index, occurrence ordinal) mod exit count. */
export function rivalExit(seed: number, rivalIndex: number, ordinal: number, exitCount: number): number {
  return mix(mix(mix(seed ^ 0x9e3779b9) ^ rivalIndex) ^ ordinal) % exitCount;
}
