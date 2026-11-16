import type { StripGround } from '../strip-ground.js';
import type { SectionPlanCoordinateReader } from '../geometry/plan-coordinate.js';
import type { ProfileReader, ProfilePolylineReader } from '../geometry/profile.js';
import type { PlanarPose, PlanarTransform } from '../../core/planar-transform.js';
import type { CourseAppearance } from '../course-appearance.js';
import type { CompiledPlanSegment } from '../course-geometry.js';
import type { CompiledBoundary } from '../course-boundaries.js';
import type { CompiledLane, CompiledLanes } from '../course-lanes.js';
import type { StripMaterial } from '../strip-material.js';
import type { CourseBarrierLine } from '../course-barriers.js';
import type { CourseGround } from '../course-ground.js';
import type { CourseObject } from '../course-objects.js';

/** Canonical reusable node, including back-references. Topology may intentionally cycle. */
export interface CompiledSection {
  /** The road's colors, color pairs at their new color. */
  readonly color: StripGround;
  /** With color pairs, the road's colors with each pair at its old color, which a change of sky mixes from. */
  readonly colorFrom: StripGround | null;
  readonly id: string;
  readonly segments: readonly CompiledPlanSegment[];
  readonly coordinates: SectionPlanCoordinateReader;
  readonly boundaries: readonly CompiledBoundary[];
  /** The cross-section's lanes and medians. */
  readonly lanes: CompiledLanes;
  readonly height: ProfileReader;
  readonly renderHeight: ProfilePolylineReader;
  readonly material: StripMaterial;
  /** The lines vehicles cannot cross: solid walls and the course limits. */
  readonly barriers: readonly CourseBarrierLine[];
  /** The physical ground: the material, continued behind each closed course limit. */
  readonly ground: CourseGround;
  /** Solid objects — solid sprites, fixed or movable, and free wall ends — in station order. */
  readonly objects: readonly CourseObject[];
  readonly appearance: CourseAppearance;
  readonly incoming: readonly CompiledLink[];
  readonly outgoing: readonly CompiledLink[];
}

/** Derived terminal cross-section. Its chainage is either zero or the Section length. */
export interface CompiledCut {
  readonly section: CompiledSection;
  /** The lane the cut runs through: a Link's named lane, or the entered Section's centre lane. */
  readonly lane: CompiledLane;
  /** The cut lane's centre, the lateral of the cut's frame. */
  readonly lateralOrigin: number;
  readonly pose: PlanarPose;
}

/**
 * A step of a side's course limit at a seam: the two Sections hold that side's limit at different laterals, and the
 * limit is closed across the road between them (K, 2026-11-16). Laterals are the `to` Section's at its start: `inner`
 * is the narrower Section's limit, `outer` the wider's. `keep` is the side of the seam it keeps vehicles on: −1 before
 * it (the road narrows), +1 after it (the road widens).
 */
export interface CompiledLimitStep {
  readonly side: 'left' | 'right';
  readonly inner: number;
  readonly outer: number;
  readonly keep: -1 | 1;
}

/** A seam's geometry: the cut it leaves by, the cut it enters by and the frame map between. */
export interface CompiledLink {
  readonly id: string;
  readonly from: CompiledCut;
  readonly to: CompiledCut;
  /** Maps the `from` Section's frame to the `to` Section's frame, like `worldFromSection`. */
  readonly toFromFrom: PlanarTransform;
  /** The steps of the course limits at the seam, none where both sides' limits meet. */
  readonly limitSteps: readonly CompiledLimitStep[];
}
