import type { RouteDag, RouteDagState } from './route-dag.js';

/**
 * Opaque reference to one complete stage content package.
 *
 * M6.11 intentionally does not define the package's renderer internals. The loader/compiler may
 * later resolve packageId to Guide/Raster Course/GroundMap/SurfaceMap/background/sprite assets,
 * while gameplay only knows which package is active.
 *
 * worldFrameId is explicit because changing stage content must not silently change the physical
 * world coordinate frame. M6.11 supports only one shared world frame; no teleport/transform is
 * invented here.
 */
export interface RouteStageContentPackageRef {
  readonly packageId: string;
  readonly worldFrameId: string;
}

export interface RouteStageContentBindingAuthoring {
  readonly stageId: string;
  readonly packageId: string;
}

export interface RouteStageContentBinding extends RouteStageContentBindingAuthoring {}

export interface RouteStageContentManifest {
  readonly worldFrameId: string;
  readonly packages: readonly RouteStageContentPackageRef[];
  readonly bindings: readonly RouteStageContentBinding[];
}

export interface ActiveRouteStageContent {
  readonly stageId: string;
  readonly package: RouteStageContentPackageRef;
}

/**
 * Compile the gameplay route-to-content manifest.
 *
 * Invariants:
 * - every Route DAG stage has exactly one content binding;
 * - every binding references an existing stage and package;
 * - every authored package is actually referenced;
 * - every package uses one shared physical world frame.
 *
 * The manifest contains no renderer instance, camera state, vehicle state or stage-switch side
 * effect. It is a deterministic selection table only.
 */
export function compileRouteStageContentManifest(
  route: RouteDag,
  packages: readonly RouteStageContentPackageRef[],
  bindings: readonly RouteStageContentBindingAuthoring[],
): RouteStageContentManifest {
  if (packages.length === 0) throw new RangeError('route stage content requires at least one package');

  const packageById = new Map<string, RouteStageContentPackageRef>();
  let worldFrameId: string | null = null;
  for (const source of packages) {
    assertNonEmpty(source.packageId, 'stage content packageId');
    assertNonEmpty(source.worldFrameId, 'stage content worldFrameId');
    if (packageById.has(source.packageId)) {
      throw new RangeError(`duplicate stage content packageId: ${source.packageId}`);
    }
    if (worldFrameId === null) worldFrameId = source.worldFrameId;
    else if (source.worldFrameId !== worldFrameId) {
      throw new RangeError('all route stage content packages must share one worldFrameId');
    }
    packageById.set(source.packageId, Object.freeze({ ...source }));
  }

  const routeStageIds = new Set(route.stages.map((stage) => stage.id));
  const boundStageIds = new Set<string>();
  const usedPackageIds = new Set<string>();
  const compiledBindings: RouteStageContentBinding[] = [];

  for (const source of bindings) {
    assertNonEmpty(source.stageId, 'stage content binding stageId');
    assertNonEmpty(source.packageId, 'stage content binding packageId');
    if (!routeStageIds.has(source.stageId)) {
      throw new RangeError(`stage content binding references unknown route stage: ${source.stageId}`);
    }
    if (boundStageIds.has(source.stageId)) {
      throw new RangeError(`route stage has more than one content binding: ${source.stageId}`);
    }
    if (!packageById.has(source.packageId)) {
      throw new RangeError(`stage content binding references unknown package: ${source.packageId}`);
    }
    boundStageIds.add(source.stageId);
    usedPackageIds.add(source.packageId);
    compiledBindings.push(Object.freeze({ ...source }));
  }

  for (const stage of route.stages) {
    if (!boundStageIds.has(stage.id)) {
      throw new RangeError(`route stage is missing a content binding: ${stage.id}`);
    }
  }
  for (const packageId of packageById.keys()) {
    if (!usedPackageIds.has(packageId)) {
      throw new RangeError(`stage content package is unreachable from route bindings: ${packageId}`);
    }
  }

  return Object.freeze({
    worldFrameId: worldFrameId!,
    packages: Object.freeze([...packageById.values()]),
    bindings: Object.freeze(compiledBindings),
  });
}

/** Resolve exactly one opaque package for the Route DAG's current active stage. */
export function resolveActiveRouteStageContent(
  manifest: RouteStageContentManifest,
  state: Pick<RouteDagState, 'activeStageId'>,
): ActiveRouteStageContent {
  const binding = manifest.bindings.find((candidate) => candidate.stageId === state.activeStageId);
  if (!binding) throw new Error(`compiled stage content binding missing: ${state.activeStageId}`);
  const contentPackage = manifest.packages.find((candidate) => candidate.packageId === binding.packageId);
  if (!contentPackage) throw new Error(`compiled stage content package missing: ${binding.packageId}`);
  return Object.freeze({ stageId: state.activeStageId, package: contentPackage });
}

/** Detached manifest for the M6.8 DEV DAG. These are opaque IDs, not real renderer packages yet. */
export function createM6DebugRouteStageContentManifest(route: RouteDag): RouteStageContentManifest {
  const frame = 'DEV_ROUTE_WORLD_V1';
  return compileRouteStageContentManifest(
    route,
    route.stages.map((stage) => ({
      packageId: `CONTENT_${stage.id}`,
      worldFrameId: frame,
    })),
    route.stages.map((stage) => ({
      stageId: stage.id,
      packageId: `CONTENT_${stage.id}`,
    })),
  );
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RangeError(`${label} must be a non-empty string`);
  }
}
