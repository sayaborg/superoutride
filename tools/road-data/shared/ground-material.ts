/**
 * The ground's material by its color ([The ground beside the road](../../../docs/original-road-data.md#the-ground-beside-the-road)).
 */

/**
 * The ground's material beyond the road, by its color in the ROM (RGB555): `GRASS` where green is its strongest channel,
 * `WATER` where blue is, `SAND` otherwise (K, 2026-11-01).
 */
export function groundMaterial(rgb555: number): 'GRASS' | 'WATER' | 'SAND' {
  const [r, g, b] = [(rgb555 >> 10) & 31, (rgb555 >> 5) & 31, rgb555 & 31];
  return g > r && g > b ? 'GRASS' : b > r && b > g ? 'WATER' : 'SAND';
}
