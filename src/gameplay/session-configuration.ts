/** Opponents only; the player is not included. No course structure or topology is duplicated here. */
export interface SessionConfiguration {
  readonly rivalCount: number;
}

/** Current upper-level validation envelope, not a limit in generic actor processing. */
export const MAX_RIVAL_COUNT = 16;

export function compileSessionConfiguration(authoring: SessionConfiguration): Readonly<SessionConfiguration> {
  if (!Number.isInteger(authoring.rivalCount) || authoring.rivalCount < 0 || authoring.rivalCount > MAX_RIVAL_COUNT) {
    throw new RangeError(`session rivalCount must be an integer within 0..${MAX_RIVAL_COUNT}`);
  }
  return Object.freeze({ rivalCount: authoring.rivalCount });
}
