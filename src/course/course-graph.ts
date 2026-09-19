import type { GuidePath } from '../core/guide-curve.js';
import type { RasterPath } from '../core/raster-path.js';
import type { HeightProfileReader } from '../core/height-profile.js';
import type { PlanarPose, PlanarTransform } from '../core/planar-transform.js';
import type { CourseAssetReference, SectionDocument } from './course-document.js';
import type { CompiledCourseAnchor, CompiledPlanPrimitive } from './course-geometry.js';
import type { CompiledBoundary, CompiledBandPartition, CompiledCarriageway } from './course-bands.js';
import type { CompiledPhysicalBinding } from './course-physical-binding.js';

/** Canonical reusable node, including back-references. Topology may intentionally cycle. */
export interface CompiledSection<Material = unknown> {
  readonly id: string;
  readonly primitives: readonly CompiledPlanPrimitive[];
  readonly raster: RasterPath;
  readonly guide: GuidePath;
  readonly boundaries: readonly CompiledBoundary[];
  readonly bandPartition: CompiledBandPartition;
  readonly height: HeightProfileReader;
  readonly physicalBindings: readonly CompiledPhysicalBinding<Material>[];
  readonly carriageways: readonly CompiledCarriageway[];
  readonly assets: readonly CourseAssetReference[];
  readonly ports: readonly CompiledPort<Material>[];
  readonly incoming: readonly CompiledLink<Material>[];
  readonly outgoing: readonly CompiledLink<Material>[];
}

export interface CompiledPort<Material = unknown> {
  readonly id: string;
  readonly kind: SectionDocument['ports'][number]['kind'];
  readonly section: CompiledSection<Material>;
  readonly anchor: CompiledCourseAnchor;
  readonly carriageway: CompiledCarriageway;
  readonly pose: PlanarPose;
}

/** Carriageway geometry proof only; not admission for a driving transition. */
export interface CompiledLink<Material = unknown> {
  readonly id: string;
  readonly source: CompiledPort<Material>;
  readonly destination: CompiledPort<Material>;
  readonly destinationFromSource: PlanarTransform;
  readonly overlap: { readonly behind: number; readonly ahead: number };
}
