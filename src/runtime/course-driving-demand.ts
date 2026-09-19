import type { CameraProfile } from '../camera/camera.js';
import { guideLocalSearchRange, sampleGuidePath, type GuidePath } from '../core/guide-curve.js';
import { GEOMETRY_SAMPLING_TOLERANCE_METERS } from '../core/tolerances.js';
import type { RecoveryProfile } from '../gameplay/recovery.js';
import { RIVAL_GUIDE_LOOKAHEAD_METERS } from '../gameplay/rival-driver.js';
import { VEHICLE_PROJECTION_SEARCH_RADIUS } from '../physics/vehicle-dynamics.js';
import type { TerrainVisualProfile } from '../terrain/terrain-line.js';
import type { CourseViewDemand } from './course-geometry-view.js';

/** Actual longitudinal reads of the existing consumers over an explicit single-source pose envelope. */
export function courseSectionDrivingDemand(
  guide: GuidePath,
  pose: CourseViewDemand['pose'],
  camera: Pick<CameraProfile, 'dCam'>,
  render: Pick<TerrainVisualProfile, 'dMax'>,
  recovery: Pick<RecoveryProfile, 'backtrackDistance'> & { readonly lastSafeS: number },
): CourseViewDemand {
  if (!guide || !pose || !camera || !render || !recovery)
    throw new TypeError('Driving demand requires source geometry, pose and explicit consumer profiles');
  const values = [
    pose.minS,
    pose.maxS,
    pose.maxAdvance,
    camera.dCam,
    render.dMax,
    recovery.backtrackDistance,
    recovery.lastSafeS,
  ];
  if (values.some((value) => typeof value !== 'number')) throw new TypeError('Driving demand values must be numeric');
  const stepEnd = pose.maxS + pose.maxAdvance;
  if (
    !values.every(Number.isFinite) ||
    pose.minS < 0 ||
    pose.maxS < pose.minS ||
    pose.maxAdvance < 0 ||
    stepEnd > guide.length ||
    camera.dCam < 0 ||
    render.dMax <= 0 ||
    recovery.backtrackDistance < 0 ||
    recovery.lastSafeS < 0 ||
    recovery.lastSafeS > guide.length
  )
    throw new RangeError('Driving demand must stay within the finite source with nonnegative extents');
  const projectionAt = (s: number, side: 'start' | 'end') => {
    let index = sampleGuidePath(guide, s).segmentIndex;
    // Projection preserves the first equal-distance candidate at a join; sampling owns the
    // right-hand interval. Include both incident seeds in the closed admitted pose envelope.
    if (side === 'start')
      while (index > 0 && guide.segments[index - 1]!.sEnd >= s - GEOMETRY_SAMPLING_TOLERANCE_METERS) index -= 1;
    else
      while (
        index + 1 < guide.segments.length &&
        guide.segments[index + 1]!.sStart <= s + GEOMETRY_SAMPLING_TOLERANCE_METERS
      )
        index += 1;
    return guideLocalSearchRange(guide, index, VEHICLE_PROJECTION_SEARCH_RADIUS);
  };
  const first = projectionAt(pose.minS, 'start'),
    last = projectionAt(stepEnd, 'end');
  const recoveryStart = Math.max(0, Math.max(pose.minS, recovery.lastSafeS) - recovery.backtrackDistance);
  const recoveryEnd = Math.max(0, Math.max(stepEnd, recovery.lastSafeS) - recovery.backtrackDistance);
  // Recovery reconstruction is followed by ordinary contact observation, so retain that larger
  // neighborhood too, rather than only the smaller initialization search.
  const recoveryFirst = projectionAt(recoveryStart, 'start'),
    recoveryLast = projectionAt(recoveryEnd, 'end');
  return Object.freeze({
    pose: Object.freeze({ ...pose }),
    consumers: Object.freeze({
      cameraRender: Object.freeze({ behind: camera.dCam, ahead: Math.max(0, render.dMax - camera.dCam) }),
      contact: Object.freeze({ behind: Math.max(0, pose.minS - first.start), ahead: Math.max(0, last.end - stepEnd) }),
      driverLookahead: Object.freeze({ behind: 0, ahead: RIVAL_GUIDE_LOOKAHEAD_METERS }),
      reverseRecovery: Object.freeze({
        behind: Math.max(0, pose.minS - recoveryFirst.start),
        ahead: Math.max(0, recoveryLast.end - stepEnd),
      }),
    }),
  });
}
