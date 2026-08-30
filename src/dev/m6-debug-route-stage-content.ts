import {
  compileRouteStageContentManifest,
  type RouteStageContentManifest,
} from '../gameplay/route-stage-content.js';
import type { RouteDag } from '../gameplay/route-dag.js';

/** Detached content manifest for the M6 DEV DAG. Package ids remain opaque. */
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
