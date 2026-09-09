import type { SurfaceRegionAuthoring } from '../course/surface-region.js';

export interface CourseCompilerLimits {
  readonly dMax: number;
  readonly guideLateralLimit: number;
}

export interface CourseCompilerValidation {
  readonly courseLength: number;
  readonly dMax: number;
  readonly maxSupportedAbsL: number;
  readonly guideLateralLimit: number;
}

/**
 * Validate an authored physical envelope. Open-path visibility clips to its endpoint;
 * draw distance has no half-lap restriction.
 * Geometry-specific Raster/Guide validation remains in their existing compilers.
 */
export function validateCourseCompilerFoundation(
  courseLength: number,
  regions: readonly SurfaceRegionAuthoring[],
  limits: CourseCompilerLimits,
): CourseCompilerValidation {
  if (!(courseLength > 0) || !Number.isFinite(courseLength)) {
    throw new RangeError('course length must be finite and > 0');
  }
  if (!(limits.dMax > 0) || !Number.isFinite(limits.dMax)) {
    throw new RangeError('draw distance must be finite and > 0');
  }
  if (!(limits.guideLateralLimit > 0) || !Number.isFinite(limits.guideLateralLimit)) {
    throw new RangeError('guide lateral limit must be finite and > 0');
  }

  let maxSupportedAbsL = 0;
  for (const region of regions) {
    for (const band of region.surfaceBands) {
      maxSupportedAbsL = Math.max(maxSupportedAbsL, Math.abs(band.lMin), Math.abs(band.lMax));
    }
  }

  if (!(maxSupportedAbsL < limits.guideLateralLimit)) {
    throw new RangeError(
      `drivable SurfaceMap envelope |l|=${maxSupportedAbsL} must remain inside Guide chart |l|<${limits.guideLateralLimit}`,
    );
  }

  return {
    courseLength,
    dMax: limits.dMax,
    maxSupportedAbsL,
    guideLateralLimit: limits.guideLateralLimit,
  };
}
