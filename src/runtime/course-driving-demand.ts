import type { CameraProfile } from '../camera/camera.js';
import { guideLocalSearchRange, sampleGuidePath, type GuidePath } from '../core/guide-curve.js';
import { GEOMETRY_SAMPLING_TOLERANCE_METERS } from '../core/tolerances.js';
import type { RecoveryProfile } from '../gameplay/recovery.js';
import { RIVAL_GUIDE_LOOKAHEAD_METERS } from '../gameplay/rival-driver.js';
import { VEHICLE_PROJECTION_SEARCH_RADIUS } from '../physics/vehicle-dynamics.js';
import type { TerrainVisualProfile } from '../terrain/terrain-line.js';
import type { CourseGeometryView, CourseViewDemand } from './course-geometry-view.js';
import { profileIndexAt } from '../core/open-profile.js';

function projectionSeed(guide: GuidePath, s: number, side: 'start' | 'end') {
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
  return index;
}

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
  const projectionAt = (s: number, side: 'start' | 'end') =>
    guideLocalSearchRange(guide, projectionSeed(guide, s, side), VEHICLE_PROJECTION_SEARCH_RADIUS);
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

/** Adjacent IEEE value for outward coverage rounding; this never changes point/edge ownership. */
function outward(value: number, lower: boolean): number {
  if (value === 0) return lower ? -Number.MIN_VALUE : Number.MIN_VALUE;
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, value);
  bits.setBigUint64(0, bits.getBigUint64(0) + (value > 0 !== lower ? 1n : -1n));
  return bits.getFloat64(0);
}

/** Complete native candidates across the actual bounded itinerary, including unequal subdivision at a seam. */
export function courseOccurrenceDrivingDemand(
  view: CourseGeometryView,
  source: CourseViewDemand,
  recovery: Pick<RecoveryProfile, 'backtrackDistance'> & { readonly lastSafeS: number },
) {
  if (!view || !Array.isArray(view.spans) || !source || !source.pose || !source.consumers || !recovery)
    throw new TypeError('Occurrence demand requires a geometry view and explicit source/consumer demand');
  if ([recovery.backtrackDistance, recovery.lastSafeS].some((value) => typeof value !== 'number'))
    throw new TypeError('Recovery demand values must be numeric');
  if (![recovery.backtrackDistance, recovery.lastSafeS].every(Number.isFinite) || recovery.backtrackDistance < 0)
    throw new RangeError('Recovery demand requires finite chainage and nonnegative backtrack distance');
  const layouts = view.spans.map((span: CourseGeometryView['spans'][number]) => {
    const guide = span.occurrence.section.guide,
      own = span.sourceOwnership;
    let first = profileIndexAt(guide.segments, 'sStart', own.start),
      last = profileIndexAt(guide.segments, 'sStart', own.end);
    while (first > 0 && guide.segments[first - 1]!.sEnd > own.start) first--;
    while (guide.segments[first]!.sEnd <= own.start) first++;
    while (guide.segments[last]!.sStart >= own.end) last--;
    return { span, guide, first, last };
  });
  let exhausted = false;
  const endpoint = (s: number, side: 'start' | 'end') => {
    const address = view.addressInFrame(s, 0);
    let at = layouts.findIndex((v) => v.span.occurrence === address.occurrence);
    let layout = layouts[at]!;
    let index = Math.max(layout.first, Math.min(layout.last, projectionSeed(layout.guide, address.sourceS, side)));
    // The native projector may retain either incident seed at a join, including an ownership seam.
    if (
      side === 'start' &&
      at > 0 &&
      address.sourceS <= layout.span.sourceOwnership.start + GEOMETRY_SAMPLING_TOLERANCE_METERS
    ) {
      layout = layouts[--at]!;
      index = layout.last;
    } else if (
      side === 'end' &&
      at + 1 < layouts.length &&
      address.sourceS >= layout.span.sourceOwnership.end - GEOMETRY_SAMPLING_TOLERANCE_METERS
    ) {
      layout = layouts[++at]!;
      index = layout.first;
    }
    const lower = side === 'start';
    for (let n = 0; n < VEHICLE_PROJECTION_SEARCH_RADIUS; n++) {
      if (lower ? index > layout.first : index < layout.last) index += lower ? -1 : 1;
      else if (lower ? at > 0 : at + 1 < layouts.length) {
        at += lower ? -1 : 1;
        layout = layouts[at]!;
        index = lower ? layout.last : layout.first;
      } else {
        const owner = lower ? layout.span.sourceOwnership.start : layout.span.sourceOwnership.end;
        const edge = layout.span.frameAnchorS + (owner - layout.span.sourceAnchorS);
        if (edge !== (lower ? view.availableRange.start : view.availableRange.end)) exhausted = true;
        break;
      }
    }
    const { span, guide } = layout,
      segment = guide.segments[index]!;
    const native = lower
      ? Math.max(segment.sStart, span.sourceOwnership.start)
      : Math.min(segment.sEnd, span.sourceOwnership.end);
    // Round in the source and frame, then again when deriving the extent. Inverse arithmetic must
    // contain the complete native cell, even if its station is a few ulps away from the active ruler.
    const owner = lower ? span.sourceOwnership.start : span.sourceOwnership.end;
    const mapped = span.frameAnchorS + ((native === owner ? native : outward(native, lower)) - span.sourceAnchorS);
    return native === owner ? mapped : outward(mapped, lower);
  };
  const { minS, maxS, maxAdvance } = source.pose,
    end = maxS + maxAdvance;
  const interval = (first: number, last: number) => {
    const start = endpoint(first, 'start'),
      finish = endpoint(last, 'end');
    const behind = Math.max(0, minS - start),
      ahead = Math.max(0, finish - end);
    return Object.freeze({
      behind: minS - behind > start ? outward(behind, false) : behind,
      ahead: end + ahead < finish ? outward(ahead, false) : ahead,
    });
  };
  const contact = interval(minS, end),
    reverseRecovery = interval(
      Math.max(0, Math.max(minS, recovery.lastSafeS) - recovery.backtrackDistance),
      Math.max(0, Math.max(end, recovery.lastSafeS) - recovery.backtrackDistance),
    );
  if (exhausted) return Object.freeze({ ok: false as const, reason: 'projection_history_exhausted' as const });
  const union = (a: { behind: number; ahead: number }, b: { behind: number; ahead: number }) =>
    Object.freeze({ behind: Math.max(a.behind, b.behind), ahead: Math.max(a.ahead, b.ahead) });
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      pose: Object.freeze({ ...source.pose }),
      consumers: Object.freeze({
        cameraRender: Object.freeze({ ...source.consumers.cameraRender }),
        driverLookahead: Object.freeze({ ...source.consumers.driverLookahead }),
        contact: union(source.consumers.contact, contact),
        reverseRecovery: union(source.consumers.reverseRecovery, reverseRecovery),
      }),
    }),
  });
}
