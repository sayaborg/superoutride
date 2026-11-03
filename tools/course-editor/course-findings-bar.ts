import type { CleaningCandidate, CleaningProposal } from '../authoring/course-cleaning.js';
import {
  FINDING_KINDS,
  type CourseFinding,
  type FindingKind,
  type FindingOptions,
} from '../authoring/course-findings.js';
import type { Json } from '../authoring/json-pointer.js';
import { createCourseSearch } from './course-search.js';
import { make } from '../browser-shared/dom.js';
import { confirmField, finiteNumber } from '../browser-shared/pending-edit.js';

/** The cleaning operation each finding's operation opens in the Clean panel, with the amount it uses. */
const OPENS = { round: 'round', 'remove-knots': 'knots', join: 'join', merge: 'merge' } as const;

/** What the findings bar reads and does: the document, selecting a place and showing a candidate. */
export interface FindingsBarHost {
  document(): Json | null;
  /** The document's text, null when there is no document. */
  text(): string | null;
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

  // One worker finds them, one request at a time (`createCourseSearch`): a newer request ends the one under way.
  const search = createCourseSearch();
  const stop = search.stop;
  const find = (text: string, options: FindingOptions) => search.ask({ kind: 'findings', text, ...options });

  // The findings belong to the document and amounts they were found with.
  let findings: readonly CourseFinding[] = [],
    found: { document: Json; amounts: FindingOptions } | null = null,
    shown: FindingKind | null = null,
    // The document and amounts last asked for, found or being found: asking for them again changes nothing.
    asking: { readonly document: Json; readonly amounts: FindingOptions } | null = null,
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
  const sameAmounts = (a: FindingOptions, b: FindingOptions) =>
    a.step === b.step && a.tolerance === b.tolerance && a.colorTolerance === b.colorTolerance;
  /**
   * Find them again shortly after a change of the document (its object, which the course module keeps while its text
   * is the same) or of the amounts, while the bar is open; a notification that changes neither (a compile, a
   * selection, a save) asks nothing. Only the latest document's are worked out and shown. While the bar is closed
   * nothing is found, and what was found is put away with the document it belongs to.
   */
  const update = () => {
    clearTimeout(timer);
    if (!bar.open) {
      stop();
      asking = null;
      findings = [];
      found = null;
      failure = null;
      counts.replaceChildren();
      showList();
      return;
    }
    const unchanged = (document: Json | null) =>
      document !== null && asking?.document === document && sameAmounts(asking.amounts, amounts());
    if (unchanged(host.document())) return;
    showCounts(true);
    timer = setTimeout(async () => {
      const document = host.document();
      if (unchanged(document)) {
        // Back to what was asked last: its findings, or still being found.
        showCounts(asking !== found);
        return;
      }
      if (document === null) {
        stop();
        asking = null;
        findings = [];
        found = null;
        failure = null;
        showCounts(false);
        showList();
        return;
      }
      const request = { document, amounts: amounts() };
      asking = request;
      const answer = await find(host.text()!, request.amounts);
      if (asking !== request) return;
      findings = answer.findings ?? [];
      failure = answer.error ?? null;
      found = request;
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
