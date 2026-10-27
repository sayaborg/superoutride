import { chooseMapGrid, rasterizeRibbons, ribbonSides } from './map-grid.js';
import type { MapMessage, MapRequest } from './map-protocol.js';
import { solveStripes } from './map-stripes.js';
import { solveTerrain } from './map-terrain.js';
import { buildWallMesh } from './map-walls.js';

/** The course map, off the page's thread: the grid, the ribbons on it, the terrain over it and its stripes. */
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<MapRequest>) => void): void;
  postMessage(message: MapMessage, transfer?: Transferable[]): void;
};

scope.addEventListener('message', ({ data }) => {
  try {
    const started = performance.now();
    const grid = chooseMapGrid(data.ribbons, data.spacing, data.margin);
    const { low, count } = rasterizeRibbons(grid, data.ribbons);
    const sides = ribbonSides(grid, data.ribbons);
    const { heights, walls } = solveTerrain({ ...grid, low, count, sides }, data.parameters, (progress) =>
      scope.postMessage({ type: 'progress', grid, stage: 'terrain', ...progress }),
    );
    const mesh = buildWallMesh(grid, heights, sides, walls);
    const solved = performance.now();
    const stripes = solveStripes(grid, data.ribbons, data.bands, data.pairCount, (spacing) =>
      scope.postMessage({ type: 'progress', grid, stage: 'stripes', spacing, step: 0 }),
    );
    const seconds = { terrain: (solved - started) / 1000, stripes: (performance.now() - solved) / 1000 };
    const transfer = [
      heights.buffer,
      mesh.triangles.buffer,
      mesh.weights.buffer,
      mesh.heights.buffer,
      mesh.walls.buffer,
      mesh.cut.buffer,
      ...(stripes ? [stripes.psi.buffer, stripes.omega.buffer, stripes.pairs.buffer] : []),
    ];
    scope.postMessage({ type: 'done', grid, heights, walls: mesh, stripes, seconds }, transfer);
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
