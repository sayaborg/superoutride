import { chooseMapGrid, rasterizeRibbons } from './map-grid.js';
import type { MapMessage, MapRequest } from './map-protocol.js';
import { solveStripes } from './map-stripes.js';
import { solveTerrain } from './map-terrain.js';

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
    const heights = solveTerrain({ ...grid, low, count }, data.parameters, ({ spacing, step }) =>
      scope.postMessage({ type: 'progress', grid, stage: 'terrain', spacing, step }),
    );
    const solved = performance.now();
    const stripes = solveStripes(grid, data.ribbons, data.bands, data.pairCount, (spacing) =>
      scope.postMessage({ type: 'progress', grid, stage: 'stripes', spacing, step: 0 }),
    );
    const seconds = { terrain: (solved - started) / 1000, stripes: (performance.now() - solved) / 1000 };
    const transfer = [
      heights.buffer,
      ...(stripes ? [stripes.psi.buffer, stripes.omega.buffer, stripes.pairs.buffer] : []),
    ];
    scope.postMessage({ type: 'done', grid, heights, stripes, seconds }, transfer);
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
