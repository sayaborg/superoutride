import { FINDING_KINDS, type CourseFinding, type FindingKind } from '../authoring/course-findings.js';
import type { Json } from '../authoring/json-pointer.js';
import type { CourseQuery, QueryResponse } from './compile-protocol.js';
import { make } from './dom.js';
import { confirmField, finiteNumber } from './pending-edit.js';

/** The cleaning operation each finding's operation opens in the Clean panel, with the amount it uses. */
const OPENS = { round: 'round', 'remove-knots': 'knots', join: 'join', merge: 'merge' } as const;

/** What the findings bar reads and does: the document, the worker, selecting a place and opening candidates. */
export interface FindingsBarHost {
  document(): Json | null;
  query(query: CourseQuery): Promise<QueryResponse>;
  select(pointer: string): void;
  open(operation: (typeof OPENS)[keyof typeof OPENS], pointer: string, amount: number): void;
}

/**
 * The course's findings, apart from its diagnostics: counts by kind, always visible, worked out by the compile worker
 * after each change with the chosen step and tolerances. A kind lists its findings; choosing one goes to its place on
 * the plan and opens its cleaning operation's candidates there.
 */
export function createFindingsBar(host: FindingsBarHost) {
  const bar = make('div', '', { class: 'course-findings' });
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
  bar.append(make('strong', 'Findings '), counts, settings, list);

  let findings: readonly CourseFinding[] = [],
    shown: FindingKind | null = null,
    asked = 0,
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
            if (!finding.operation) return;
            const { step: s, tolerance: t, colorTolerance: c } = amounts();
            const operation = OPENS[finding.operation];
            host.open(operation, finding.pointer, { round: s, knots: 0, join: t, merge: c }[operation]);
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
    );
  };
  /** Ask the worker again, shortly after the latest change; only the newest answer is shown. */
  const update = () => {
    clearTimeout(timer);
    showCounts(true);
    timer = setTimeout(async () => {
      const document = host.document();
      const ticket = ++asked;
      if (document === null) {
        findings = [];
        showCounts(false);
        showList();
        return;
      }
      const answer = await host.query({ kind: 'findings', document, ...amounts() });
      if (ticket !== asked) return;
      findings = answer.kind === 'findings' ? answer.findings : [];
      showCounts(false);
      showList();
    }, 300);
  };
  for (const input of [step, tolerance, colour]) confirmField(input, finiteNumber, update);
  return { element: bar, update };
}
