import { SurfaceMap } from '../../physics/surface-map.js';
import { createStadiumEnvironment } from './stadium-environment.js';

/** Finite surface fixture shared by physics regressions. */
export function createMaterialTransitionSurfaceMap(courseLength: number): SurfaceMap {
  const compiled = createStadiumEnvironment(courseLength);
  return new SurfaceMap(courseLength, compiled.surfaceSections);
}
