import type { GuideCompileOptions } from '../core/guide-curve.js';
import {
  compileCircuitRaceRules,
  type CircuitRaceAuthoring,
  type CircuitRaceRules,
} from '../gameplay/circuit-race-progress.js';
import type { CircuitTopology } from '../gameplay/circuit-topology.js';
import {
  compileCircuitRuntimeWindow,
  type CircuitLapRuntimeSources,
  type CircuitRuntimeWindow,
} from './circuit-runtime-window.js';

/**
 * Complete finite-open runtime authority required to drive one CIRCUIT race.
 *
 * The integration rule is deliberately tiny: an N-lap race owns N+1 runtime
 * copies, so every scored FINISH is an ordinary internal seam and one full
 * unscored lookahead lap remains after race completion.
 */
export interface CircuitLiveRuntime {
  readonly window: CircuitRuntimeWindow;
  readonly raceRules: CircuitRaceRules;
}

/**
 * Compile topology + one-lap sources + race authoring into one ordinary finite
 * open runtime package. Renderer, camera and vehicle physics are intentionally
 * absent: they consume `window` through their existing open contracts.
 */
export function compileCircuitLiveRuntime(
  topology: CircuitTopology,
  startWinding: number,
  guideOptions: GuideCompileOptions,
  sources: CircuitLapRuntimeSources,
  raceAuthoring: CircuitRaceAuthoring,
): CircuitLiveRuntime {
  const window = compileCircuitRuntimeWindow(
    topology,
    startWinding,
    raceAuthoring.lapCount + 1,
    guideOptions,
    sources,
  );
  const raceRules = compileCircuitRaceRules(window, raceAuthoring);
  return Object.freeze({ window, raceRules });
}
