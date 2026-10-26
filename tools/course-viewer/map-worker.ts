import { chooseMapGrid, rasterizeRibbons } from './map-grid.js';
import type { MapMessage, MapRequest } from './map-protocol.js';
import { solveTerrain } from './map-terrain.js';

/** The course map's terrain, off the page's thread: the grid, the ribbons on it and the terrain over it. */
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<MapRequest>) => void): void;
  postMessage(message: MapMessage, transfer?: Transferable[]): void;
};

scope.addEventListener('message', ({ data }) => {
  try {
    const started = performance.now();
    const grid = chooseMapGrid(data.ribbons, data.spacing, data.margin);
    const { low, count } = rasterizeRibbons(grid, data.ribbons);
    const heights = solveTerrain({ ...grid, low, count }, data.parameters, (progress) =>
      scope.postMessage({ type: 'progress', grid, ...progress }),
    );
    const seconds = (performance.now() - started) / 1000;
    scope.postMessage({ type: 'done', grid, heights, seconds }, [heights.buffer]);
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
