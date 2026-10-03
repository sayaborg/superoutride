import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import { mix } from './rival-exit.js';

/** The FREE PLAY rival vehicle pools. */
export const RIVAL_POOLS = ['ALL', 'CARS', 'BIKES'] as const;
export type RivalPool = (typeof RIVAL_POOLS)[number];

/** The FREE PLAY TRAFFIC choices; OFF has none. */
export const FREE_PLAY_TRAFFIC_LEVELS = ['OFF', 'LOW', 'HIGH'] as const;
export type FreePlayTraffic = (typeof FREE_PLAY_TRAFFIC_LEVELS)[number];

/** FREE PLAY traffic is the same on every course: the levels' densities (vehicles/km), drawn from every vehicle. */
export const FREE_PLAY_TRAFFIC = Object.freeze({
  LOW: Object.freeze({ density: 5 }),
  HIGH: Object.freeze({ density: 30 }),
});
/** FREE PLAY traffic's one speed in km/h, at every level. */
export const FREE_PLAY_TRAFFIC_SPEED_KILOMETERS_PER_HOUR = 80;

/** A vehicle in one of its colors. */
export interface VehicleColor {
  readonly vehicle: string;
  readonly color: string;
}

/** The pool matching a vehicle's form: the FREE PLAY default. */
export function formPool(vehicle: CompiledVehicleDefinition): RivalPool {
  return vehicle.form === 'bike' ? 'BIKES' : 'CARS';
}

/** Every vehicle/color pair of the pool, in catalog order. */
export function rivalPoolPairs(
  vehicles: readonly CompiledVehicleDefinition[],
  pool: RivalPool,
): readonly VehicleColor[] {
  return Object.freeze(
    vehicles
      .filter((vehicle) => pool === 'ALL' || vehicle.form === (pool === 'BIKES' ? 'bike' : 'car'))
      .flatMap((vehicle) =>
        spriteSetColors(vehicle.spriteSet).map((color) =>
          Object.freeze({ vehicle: vehicle.compiledVehicle.id, color }),
        ),
      ),
  );
}

/**
 * Draws `count` rival vehicle/color pairs from `pairs` by the Session seed: a seeded shuffle of the pairs other than
 * the player's, repeated in that order only once every pair has been used. The player's pair is drawn only when
 * the pool holds nothing else.
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
  if (!order.length) throw new RangeError('The rival pool holds no vehicle');
  let h = mix(seed ^ 0x2545f491);
  for (let i = order.length - 1; i > 0; i -= 1) {
    h = mix(h ^ i);
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return Object.freeze(Array.from({ length: count }, (_, index) => order[index % order.length]!));
}
