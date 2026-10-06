import { compileContent, type ContentCompilation } from '../authoring/compile-content.js';
import { createLayeredStore } from '../authoring/layered-store.js';
import { planMeasurement } from '../authoring/measure.js';
import { MEASUREMENT_STALE, measuredEnvelopePath, referenceTimesPath } from '../course/measured-products.js';
import { workerStore } from './worker-store.js';
import { courseReport, courseSection, createCourseFrameRenderer } from '../authoring/course-views.js';
import { courseFindings } from '../authoring/course-findings.js';
import type { Json } from '../authoring/json-pointer.js';
import type { CompiledContent } from '../authoring/compile-content.js';
import type { CompileRequest, CompileResponse, CourseQuery, QueryRequest, QueryResponse } from './compile-protocol.js';

/**
 * The workbench's compiler, off the page's thread: one authoring-core compile per request. Saved measured products are
 * used while current. When they are stale, the preview measurements that are current take their place; when those do
 * not cover every stale product, the content also compiles without measured products, which editing, previews and
 * running without them use. Each compile reuses the stages of the one before whose inputs are unchanged. Queries about
 * a compiled course are answered from the latest compile that succeeded, with or without measured products.
 */
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<CompileRequest | QueryRequest>) => void): void;
  postMessage(message: CompileResponse | QueryResponse): void;
};

// The latest compilation, whose unchanged stages the next compile reuses, and the latest that succeeded.
let previous: ContentCompilation | undefined;
let latest: { readonly generation: number; readonly content: CompiledContent } | null = null;
let compiling = 0;
const compile = async (...[store, options]: Parameters<typeof compileContent>) => {
  previous = await compileContent(store, { ...options, previous });
  if (previous.ok) latest = { generation: compiling, content: previous.value };
  return previous;
};

// The last frame renderer, kept while its compile, course, Section and vehicle are asked for again.
let renderer: { readonly key: string; readonly render: ReturnType<typeof createCourseFrameRenderer>['render'] } | null =
  null;
function answer(query: Exclude<CourseQuery, { kind: 'findings' }>, compiled: NonNullable<typeof latest>) {
  const course = compiled.content.courses.find((candidate) => candidate.id === query.course);
  if (!course) throw new RangeError(`Unknown course ${query.course}`);
  const section = courseSection(course, query.section);
  if (query.kind === 'report') return { kind: 'report' as const, report: courseReport(course, section, query.step) };
  const key = JSON.stringify([compiled.generation, query.course, query.section, query.vehicle]);
  if (renderer?.key !== key)
    renderer = {
      key,
      render: createCourseFrameRenderer(
        compiled.content,
        course,
        section,
        query.vehicle ? { vehicle: query.vehicle } : {},
      ).render,
    };
  const { stats: _stats, ...frame } = renderer.render(query.s, query.l);
  return { kind: 'render' as const, frame };
}

function query({ id, query }: QueryRequest) {
  const started = performance.now();
  const base = { type: 'answer' as const, id, generation: latest?.generation ?? null };
  let response: QueryResponse;
  try {
    if (query.kind === 'findings') {
      const { document, ...options } = query;
      response = { ...base, milliseconds: 0, kind: 'findings', findings: courseFindings(document as Json, options) };
    } else {
      if (!latest) throw new RangeError('Nothing has compiled yet');
      response = { ...base, milliseconds: 0, ...answer(query, latest) };
    }
  } catch (error) {
    // A document findings cannot read is answered, not thrown: findings never fail.
    if (!(error instanceof RangeError) && query.kind !== 'findings') throw error;
    response = {
      ...base,
      milliseconds: 0,
      kind: 'failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  scope.postMessage({ ...response, milliseconds: performance.now() - started });
}

const onlyStale = (diagnostics: readonly { readonly code: string }[]) =>
  diagnostics.every((diagnostic) => diagnostic.code === MEASUREMENT_STALE);

scope.addEventListener('message', async ({ data }) => {
  if (data.type === 'query') return query(data);
  compiling = data.generation;
  const started = performance.now();
  const seconds = () => (performance.now() - started) / 1000;
  const base = { type: 'compiled' as const, generation: data.generation, seconds: 0 };
  let response: CompileResponse;
  try {
    const store = await workerStore(data.root, data.changes);
    const saved = await compile(store);
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
      const unmeasured = await compile(store, { measured: false });
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
        ? await compile(createLayeredStore(store, new Map(data.preview.filter(([path]) => current.includes(path)))))
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
  // The files are copied, not transferred: reused stages share their bytes with the next compile.
  scope.postMessage(response);
});
