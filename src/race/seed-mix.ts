/** One 32-bit integer avalanche step; integer arithmetic only, so every runtime computes the same value. */
export function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The salt of a run seed's afterfire draws. */
export const AFTERFIRE_SALT = 0x68e31da4;

/** A vehicle `id`'s own 32-bit word of a run's `seed` for the draws `salt` names: integer arithmetic alone. */
export function vehicleWord(seed: number, salt: number, id: string): number {
  let h = mix(seed ^ salt);
  for (let k = 0; k < id.length; k++) h = mix(h ^ id.charCodeAt(k));
  return h;
}
