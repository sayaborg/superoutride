import {
  applyCleaning,
  ROUNDED_VALUES,
  sameValueGroups,
  withShifts,
  type CleaningCandidate,
  type CleaningProposal,
  type CleaningRequest,
  type CleaningResult,
  type CleaningScope,
} from '../authoring/course-cleaning.js';
import type { Json } from '../authoring/json-pointer.js';
import { make } from '../browser-shared/dom.js';
import { finiteNumber } from '../browser-shared/pending-edit.js';
import { stripColor } from './course-plan-view.js';
import type { CourseQuery, QueryResponse } from '../browser-shared/compile-protocol.js';

/** What the cleaning panel reads from the course module, and how it shows and commits candidates. */
export interface CleaningPanelHost {
  document(): Json | null;
  /** The open Section's id. */
  section(): string | null;
  /** The selection and the elements chosen with it. */
  chosen(): readonly string[];
  /** Ring the candidates' elements on the plan (empty to stop). */
  mark(pointers: readonly string[]): void;
  /** Draw the chosen candidates applied (null to stop). */
  preview(result: CleaningResult | null): void;
  /** Select an element on the plan and in the document. */
  select(pointer: string): void;
  commit(document: Json, label: string): void;
  /** Whether the open course takes edits; an original course is read-only, so its candidates are only listed. */
  editable(): boolean;
  /** Ask the compile worker, where the candidates are found off the page's thread. */
  query(query: CourseQuery): Promise<QueryResponse>;
}

const STALE =
  'Applying any changes the course, so its measured products become stale; the driving changes only where the shift is not 0.';

const OPERATIONS = {
  round: 'Round values',
  knots: 'Remove unneeded knots',
  join: 'Join near things',
  merge: 'Merge equal things',
} as const;

/**
 * The cleaning operations in two phases: "Find candidates" lists each with what it changes and its shift (whether the
 * driving changes) and rings it on the plan; "Apply chosen" makes the checked ones one step, after a preview of their
 * shift and each Section's centreline shift and length change. What is written alike is shown below, unchanged.
 */
