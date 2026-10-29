import { WORKBENCH_DELIVERY, WORKBENCH_REQUEST } from '../../src/content/workbench-delivery.js';
import { layoutDelivery } from '../authoring/delivery-layout.js';
import type { CompiledState } from './editor-context.js';

type Layout = ReadonlyMap<string, Uint8Array<ArrayBuffer>>;

/**
 * Running the game on a compile: `run` opens the game page in a new tab with `dev=1`, `workbench=<commit>` and the
 * place's parameters, and the page answers that tab's request with the delivery laid out from the compile's products
 * when it opened, which the game takes through its own manifest and digest checks; later edits do not reach an open
 * game. It must be called within a click, so the browser allows the tab; it returns false when the browser blocks it.
 */
export function createGameRunner(commit: string) {
  // Each open game's delivery, laid out when it opened; a closed game's is dropped.
  const games = new Map<Window, Promise<Layout>>();
  addEventListener('message', ({ data, source, origin }: MessageEvent) => {
    for (const game of games.keys()) if (game.closed) games.delete(game);
    const delivery = games.get(source as Window);
    if (!delivery || origin !== location.origin || data?.type !== WORKBENCH_REQUEST) return;
    void delivery.then((files) =>
      (source as Window).postMessage({ type: WORKBENCH_DELIVERY, files: [...files] }, location.origin),
    );
  });
  return (place: Readonly<Record<string, string>>, compiled: CompiledState): boolean => {
    const parameters = new URLSearchParams({ dev: '1', workbench: commit, ...place });
    // The window opens within the click, so the browser allows it; the delivery is laid out meanwhile.
    const game = open(new URL(`index.html?${parameters}`, siteRoot()));
    if (!game) return false;
    games.set(game, layoutDelivery(compiled.files));
    return true;
  };
}

/**
 * The site's root, where the game page is: a build is published at `build/<commit>/` under it, and a local build is
 * `dist/` in the checkout. An editing page is `tools/<page>/<page>.html` inside the build.
 */
export function siteRoot(): URL {
  const build = new URL('../../', location.href);
  return new URL(/\/build\/[0-9a-f]{40}\/$/.test(build.pathname) ? '../../' : '../', build);
}
