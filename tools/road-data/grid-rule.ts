import type { Lateral } from '../../src/course/course-document.js';
import { RUN_RULE_LIMITS } from '../../src/course/run-rules.js';
import { laneCentre } from './section-writing.js';

/** The slots the rule makes stand this far apart, metres, for cars and for bikes (K, 2026-10-25). */
export const GRID_SPACING = Object.freeze({ car: 12, bike: 3 });

/** A grid slot as a conversion places it: its station in the entry Section, metres, and its lateral. */
export interface GridPlace {
  readonly s: number;
  readonly lateral: Lateral;
}

/**
 * A grid by the rule ([Original road data](../../docs/original-road-data.md#the-grid)), front to back, as many slots as
 * a run's competitors: the player's slot `player`, the original's own slots `originals` as they are, and the rest
 * forward of the frontmost of these `spacing` apart, the slots counted on from the player's, the original's among them,
 * the first at the centre of `lanes`' left lane, the second at its right's, alternating.
 */
export function ruleGrid(
  player: GridPlace,
  originals: readonly GridPlace[],
  spacing: number,
  lanes: readonly [left: string, right: string],
): GridPlace[] {
  const front = Math.max(player.s, ...originals.map((place) => place.s));
  const made = Array.from({ length: RUN_RULE_LIMITS.competitors - 1 - originals.length }, (_, j) => ({
    s: front + (j + 1) * spacing,
    lateral: laneCentre(lanes[(originals.length + j) % 2]!),
  }));
  return [...made.reverse(), ...[...originals].sort((a, b) => b.s - a.s), player];
}
