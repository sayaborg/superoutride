import type { CourseModeProfile } from '../gameplay/course-mode.js';

export interface RivalRosterEntry {
  readonly actorId: string;
  readonly rivalIndex: number;
}

/**
 * Compile stable actor identities for the mode-selected rival cardinality.
 *
 * This layer intentionally owns no vehicle physics, spawn geometry, route plan, renderer state or
 * camera logic. Those remain consumers of the roster. A zero-rival mode therefore produces an
 * empty array rather than a special-case null rival.
 */
export function createRivalRoster(mode: CourseModeProfile): readonly RivalRosterEntry[] {
  const entries = Array.from({ length: mode.rivalCount }, (_, rivalIndex) => Object.freeze({
    actorId: `RIVAL_${String(rivalIndex + 1).padStart(2, '0')}`,
    rivalIndex,
  }));
  return Object.freeze(entries);
}
