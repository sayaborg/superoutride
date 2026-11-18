import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import { mix } from './seed-mix.js';

/** A vehicle in one of its colors. */
export interface VehicleColor {
  readonly vehicle: string;
  readonly color: string;
}

/** The vehicle in each of its colors, in its sprite set's order. */
export function vehicleColors(vehicle: CompiledVehicleDefinition): readonly VehicleColor[] {
  return Object.freeze(
    spriteSetColors(vehicle.spriteSet).map((color) => Object.freeze({ vehicle: vehicle.compiledVehicle.id, color })),
  );
}

/**
 * Draws `count` rival vehicle/color pairs from `pairs` by the run seed: a seeded shuffle of the pairs other than
 * the player's, repeated in that order only once every pair has been used. The player's pair is drawn only when
 * `pairs` holds nothing else.
 */
export function drawRivalPairs(
  seed: number,
  count: number,
  pairs: readonly VehicleColor[],
  player: VehicleColor,
): readonly VehicleColor[] {
  if (count === 0) return Object.freeze([]);
  const others = pairs.filter((pair) => pair.vehicle !== player.vehicle || pair.color !== player.color);
  const order = [...(others.length ? others : pairs)];
  if (!order.length) throw new RangeError('No vehicle to draw rivals from');
  let h = mix(seed ^ 0x2545f491);
  for (let i = order.length - 1; i > 0; i -= 1) {
    h = mix(h ^ i);
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return Object.freeze(Array.from({ length: count }, (_, index) => order[index % order.length]!));
}
