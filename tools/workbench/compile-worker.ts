import { compileContent } from '../authoring/compile-content.js';
import { createLayeredStore } from '../authoring/layered-store.js';
import { planMeasurement } from '../authoring/measure.js';
import { MEASUREMENT_STALE, measuredEnvelopePath, referenceTimesPath } from '../course/measured-products.js';
import { workerStore } from './worker-store.js';
import type { CompileRequest, CompileResponse } from './compile-protocol.js';

/**
 * The workbench's compiler, off the page's thread: one authoring-core compile per request. Saved measured products are
 * used while current. When they are stale, the preview measurements that are current take their place; when those do
 * not cover every stale product, the content also compiles without measured products, which editing, previews and
 * running without them use.
 */
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<CompileRequest>) => void): void;
  postMessage(message: CompileResponse, transfer: Transferable[]): void;
};

const onlyStale = (diagnostics: readonly { readonly code: string }[]) =>
  diagnostics.every((diagnostic) => diagnostic.code === MEASUREMENT_STALE);

scope.addEventListener('message', async ({ data }) => {
  const started = performance.now();
  const seconds = () => (performance.now() - started) / 1000;
  const base = { generation: data.generation, seconds: 0 };
  let response: CompileResponse;
  try {
    const store = await workerStore(data.root, data.changes);
    const saved = await compileContent(store);
    if (saved.ok)
      response = {
        ...base,
        seconds: seconds(),
        ok: true,
        files: saved.value.files,
        measurements: 'saved',
        preview: [],
      };
    else if (!onlyStale(saved.diagnostics))
      response = {
        ...base,
        seconds: seconds(),
        ok: false,
        diagnostics: saved.diagnostics,
        unmeasured: null,
        preview: [],
      };
    else {
      const unmeasured = await compileContent(store, { measured: false });
      // The preview files still current: those the plan over them finds nothing stale in.
      let current: string[] = [];
      if (data.preview.length && unmeasured.ok) {
        const previewStore = createLayeredStore(store, new Map(data.preview));
        const plan = await planMeasurement(previewStore, unmeasured.value, false);
        const stale = new Set([
          ...plan.jobs.filter((job) => !job.envelope).map((job) => measuredEnvelopePath(job.vehicleId)),
          ...plan.jobs.flatMap((job) => job.courses.map(referenceTimesPath)),
        ]);
        current = data.preview.map(([path]) => path).filter((path) => !stale.has(path));
      }
      const withPreview = current.length
        ? await compileContent(
            createLayeredStore(store, new Map(data.preview.filter(([path]) => current.includes(path)))),
          )
        : null;
      response = withPreview?.ok
        ? {
            ...base,
            seconds: seconds(),
            ok: true,
            files: withPreview.value.files,
            measurements: 'preview',
            preview: current,
          }
        : {
            ...base,
            seconds: seconds(),
            ok: false,
            diagnostics: withPreview && !withPreview.ok ? withPreview.diagnostics : saved.diagnostics,
            unmeasured: unmeasured.ok ? unmeasured.value.files : null,
            preview: current,
          };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response = {
      ...base,
      seconds: seconds(),
      ok: false,
      diagnostics: [{ kind: 'internal', code: 'internal_error', document: '', path: '', message }],
      unmeasured: null,
      preview: [],
    };
  }
  const files = response.ok ? response.files : (response.unmeasured ?? []);
  scope.postMessage(response, [...new Set(files.map((file) => file.bytes.buffer))]);
});
