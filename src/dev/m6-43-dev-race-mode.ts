import { compileRaceMode } from '../gameplay/race-mode.js';

/**
 * Current browser fixture. Product modes may select a different opponent count and route policy.
 * Keeping one DEV opponent here preserves the current visual demo while the runtime is generalized.
 */
export const M6_43_DEV_RACE_MODE = compileRaceMode({
  id: 'DEV_CURRENT',
  rivalCount: 1,
  sharedRouteChoiceMode: 'INDEPENDENT',
});
