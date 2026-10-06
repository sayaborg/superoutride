import {
  bindCourseLateral,
  combineCourseElements,
  explodeCourseRepeat,
  reanchorCoursePosition,
  unbindCourseLateral,
  type CourseFormResult,
} from '../authoring/course-forms.js';
import type { CourseElement, SectionStructure } from '../authoring/course-structure.js';
import type { Json } from '../authoring/json-pointer.js';
import { make } from './dom.js';
import { finiteNumber } from './pending-edit.js';

/** What the form operations read from the course module, and how a chosen one is previewed and committed. */
export interface FormPanelHost {
  document(): Json | null;
  section(): SectionStructure | null;
  /** The elements chosen together on the plan (shift-click), for Combine. */
  group(): readonly string[];
  /** Draw a chosen operation's result on the plan (null when it is dropped or applied). */
  preview(result: CourseFormResult | null): void;
  commit(document: Json, label: string): void;
}

/** A value shown in a change list: JSON, shortened. */
const shown = (value: Json | undefined) => {
  const text = value === undefined ? '—' : JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
};

/**
 * The operations that change how the selected element is written, each chosen by the author: explode an enclosing
 * repeat, combine the chosen group into a repeat, bind or unbind a lateral, re-anchor a Position. Choosing one shows
 * what it changes (each Pointer, before and after) and how far the course moves (the shift) on the plan and in a list;
 * Apply makes it one step.
 */
export function createFormPanel(element: CourseElement, host: FormPanelHost): HTMLElement {
  const panel = make('div', '', { class: 'course-forms' });
  const result = make('div', '', { class: 'course-form-result' });
  const section = host.section();
  const choose = (label: string, operate: () => CourseFormResult) => {
    const document = host.document();
    if (!document) return;
    const outcome = operate();
    host.preview(outcome.ok ? outcome : null);
    if (!outcome.ok) {
      result.replaceChildren(make('p', `${label}: ${outcome.reason}`, { class: 'hint invalid' }));
      return;
    }
    const apply = make('button', 'Apply', { type: 'button' }),
      cancel = make('button', 'Cancel', { type: 'button' });
    apply.addEventListener('click', () => {
      host.preview(null);
      result.replaceChildren();
      host.commit(outcome.document, label);
    });
    cancel.addEventListener('click', () => {
      host.preview(null);
      result.replaceChildren();
    });
    const table = make('table', '', { class: 'course-form-changes' });
    table.append(
      ...outcome.changes.slice(0, 40).map((change) => {
        const row = make('tr');
        row.append(make('td', change.pointer), make('td', shown(change.before)), make('td', shown(change.after)));
        return row;
      }),
    );
    result.replaceChildren(
      make(
        'div',
        `${label}: shift ${outcome.shift < 1e-6 ? '0' : outcome.shift.toFixed(6)} m · ${outcome.changes.length} changes`,
      ),
      table,
      apply,
      cancel,
    );
  };
  // A button for an operation; `named` gives its step's name when it depends on a choice.
  const button = (label: string, operate: () => CourseFormResult, named = () => label) => {
    const b = make('button', label, { type: 'button' });
    b.addEventListener('click', () => choose(named(), operate));
    return b;
  };
  const options = (values: readonly string[]) => {
    const select = make('select');
    select.append(...values.map((value) => make('option', value, { value })));
    return select;
  };
  const document = () => host.document()!;

  // Explode the repeat itself or any repeat holding the element.
  const repeats = [
    ...new Set([...(element.kind === 'repeat' ? [element.pointer] : []), ...element.copies.map((c) => c.path)]),
  ];
  const rows: HTMLElement[] = repeats.map((repeat) =>
    button(`Explode ${repeat}`, () => explodeCourseRepeat(document(), repeat)),
  );
  // Combine the chosen group.
  const group = host.group();
  const tolerance = make('input', '', { type: 'number', step: 'any', min: '0', value: '0' });
  const combine = button(`Combine ${group.length} chosen`, () =>
    combineCourseElements(document(), group, finiteNumber(tolerance.value) ?? 0),
  );
  combine.toggleAttribute('disabled', group.length < 2);
  const combining = make('div');
  combining.append(
    combine,
    ' tolerance (m) ',
    tolerance,
    make('span', ' Shift-click elements to choose them.', { class: 'hint' }),
  );
  rows.push(combining);
  // Bind or unbind each lateral.
  const boundaries = (section?.elements ?? [])
    .filter((e) => e.kind === 'boundary' && !element.pointer.startsWith(`${e.pointer}/`))
    .map((e) => String(e.values.id));
  for (const [field, lateral] of Object.entries(element.laterals)) {
    const row = make('div');
    if (lateral.form === 'reference')
      row.append(
        button(
          `Unbind ${field}`,
          () => unbindCourseLateral(document(), element.pointer, field),
          () => `Unbind ${element.pointer}/${field}`,
        ),
      );
    else {
      const target = options(boundaries);
      row.append(
        button(
          `Bind ${field} to`,
          () => bindCourseLateral(document(), element.pointer, field, target.value),
          () => `Bind ${element.pointer}/${field} to ${target.value}`,
        ),
        ' ',
        target,
      );
    }
    rows.push(row);
  }
  // Re-anchor each Position.
  const pis = (section?.elements ?? []).filter((e) => e.kind === 'pi').map((e) => String(e.values.id));
  for (const [field, position] of Object.entries(element.positions)) {
    const target = options(pis.filter((pi) => pi !== position.pi));
    const row = make('div');
    row.append(
      button(
        `Re-anchor ${field} to PI`,
        () => reanchorCoursePosition(document(), `${element.pointer}/${field}`, target.value),
        () => `Re-anchor ${element.pointer}/${field} to ${target.value}`,
      ),
      ' ',
      target,
    );
    rows.push(row);
  }
  if (element.point === 'derived') return panel;
  panel.append(make('h4', 'Change form'), ...rows, result);
  return panel;
}
