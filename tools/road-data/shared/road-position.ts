/**
 * A road position's length, as every original's displayed speed and clock give it
 * ([Original road data](../../../docs/original-road-data.md#rules-of-the-originals)).
 */

/**
 * One road position in metres: a speed unit the original shows as `kmh` km/h gains the road `gain` positions a tick of
 * `tick` seconds.
 */
export const metresAPosition = (kmh: number, tick: number, gain: number) => (kmh * tick) / (3.6 * gain);
