import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import { mix } from './rival-exit.js';
import type { FreePlayRules, RivalPoolRule } from '../content/free-play-rules.js';

/** A vehicle in one of its colors. */
export interface VehicleColor {
  readonly vehicle: string;
  readonly color: string;
}

/** The pool of the vehicle's form alone: the FREE PLAY default. FREE PLAY admission guarantees one. */
export function formPool(rules: FreePlayRules, vehicle: CompiledVehicleDefinition): RivalPoolRule {
  return rules.rivalPools.find((pool) => pool.forms.length === 1 && pool.forms[0] === vehicle.listing.form)!;
}

/** Every vehicle/color pair of the pool, in catalog order. */
export function rivalPoolPairs(
  vehicles: readonly CompiledVehicleDefinition[],
  pool: RivalPoolRule,
): readonly VehicleColor[] {
  return Object.freeze(
    vehicles
      .filter((vehicle) => pool.forms.includes(vehicle.listing.form))
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
