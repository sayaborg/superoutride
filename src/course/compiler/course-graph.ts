import type { StripGround } from '../strip-ground.js';
import type { SectionPlanCoordinateReader } from '../geometry/plan-coordinate.js';
import type { ProfileReader, ProfilePolylineReader } from '../geometry/profile.js';
import type { PlanarPose, PlanarTransform } from '../../core/planar-transform.js';
import type { CompiledCourseImageSource } from './course-image-source.js';
import type { CourseAppearance } from '../course-appearance.js';
import type { CompiledCoursePosition, CompiledPlanSegment } from '../course-geometry.js';
import type { CompiledBoundary, CompiledCarriageway } from '../course-boundaries.js';
import type { StripMaterial } from '../strip-material.js';

/** Canonical reusable node, including back-references. Topology may intentionally cycle. */
export interface CompiledSection {
  readonly color: StripGround;
  readonly id: string;
  readonly segments: readonly CompiledPlanSegment[];
  readonly coordinates: SectionPlanCoordinateReader;
  readonly boundaries: readonly CompiledBoundary[];
  readonly height: ProfileReader;
  readonly renderHeight: ProfilePolylineReader;
  readonly material: StripMaterial;
  readonly carriageways: readonly CompiledCarriageway[];
  readonly assets: readonly CompiledCourseImageSource[];
  readonly appearance: CourseAppearance | null;
  readonly incoming: readonly CompiledLink[];
  readonly outgoing: readonly CompiledLink[];
  readonly fork: CompiledFork | null;
}

/** Derived terminal cross-section. Its chainage is either zero or the Section length. */
export interface CompiledCut {
  readonly section: CompiledSection;
  readonly lateralOrigin: number;
  readonly carriageway: CompiledCarriageway;
  readonly pose: PlanarPose;
}

/** Carriageway geometry proof only; not admission for a driving transition. */
export interface CompiledLink {
  readonly id: string;
  readonly from: CompiledCut;
  readonly to: CompiledCut;
  readonly destinationFromSource: PlanarTransform;
}

/** Static authored parallel-zone controls; no field choice or actor state. */
export interface CompiledFork {
  readonly section: CompiledSection;
  readonly lock: CompiledCoursePosition;
  readonly closure: CompiledCoursePosition;
  readonly regions: readonly {
    readonly link: CompiledLink;
    readonly left: number;
    readonly right: number;
  }[];
}
