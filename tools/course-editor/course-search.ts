import type { SearchAnswer, SearchRequest } from './findings-worker.js';

/**
 * Searches of a course document in a worker of their own (`findings-worker.ts`), apart from the compile and from
 * another such worker: one at a time. Asking anew ends the search under way, whose answer then never comes; `stop`
 * ends the worker (the search under way with it), and the next request starts another. A worker that fails answers
 * its search with the reason.
 */
export function createCourseSearch() {
  let worker: Worker | null = null,
    running: { readonly id: number; readonly resolve: (answer: SearchAnswer) => void } | null = null,
    ids = 0;
  const stop = () => {
    worker?.terminate();
    worker = null;
    running = null;
  };
  const ask = (request: SearchRequest) =>
    new Promise<SearchAnswer>((resolve) => {
      if (running) stop();
      if (!worker) {
        const started = new Worker(new URL('../../tools/course-editor/findings-worker.js', location.href), {
          type: 'module',
        });
        started.addEventListener('message', ({ data }: MessageEvent<SearchAnswer>) => {
          if (running?.id !== data.id) return;
          const { resolve } = running;
          running = null;
          resolve(data);
        });
        started.addEventListener('error', (event) => {
          const failed = running;
          stop();
          failed?.resolve({ id: failed.id, error: event.message || 'the search worker failed' });
        });
        worker = started;
      }
      running = { id: ++ids, resolve };
      worker.postMessage({ ...request, id: ids });
    });
  return { ask, stop, running: () => running !== null };
}
