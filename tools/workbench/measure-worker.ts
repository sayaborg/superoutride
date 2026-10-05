import { compileContent } from '../authoring/compile-content.js';
import { planMeasurement, runMeasureJob, type MeasureResult } from '../authoring/measure.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { workerStore } from './worker-store.js';
import type { JobMessage, JobRequest, MeasureMessage, MeasureRequest } from './measure-protocol.js';

/**
 * The workbench's measurement, off the page's thread. As coordinator it compiles the store without measured products,
 * plans, measures each vehicle's job on a worker of its own and returns the files to save; as job worker it measures
 * one job. Terminating the coordinator stops its job workers.
 */
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<MeasureRequest | JobRequest>) => void): void;
  postMessage(message: MeasureMessage | JobMessage): void;
};

const compiled = async (root: string, changes: MeasureRequest['changes']) => {
  const store = await workerStore(root, changes);
  const result = await compileContent(store, { measured: false });
  if (!result.ok) throw new Error(`The content does not compile: ${result.diagnostics[0]?.message ?? ''}`);
  return { store, content: result.value };
};

scope.addEventListener('message', async ({ data }) => {
  try {
    if (data.role === 'job') {
      const { content } = await compiled(data.root, data.changes);
      const result = runMeasureJob(content, data.job, (phase) => scope.postMessage({ type: 'progress', phase }));
      scope.postMessage({ type: 'result', result });
      return;
    }
    const started = performance.now();
    const { store, content } = await compiled(data.root, data.changes);
    const plan = await planMeasurement(store, content, data.everything);
    scope.postMessage({
      type: 'plan',
      jobs: plan.jobs.map((job) => ({ vehicle: job.vehicleId, envelope: !job.envelope, courses: job.courses })),
      extra: plan.extra,
    });
    if (!data.run) return;
    const results = new Map<string, MeasureResult>();
    let next = 0;
    const consume = async () => {
      while (next < plan.jobs.length) {
        const job = plan.jobs[next++]!;
        const worker = new Worker(new URL('./measure-worker.js', import.meta.url), { type: 'module' });
        const result = await new Promise<MeasureResult>((resolve, reject) => {
          worker.addEventListener('message', ({ data: message }: MessageEvent<JobMessage>) => {
            if (message.type === 'progress')
              scope.postMessage({ type: 'progress', vehicle: job.vehicleId, phase: message.phase, done: results.size });
            else if (message.type === 'result') resolve(message.result);
            else reject(new Error(message.message));
          });
          worker.addEventListener('error', (event) => reject(new Error(event.message)));
          worker.postMessage({ role: 'job', root: data.root, changes: data.changes, job } satisfies JobRequest);
        });
        worker.terminate();
        results.set(job.vehicleId, result);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, data.workers) }, consume));
    const { writes, report } = plan.assemble(results);
    const files: [string, string | null][] = writes
      .filter(({ text, previous }) => previous === null || formatSavedJson(previous) !== text)
      .map(({ path, text }) => [path, text]);
    for (const path of plan.extra) files.push([path, null]);
    scope.postMessage({ type: 'done', seconds: (performance.now() - started) / 1000, files, report });
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
