/** Failures of a worker in a row, with no answer between, after which it is not started again. */
const WORKER_TRIES = 3;

/**
 * Requests to a module worker at `path` (found from the page, as the editing frame finds its workers), each answered by
 * its id; an answer with `error` refuses its request. A worker that fails refuses what it was asked, `failed` is told,
 * and it is started again, so the page's redraws go on; after `WORKER_TRIES` failures with no answer between (a worker
 * that cannot load), it is not started again: K is told once, and every request is refused with the reason.
 */
export function createWorkerRequests<Answer extends { readonly id: number; readonly error?: string }>(
  path: string,
  name: string,
  failed: () => void = () => {},
) {
  const waiting = new Map<number, { resolve: (answer: Answer) => void; reject: (error: Error) => void }>();
  let worker: Worker,
    id = 0,
    // Failures since the worker last answered, and the reason it was given up, once it is.
    failures = 0,
    givenUp: string | null = null;
  const start = () => {
    worker = new Worker(new URL(path, location.href), { type: 'module' });
    worker.addEventListener('message', ({ data }: MessageEvent<Answer>) => {
      failures = 0;
      const request = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error === undefined) request?.resolve(data);
      else request?.reject(new RangeError(data.error));
    });
    const fail = (message: string) => {
      worker.terminate();
      for (const request of waiting.values()) request.reject(new Error(`The ${name} worker failed: ${message}`));
      waiting.clear();
      failed();
      if (++failures < WORKER_TRIES) return start();
      givenUp = `The ${name} worker failed ${failures} times in a row (${message}); reload the page to try again.`;
      alert(givenUp);
    };
    worker.addEventListener('error', (event) => fail(event.message || 'it could not run'));
    worker.addEventListener('messageerror', () => fail('a message could not be read'));
  };
  start();
  /** Ask the worker `request` (its id is given here), handing it `transfer`. */
  return (request: object, transfer: Transferable[] = []): Promise<Answer> =>
    givenUp
      ? Promise.reject(new Error(givenUp))
      : new Promise<Answer>((resolve, reject) => {
          waiting.set(++id, { resolve, reject });
          worker.postMessage({ ...request, id }, transfer);
        });
}
