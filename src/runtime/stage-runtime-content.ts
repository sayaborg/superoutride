import { guideCoordinateCurve, guideCoordinateLateralOrigin, type GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import type { StageRoadView } from '../course/stage-road-view.js';
import type { RouteStageContentManifest } from '../gameplay/route-stage-content.js';
import type { SurfaceMapReader } from '../physics/surface-map.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import type { FarBackground } from '../visual/far-background.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { GroundMapProfile } from '../visual/ground-map.js';
import type { CourseSprite } from '../world/course-sprite.js';

export interface StageRuntimeContentPackage {
  readonly packageId: string;
  readonly worldFrameId: string;
  readonly coordinateFrame: GuideCoordinateSource;
  readonly roadView: StageRoadView | null;
  readonly surfaceMap: SurfaceMapReader;
  readonly heightProfile: HeightProfileReader;
  readonly terrainProfile: TerrainVisualProfile;
  readonly groundProfile: GroundMapProfile;
  readonly selectFarBackground: (cameraS: number) => FarBackground;
  readonly worldSprites: readonly CourseSprite[];
}

export interface StageRuntimeContentRegistry {
  readonly worldFrameId: string;
  readonly packages: readonly StageRuntimeContentPackage[];
}

/**
 * Bind opaque gameplay package IDs to complete runtime content without teaching the Route DAG
 * anything about renderer/physics objects.
 *
 * Every package reference in the gameplay manifest must have exactly one runtime package, and the
 * lateral origin used by the coordinate frame must exactly agree with the StageRoadView used by
 * the renderer. This is the key M6.19 invariant that keeps physics/camera/rendering in one child
 * coordinate chart after a validated handoff.
 */
export function compileStageRuntimeContentRegistry(
  manifest: RouteStageContentManifest,
  packages: readonly StageRuntimeContentPackage[],
): StageRuntimeContentRegistry {
  if (packages.length === 0) throw new RangeError('stage runtime content requires at least one package');

  const manifestIds = new Set(manifest.packages.map((entry) => entry.packageId));
  const runtimeById = new Map<string, StageRuntimeContentPackage>();

  for (const source of packages) {
    if (source.packageId.trim().length === 0) throw new RangeError('runtime packageId must not be empty');
    if (runtimeById.has(source.packageId)) throw new RangeError(`duplicate runtime packageId: ${source.packageId}`);
    if (!manifestIds.has(source.packageId)) {
      throw new RangeError(`runtime package is not declared by route content manifest: ${source.packageId}`);
    }
    if (source.worldFrameId !== manifest.worldFrameId) {
      throw new RangeError(`runtime package worldFrameId mismatch: ${source.packageId}`);
    }

    validatePackageGeometry(source);
    runtimeById.set(source.packageId, freezePackage(source));
  }

  for (const manifestPackage of manifest.packages) {
    if (!runtimeById.has(manifestPackage.packageId)) {
      throw new RangeError(`route content package is missing runtime content: ${manifestPackage.packageId}`);
    }
  }

  return Object.freeze({
    worldFrameId: manifest.worldFrameId,
    packages: Object.freeze(manifest.packages.map((entry) => runtimeById.get(entry.packageId)!)),
  });
}

/** Resolve runtime content from the handoff authority, never directly from RouteDag.activeStageId. */
export function resolveActiveStageRuntimeContent(
  registry: StageRuntimeContentRegistry,
  state: { readonly activePackageId: string },
): StageRuntimeContentPackage {
  const content = registry.packages.find((entry) => entry.packageId === state.activePackageId);
  if (!content) throw new RangeError(`unknown active runtime packageId: ${state.activePackageId}`);
  return content;
}

function validatePackageGeometry(source: StageRuntimeContentPackage): void {
  const guide = guideCoordinateCurve(source.coordinateFrame);
  const epsilon = 1e-7;

  if (Math.abs(source.heightProfile.courseLength - guide.length) > epsilon) {
    throw new RangeError(`runtime package height profile length mismatch: ${source.packageId}`);
  }
  if (source.terrainProfile.height !== source.heightProfile) {
    throw new RangeError(`runtime package terrain/height authority mismatch: ${source.packageId}`);
  }
  if (source.groundProfile.baked
    && Math.abs(source.groundProfile.baked.metadata.courseLength - guide.length) > epsilon) {
    throw new RangeError(`runtime package baked GroundMap length mismatch: ${source.packageId}`);
  }
  if (source.roadView !== null) {
    const origin = guideCoordinateLateralOrigin(source.coordinateFrame);
    if (Math.abs(source.roadView.sourceLateralOrigin - origin) > epsilon) {
      throw new RangeError(`runtime package coordinate/road lateral origin mismatch: ${source.packageId}`);
    }
  }
}

function freezePackage(source: StageRuntimeContentPackage): StageRuntimeContentPackage {
  return Object.freeze({
    ...source,
    worldSprites: Object.freeze([...source.worldSprites]),
  });
}
