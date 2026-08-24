import type { BakedGroundMapSample } from './baked-ground-map.js';

/**
 * Minimal runtime GroundMap contract consumed by the renderer.
 *
 * Compiler metadata and physical texel-center inspection intentionally do not
 * belong here. Concrete baked assets may expose those richer authoring/debug
 * facilities, while finite topology windows only need the runtime sampling
 * surface below.
 */
export interface GroundMapRuntimeReader {
  readonly kMax: number;
  selectLevel(deltaSEffective: number): number;
  sample(s: number, l: number, deltaSEffective: number): BakedGroundMapSample;
  sampleAtLevel(s: number, l: number, levelIndex: number): number;
}
