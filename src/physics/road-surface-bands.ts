import type { RoadCrossSection } from '../course/road-cross-section.js';
import type { SurfaceBand } from './surface-map.js';

/** Compile geometry into ordered physical bands; inclusive shared edges retain left-band priority. */
export function roadSurfaceBands(
  road: RoadCrossSection,
  outside: {
    readonly left: number;
    readonly right: number;
    readonly leftType: SurfaceBand['type'];
    readonly rightType: SurfaceBand['type'];
  },
): readonly SurfaceBand[] {
  const leftShoulder = road.roadLeft + road.shoulderWidth;
  const rightShoulder = road.roadRight + road.shoulderWidth;
  if (
    !Number.isFinite(outside.left) ||
    !Number.isFinite(outside.right) ||
    outside.left < leftShoulder ||
    outside.right < rightShoulder
  )
    throw new RangeError('physical support extent must contain the road and shoulders');
  return [
    { lMin: -outside.left, lMax: -leftShoulder, type: outside.leftType },
    { lMin: -leftShoulder, lMax: -road.roadLeft, type: 'SHOULDER' as const },
    { lMin: -road.roadLeft, lMax: road.roadRight, type: 'ASPHALT' as const },
    { lMin: road.roadRight, lMax: rightShoulder, type: 'SHOULDER' as const },
    { lMin: rightShoulder, lMax: outside.right, type: outside.rightType },
  ].filter((band) => band.lMax > band.lMin);
}
