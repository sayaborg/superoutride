import type { WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import type { MeasureMessage, MeasureRequest } from './measure-protocol.js';
import { make } from './dom.js';

/** Workers measuring at once: the measurement tool's four, fewer on a smaller machine. */
const WORKERS = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1));

/**
 * The measured products: which are stale, and measuring them with the measurement tool's implementation, off the
 * page's thread, for this build only. The results are preview measurements: used while current, never saved, never a
 * step of the history. Only `npm run measure` writes the saved products.
 */
export const measureModule: WorkbenchModule = {
  id: 'measure',
  title: 'Measure',
  mount(element: HTMLElement, context: WorkbenchContext) {
    const summary = make('p', 'Measurements are checked after each compile.');
    const stale = make('ul');
    const measure = make('button', 'Measure stale', { type: 'button' });
    const everything = make('button', 'Measure everything', { type: 'button' });
    const cancel = make('button', 'Cancel', { type: 'button', disabled: '' });
    const progress = make('p', '', { role: 'status', class: 'measure-progress' });
    const report = make('pre', '', { class: 'diff' });
    report.hidden = true;
    element.append(
      make('h2', 'Measured products'),
      summary,
      stale,
      measure,
      ' ',
      everything,
      ' ',
      cancel,
      progress,
      report,
    );

    let coordinator: Worker | null = null;
    const start = (run: boolean, all: boolean, onMessage: (message: MeasureMessage) => void) => {
      coordinator?.terminate();
      const worker = new Worker(new URL('./measure-worker.js', import.meta.url), { type: 'module' });
      coordinator = worker;
      worker.addEventListener('message', ({ data }: MessageEvent<MeasureMessage>) => {
        if (coordinator === worker) onMessage(data);
      });
      worker.postMessage({
        role: 'coordinator',
        root: context.root,
        // Preview measurements count as measured: only what they do not cover is stale.
        changes: [...context.changes(), ...context.preview()],
        everything: all,
        run,
        workers: WORKERS,
      } satisfies MeasureRequest);
      return worker;
    };
    const idle = (text: string) => {
      coordinator?.terminate();
      coordinator = null;
      measure.disabled = everything.disabled = false;
      cancel.disabled = true;
      progress.textContent = text;
    };
    const showPlan = (message: Extract<MeasureMessage, { type: 'plan' }>) => {
      const items = message.jobs.map((job) =>
        make(
          'li',
          `${job.vehicle}: ${[job.envelope ? 'envelope' : null, ...job.courses.map((course) => `reference times on ${course}`)].filter(Boolean).join(', ')}`,
        ),
      );
      for (const path of message.extra) items.push(make('li', `${path}: owned by no vehicle or series course`));
      stale.replaceChildren(...items);
      summary.textContent = items.length ? `${items.length} stale:` : 'Measurements are current.';
    };

    // A compile that only measurements fail lists what is stale.
    let checked: unknown = null;
    context.subscribe(() => {
      const state = context.compile();
      if (state === checked || state.status === 'running' || coordinator) return;
      checked = state;
      if (state.status === 'failed' && state.unmeasured)
        start(false, false, (message) => {
          if (message.type === 'plan') {
            showPlan(message);
            idle('');
          } else if (message.type === 'error') idle(message.message);
        });
      else if (state.status === 'ok') {
        stale.replaceChildren();
        summary.textContent = 'Measurements are current.';
      }
    });

    const run = (all: boolean) => {
      measure.disabled = everything.disabled = true;
      cancel.disabled = false;
      report.hidden = true;
      let jobs = 0;
      progress.textContent = 'Compiling and planning…';
      start(true, all, (message) => {
        if (message.type === 'plan') {
          showPlan(message);
          jobs = message.jobs.length;
          if (!jobs && !message.extra.length) idle('Nothing to measure.');
        } else if (message.type === 'progress')
          progress.textContent = `Measuring: ${message.done} of ${jobs} vehicles done · ${message.vehicle}: ${message.phase === 'envelope' ? 'envelope' : `reference runs on ${message.phase}`}`;
        else if (message.type === 'done') {
          const files = message.files.flatMap(([path, text]) =>
            text === null ? [] : [[path, new TextEncoder().encode(text)] as const],
          );
          if (files.length) context.addPreview(files);
          report.textContent = JSON.stringify(message.report, null, 2);
          report.hidden = !message.report.length;
          idle(
            `Measured in ${message.seconds.toFixed(1)} s for this build only: ${files.length} preview file${files.length === 1 ? '' : 's'}, not saved. The saved measurements come from npm run measure -- generate.`,
          );
        } else idle(`Measurement failed: ${message.message}`);
      });
    };
    measure.addEventListener('click', () => run(false));
    everything.addEventListener('click', () => run(true));
    cancel.addEventListener('click', () => idle('Measurement cancelled.'));
    // Which measurements the build uses, always shown.
    const source = make('p', '', { class: 'measure-source' });
    summary.before(source);
    context.subscribe(() => {
      const state = context.compile();
      const previewed = [...context.preview().keys()];
      source.textContent =
        state.status === 'ok'
          ? state.measurements === 'saved'
            ? 'Using the saved measurements.'
            : `Using preview measurements, not saved: ${previewed.join(', ')}.`
          : state.status === 'failed' && state.unmeasured
            ? `Measurements are stale${previewed.length ? `; preview kept while current: ${previewed.join(', ')}` : ''}.`
            : '';
    });
  },
};
