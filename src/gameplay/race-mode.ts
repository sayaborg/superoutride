import type { SharedRouteChoiceMode } from './shared-route-choice-authority.js';

/** Current product field-size cap. It belongs to mode/roster authoring, not route or renderer Core. */
export const CURRENT_RIVAL_COUNT_CAP = 16;

export interface RaceModeDefinition {
  readonly id: string;
  readonly rivalCount: number;
  readonly sharedRouteChoiceMode: SharedRouteChoiceMode;
}

export interface OpponentRosterSlot {
  readonly actorId: string;
  readonly rosterIndex: number;
}

export interface CompiledRaceMode {
  readonly id: string;
  readonly rivalCount: number;
  readonly sharedRouteChoiceMode: SharedRouteChoiceMode;
  readonly opponents: readonly OpponentRosterSlot[];
}

/**
 * Compile the small piece of game-mode authority that determines field cardinality and
 * optional shared-route policy.
 *
 * Vehicle physics, AI skill, spawn geometry, route intent and rendering deliberately remain
 * outside this layer. `CURRENT_RIVAL_COUNT_CAP` is therefore replaceable without touching
 * generic multi-actor route arbitration or Renderer Core.
 */
export function compileRaceMode(definition: RaceModeDefinition): CompiledRaceMode {
  const id = definition.id.trim();
  if (id.length === 0) throw new RangeError('race mode id must be non-empty');
  if (!Number.isInteger(definition.rivalCount)) {
    throw new RangeError('race mode rivalCount must be an integer');
  }
  if (definition.rivalCount < 0 || definition.rivalCount > CURRENT_RIVAL_COUNT_CAP) {
    throw new RangeError(`race mode rivalCount must be in 0..${CURRENT_RIVAL_COUNT_CAP}`);
  }
  if (
    definition.sharedRouteChoiceMode !== 'INDEPENDENT'
    && definition.sharedRouteChoiceMode !== 'FIRST_PHYSICAL_CROSSING_LOCKS'
  ) {
    const exhaustive: never = definition.sharedRouteChoiceMode;
    throw new RangeError(`unsupported shared route choice mode: ${String(exhaustive)}`);
  }

  const opponents = Array.from({ length: definition.rivalCount }, (_, rosterIndex) => Object.freeze({
    actorId: `RIVAL_${String(rosterIndex + 1).padStart(2, '0')}`,
    rosterIndex,
  }));

  return Object.freeze({
    id,
    rivalCount: definition.rivalCount,
    sharedRouteChoiceMode: definition.sharedRouteChoiceMode,
    opponents: Object.freeze(opponents),
  });
}
