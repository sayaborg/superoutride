import type { CleaningCandidate, CleaningProposal } from '../authoring/course-cleaning.js';
import {
  FINDING_KINDS,
  type CourseFinding,
  type FindingKind,
  type FindingOptions,
} from '../authoring/course-findings.js';
import type { Json } from '../authoring/json-pointer.js';
import type { FindingsAnswer, FindingsRequest } from './findings-worker.js';
import { make } from '../browser-shared/dom.js';
import { confirmField, finiteNumber } from '../browser-shared/pending-edit.js';

/** The cleaning operation each finding's operation opens in the Clean panel, with the amount it uses. */
const OPENS = { round: 'round', 'remove-knots': 'knots', join: 'join', merge: 'merge' } as const;

/** What the findings bar reads and does: the document, selecting a place and showing a candidate. */
export interface FindingsBarHost {
  document(): Json | null;
  select(pointer: string): void;
  open(
    operation: (typeof OPENS)[keyof typeof OPENS],
    candidate: CleaningCandidate | CleaningProposal,
    document: Json,
    amount: number,
  ): void;
}

/** Whether the findings bar is open, as the browser keeps it. */
const OPEN = 'superoutride.course-editor.findings-open';

/**
 * The course's findings, apart from its diagnostics: counts by kind, worked out while the bar is open, in a worker of
 * their own apart from the compile, for the document's latest version with the chosen step and tolerances. A kind lists
 * its findings; choosing one goes to its place on the plan and shows the candidate it was found as in its cleaning
 * operation, with the amounts it was found with.
 */
export function createFindingsBar(host: FindingsBarHost) {
  const bar = make('details', '', { class: 'course-findings' });
  const counts = make('span');
  const list = make('ul', '', { class: 'course-finding-list' });
  const step = make('input', '', { type: 'number', step: 'any', min: '0', value: '0.001' });
  const tolerance = make('input', '', { type: 'number', step: 'any', min: '0', value: '0.1' });
  const colour = make('input', '', { type: 'number', step: '1', min: '0', value: '1' });
  const field = (text: string, control: HTMLElement) => {
    const label = make('label', ` ${text} `);
    label.append(control);
    return label;
  };
  const settings = make('details');
  settings.append(
    make('summary', 'settings'),
    field('step (m)', step),
    field('near (m)', tolerance),
    field('colour steps', colour),
  );
  const summary = make('summary');
  summary.append(make('strong', 'Findings'));
  bar.append(summary, counts, settings, list);
  try {
    bar.open = localStorage.getItem(OPEN) === 'true';
  } catch {
    // Without the browser's storage the bar opens closed.
  }

  // One worker finds them, one request at a time. A request overtaken by a newer one is stopped by ending the worker
  // (its answer never comes), and the next request starts another.
  let worker: Worker | null = null,
    running: { readonly id: number; readonly resolve: (answer: FindingsAnswer) => void } | null = null,
    ids = 0;
  const stop = () => {
    worker?.terminate();
    worker = null;
    running = null;
  };
  const find = (document: Json, options: FindingOptions) =>
    new Promise<FindingsAnswer>((resolve) => {
      if (running) stop();
      if (!worker) {
        const started = new Worker(new URL('../../tools/course-editor/findings-worker.js', location.href), {
          type: 'module',
        });
        started.addEventListener('message', ({ data }: MessageEvent<FindingsAnswer>) => {
          if (running?.id !== data.id) return;
          const { resolve } = running;
          running = null;
          resolve(data);
        });
        started.addEventListener('error', (event) => {
          const failed = running;
          stop();
          failed?.resolve({ id: failed.id, error: event.message || 'the findings worker failed' });
        });
        worker = started;
      }
      running = { id: ++ids, resolve };
      worker.postMessage({ id: ids, document, ...options } satisfies FindingsRequest);
    });

  // The findings belong to the document and amounts they were found with.
  let findings: readonly CourseFinding[] = [],
    found: { document: Json; amounts: FindingOptions } | null = null,
    shown: FindingKind | null = null,
    asked = 0,
    failure: string | null = null,
    timer: ReturnType<typeof setTimeout> | undefined;
  const amounts = () => ({
    step: finiteNumber(step.value) ?? 0.001,
    tolerance: finiteNumber(tolerance.value) ?? 0.1,
    colorTolerance: finiteNumber(colour.value) ?? 1,
  });
  const showList = () => {
    list.replaceChildren(
      ...findings
        .filter((finding) => finding.kind === shown)
        .slice(0, 200)
        .map((finding) => {
          const item = make('li');
          const go = make('button', finding.description, { type: 'button', class: 'link' });
          go.addEventListener('click', () => {
            host.select(finding.pointer);
            if (!finding.operation || !finding.candidate || !found) return;
            const { step: s, tolerance: t, colorTolerance: c } = found.amounts;
            const operation = OPENS[finding.operation];
            host.open(
              operation,
              finding.candidate,
              found.document,
              { round: s, knots: 0, join: t, merge: c }[operation],
            );
          });
          item.append(go);
          return item;
        }),
    );
  };
  const showCounts = (pending: boolean) => {
    counts.replaceChildren(
      ...(Object.keys(FINDING_KINDS) as FindingKind[]).map((kind) => {
        const n = findings.filter((finding) => finding.kind === kind).length;
        const button = make('button', `${kind} ${n}`, { type: 'button', 'data-kind': kind });
        if (kind === shown) button.setAttribute('aria-pressed', 'true');
        button.addEventListener('click', () => {
          shown = shown === kind ? null : kind;
          showCounts(false);
          showList();
        });
        return button;
      }),
      pending ? make('span', ' updating…', { class: 'hint' }) : '',
      failure ? make('span', ` not found: ${failure}`, { class: 'hint' }) : '',
    );
  };
  /**
   * Find them again shortly after the latest change, while the bar is open; only the latest document's are worked out
   * and shown. While it is closed nothing is found, and what was found is put away with the document it belongs to.
   */
  const update = () => {
    clearTimeout(timer);
    const ticket = ++asked;
    if (!bar.open) {
      stop();
      findings = [];
      found = null;
      failure = null;
      counts.replaceChildren();
      showList();
      return;
    }
    showCounts(true);
    timer = setTimeout(async () => {
      const document = host.document();
      if (document === null) {
        findings = [];
        found = null;
        failure = null;
        showCounts(false);
        showList();
        return;
      }
      const asking = amounts();
      const answer = await find(document, asking);
      if (ticket !== asked) return;
      findings = answer.findings ?? [];
      failure = answer.error ?? null;
      found = { document, amounts: asking };
      showCounts(false);
      showList();
    }, 300);
  };
  bar.addEventListener('toggle', () => {
    try {
      localStorage.setItem(OPEN, String(bar.open));
    } catch {
      // The choice lasts as long as the page.
    }
    update();
  });
  for (const input of [step, tolerance, colour]) confirmField(input, finiteNumber, update);
  return { element: bar, update };
}
