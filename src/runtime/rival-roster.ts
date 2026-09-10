import type { SessionConfiguration } from '../gameplay/session-configuration.js';

export interface RivalRosterEntry {
  readonly actorId: string;
  readonly rivalIndex: number;
}

/**
 * Compile stable actor identities for the session-selected rival cardinality.
 *
 * This layer intentionally owns no vehicle physics, spawn geometry, route plan, renderer state or
 * camera logic. Those remain consumers of the roster. A zero-rival session therefore produces an
 * empty array rather than a special-case null rival.
 */
export function createRivalRoster(session: SessionConfiguration): readonly RivalRosterEntry[] {
  const entries = Array.from({ length: session.rivalCount }, (_, rivalIndex) =>
    Object.freeze({
      actorId: `RIVAL_${String(rivalIndex + 1).padStart(2, '0')}`,
      rivalIndex,
    }),
  );
  return Object.freeze(entries);
}
