import type { SectionPlanCoordinateReader } from '../geometry/plan-coordinate.js';
import type { RasterPath } from '../geometry/raster-path.js';
import type { ProfileReader, ProfilePolylineReader } from '../geometry/profile.js';
import type { PlanarPose, PlanarTransform } from '../../core/planar-transform.js';
import type { SectionDocument } from '../course-document.js';
import type { CompiledCourseImageSource } from './course-image-source.js';
import type { CoursePresentation } from '../course-presentation.js';
import type { CompiledCourseAnchor, CompiledPlanPrimitive } from '../course-geometry.js';
import type { CompiledBoundary, CompiledRegionPartition, CompiledCarriageway } from '../course-regions.js';
import type { CompiledPhysicalBinding } from '../course-physical-binding.js';
import type { SurfaceMaterial } from '../surface-material.js';

/** Canonical reusable node, including back-references. Topology may intentionally cycle. */
export interface CompiledSection {
  readonly id: string;
  readonly primitives: readonly CompiledPlanPrimitive[];
  readonly raster: RasterPath;
  readonly coordinates: SectionPlanCoordinateReader;
  readonly boundaries: readonly CompiledBoundary[];
  readonly regionPartition: CompiledRegionPartition;
  readonly height: ProfileReader;
  readonly renderHeight: ProfilePolylineReader;
  readonly physicalBindings: readonly CompiledPhysicalBinding<SurfaceMaterial>[];
  readonly carriageways: readonly CompiledCarriageway[];
  readonly assets: readonly CompiledCourseImageSource[];
  readonly presentation: CoursePresentation | null;
  readonly ports: readonly CompiledPort[];
  readonly incoming: readonly CompiledLink[];
  readonly outgoing: readonly CompiledLink[];
  readonly fork: CompiledFork | null;
}

export interface CompiledPort {
  readonly id: string;
  readonly kind: SectionDocument['ports'][number]['kind'];
  readonly section: CompiledSection;
  readonly anchor: CompiledCourseAnchor;
  readonly carriageway: CompiledCarriageway;
  readonly pose: PlanarPose;
}

/** Carriageway geometry proof only; not admission for a driving transition. */
export interface CompiledLink {
  readonly id: string;
  readonly source: CompiledPort;
  readonly destination: CompiledPort;
  readonly destinationFromSource: PlanarTransform;
  readonly overlap: { readonly behind: number; readonly ahead: number };
}

/** Static authored parallel-zone controls; no field choice or actor state. */
export interface CompiledFork {
  readonly section: CompiledSection;
  readonly lock: CompiledCourseAnchor;
  readonly closure: CompiledCourseAnchor;
  readonly regions: readonly {
    readonly link: CompiledLink;
    readonly left: number;
    readonly right: number;
  }[];
}