export function createCleaningPanel(host: CleaningPanelHost) {
  const panel = make('details', '', { class: 'course-cleaning' });
  const operation = make('select');
  for (const [value, label] of Object.entries(OPERATIONS)) operation.append(make('option', label, { value }));
  const scope = make('select');
  for (const [value, label] of [
    ['course', 'Whole course'],
    ['section', 'This Section'],
    ['chosen', 'Selection'],
  ] as const)
    scope.append(make('option', label, { value }));
  const step = make('input', '', { type: 'number', step: 'any', min: '0', value: '0.1' });
  const tolerance = make('input', '', { type: 'number', step: 'any', min: '0', value: '0' });
  const values = make('span');
  for (const value of ROUNDED_VALUES) {
    const box = make('input', '', { type: 'checkbox', value });
    box.checked = value === 'length' || value === 'radius';
    const label = make('label');
    label.append(box, ` ${value} `);
    values.append(label);
  }
  const find = make('button', 'Find candidates', { type: 'button' });
  const status = make('p', '', { class: 'hint', role: 'status' });
  const list = make('div', '', { class: 'course-candidates' });
  const groups = make('div', '', { class: 'course-groups' });
  const field = (text: string, control: HTMLElement) => {
    const label = make('label', `${text} `);
    label.append(control);
    return label;
  };
  const stepField = field('Step (m)', step),
    toleranceField = field('Tolerance', tolerance);
  // Each operation's parameters.
  const showParameters = () => {
    const kind = operation.value as keyof typeof OPERATIONS;
    stepField.hidden = values.hidden = kind !== 'round';
    toleranceField.hidden = kind === 'round';
    toleranceField.firstChild!.textContent = kind === 'merge' ? 'Colour tolerance (5-bit steps) ' : 'Tolerance (m) ';
    if (kind === 'join' && tolerance.value === '0') tolerance.value = '0.1';
  };
  operation.addEventListener('change', showParameters);
  showParameters();

  // The candidates belong to the document they were found in; a changed document discards them.
  let candidates: CleaningCandidate[] = [],
    source: Json | null = null,
    searches = 0;
  const checked = () =>
    candidates.filter((_, i) => list.querySelector<HTMLInputElement>(`input[data-candidate="${i}"]`)?.checked);
  const clear = () => {
    host.preview(null);
    host.mark([]);
  };
  const discard = () => {
    clear();
    searches++;
    candidates = [];
    source = null;
    list.replaceChildren();
  };
  /** Find the chosen operation's candidates over the chosen scope, each checked. */
  const search = () => {
    const document = host.document();
    if (!document) return;
    const where: CleaningScope =
      scope.value === 'section'
        ? { section: host.section() ?? '' }
        : scope.value === 'chosen'
          ? { pointers: host.chosen() }
          : {};
    status.textContent = 'Finding…';
    discard();
    const kind = operation.value as keyof typeof OPERATIONS;
    const amount = finiteNumber(tolerance.value) ?? 0;
    const request: CleaningRequest =
      kind === 'round'
        ? {
            operation: kind,
            step: finiteNumber(step.value) ?? 0.1,
            values: [...values.querySelectorAll<HTMLInputElement>('input:checked')].map(
              (box) => box.value as (typeof ROUNDED_VALUES)[number],
            ),
            scope: where,
          }
        : kind === 'merge'
          ? { operation: kind, colorTolerance: amount, scope: where }
          : { operation: kind, tolerance: amount, scope: where };
    // Only the latest search not discarded, while its document stands, shows its candidates.
    const ticket = searches;
    void host.query({ kind: 'candidates', document, request }).then((answer) => {
      if (ticket !== searches) return;
      if (host.document() !== document) {
        status.textContent = 'The document changed; find the candidates again.';
        return;
      }
      if (answer.kind !== 'candidates') {
        status.textContent = answer.kind === 'failed' ? answer.message : '';
        return;
      }
      candidates = answer.candidates;
      source = document;
      status.textContent = `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} · ${Math.round(answer.milliseconds)} ms. ${STALE}`;
      showCandidates();
    });
  };
  find.addEventListener('click', () => search());

  const showCandidates = () => {
    host.mark(candidates.map((c) => c.pointer));
    const table = make('table', '', { class: 'course-form-changes' });
    candidates.forEach((candidate, i) => {
      const row = make('tr');
      const box = make('input', '', { type: 'checkbox', 'data-candidate': String(i) });
      box.checked = true;
      const where = make('button', candidate.description, { type: 'button', class: 'link' });
      where.addEventListener('click', () => host.select(candidate.pointer));
      const moves = Number.isFinite(candidate.shift)
        ? candidate.shift === 0
          ? 'no change to driving'
          : `driving changes: ${candidate.shift.toFixed(3)} m`
        : 'does not resolve';
      const cell = make('td');
      cell.append(box);
      const description = make('td');
      description.append(where);
      row.append(cell, description, make('td', moves));
      table.append(row);
    });
    const preview = make('button', 'Preview chosen', { type: 'button' }),
      apply = make('button', 'Apply chosen', { type: 'button' }),
      drop = make('button', 'Clear', { type: 'button' });
    const summary = make('div', '', { class: 'hint' });
    preview.addEventListener('click', () => {
      const document = host.document();
      if (!document || document !== source) return;
      const result = applyCleaning(document, checked());
      host.preview(result);
      summary.textContent = `Shift ${result.shift.toFixed(3)} m · ${result.sections
        .map(
          (s) =>
            `${s.id}: centreline ${s.centreline.toFixed(3)} m, length ${s.length >= 0 ? '+' : ''}${s.length.toFixed(3)} m`,
        )
        .join(' · ')}`;
    });
    apply.addEventListener('click', () => {
      const document = host.document(),
        chosen = checked();
      if (!document || document !== source || !chosen.length) return;
      discard();
      host.commit(
        applyCleaning(document, chosen).document,
        `${OPERATIONS[operation.value as keyof typeof OPERATIONS]}: ${chosen.length}`,
      );
    });
    drop.addEventListener('click', () => {
      discard();
      status.textContent = '';
    });
    list.replaceChildren(table, preview, ...(host.editable() ? [apply] : []), drop, summary);
  };

  /** What is written alike: colours with their uses, reference groups and absolute values. */
  const showGroups = () => {
    const document = host.document();
    if (!document || !panel.open) return;
    const alike = sameValueGroups(document);
    const colours = make('div');
    for (const { color, count } of alike.colors) {
      const swatch = make('span', '', {
        class: 'swatch',
        title: `RGB555 ${color}`,
        style: `background:${stripColor(color)}`,
      });
      colours.append(swatch, ` ${color} ×${count}  `);
    }
    groups.replaceChildren(
      make('h4', 'Written alike'),
      colours,
      make(
        'div',
        `References: ${alike.references.map((r) => `${r.boundary} ${r.offset >= 0 ? '+' : ''}${r.offset} ×${r.count}`).join(', ')}`,
      ),
      make('div', `Absolute laterals: ${alike.absolutes.map((a) => `${a.value} ×${a.count}`).join(', ')}`),
    );
  };
  panel.addEventListener('toggle', showGroups);
  /**
   * Show a finding's candidate alone and checked, with the operation, scope (the whole course) and amount it was found
   * with; a proposal is measured first. "Find candidates" then searches as chosen.
   */
  const show = (
    kind: keyof typeof OPERATIONS,
    candidate: CleaningCandidate | CleaningProposal,
    document: Json,
    amount: number,
  ) => {
    panel.open = true;
    operation.value = kind;
    scope.value = 'course';
    showParameters();
    (kind === 'round' ? step : tolerance).value = String(amount);
    if (kind === 'round') for (const box of values.querySelectorAll<HTMLInputElement>('input')) box.checked = true;
    discard();
    if (host.document() !== document) {
      status.textContent = 'The document changed; find the candidates again.';
      return;
    }
    candidates = 'shift' in candidate ? [candidate] : withShifts(document, [candidate]);
    source = document;
    status.textContent = `The finding's candidate. ${STALE}`;
    showCandidates();
  };

  panel.append(
    make('summary', 'Clean'),
    field('Operation', operation),
    ' ',
    field('Scope', scope),
    ' ',
    stepField,
    ' ',
    toleranceField,
    make('br'),
    values,
    find,
    status,
    list,
    groups,
  );
  /**
   * Follow the host's state: a document other than the candidates' discards them (a selection change keeps them), and
   * what is written alike is shown again.
   */
  const refresh = () => {
    if (source !== null && host.document() !== source) {
      discard();
      status.textContent = 'The document changed; find the candidates again.';
    }
    showGroups();
  };
  return { element: panel, show, refresh };
}
