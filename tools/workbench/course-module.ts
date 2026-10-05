import {
  createSectionPlan,
  readCourseStructure,
  type CourseElement,
  type CourseStructure,
  type SectionPlan,
} from '../authoring/course-structure.js';
import type { SectionDocument } from '../../src/course/course-document.js';
import type { WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { createPlanView, PLAN_LAYERS, type PlanLayer } from './course-plan-view.js';
import { make } from './dom.js';
import { confirmField, finiteNumber } from './pending-edit.js';
import { valueAt } from './json-pointer.js';

/**
 * The course editor: a course's Sections and Links, and a Section's plan drawn from the document's form
 * (`readCourseStructure`), with one cursor (Section and s) and one selection, which the document view opens.
 */
export const courseModule: WorkbenchModule = {
  id: 'course',
  title: 'Course',
  mount(element: HTMLElement, context: WorkbenchContext) {
    const course = make('select');
    const sections = make('ul', '', { class: 'course-sections' });
    const cursorField = make('input', '', { type: 'number', step: 'any', min: '0' });
    const layerBoxes = make('span', '', { class: 'layers' });
    const canvas = make('canvas', '', { width: '900', height: '640', class: 'course-plan' });
    const selection = make('div', '', { class: 'course-selection' });
    const note = make('p', '', { role: 'status', class: 'hint' });
    const field = (text: string, control: HTMLElement) => {
      const label = make('label', `${text} `);
      label.append(control);
      return label;
    };
    for (const layer of PLAN_LAYERS) {
      const box = make('input', '', { type: 'checkbox', value: layer, 'data-layer': layer });
      box.checked = true;
      const label = make('label', '', { class: 'layer' });
      label.append(box, layer);
      layerBoxes.append(label);
    }
    const side = make('div', '', { class: 'course-side' });
    side.append(make('h3', 'Sections and Links'), sections, make('h3', 'Selection'), selection);
    const centre = make('div');
    centre.append(field('Cursor s (m)', cursorField), ' ', layerBoxes, make('br'), canvas, note);
    const panes = make('div', '', { class: 'side-by-side' });
    panes.append(side, centre);
    element.append(make('h2', 'Course'), field('Course', course), panes);

    // The open course: its document and form, the open Section, the cursor and the selection.
    let id: string | null = null,
      text: string | null = null,
      document: unknown = null,
      structure: CourseStructure | null = null;
    let sectionId: string | null = null,
      plan: SectionPlan | null = null,
      cursor = 0,
      selected: CourseElement | null = null;
    const path = () => `courses/${id}.course.json`;
    const view = createPlanView(canvas, {
      pick: (picked) => select(picked),
      cursor: (s) => moveCursor(s),
    });

    const openSection = (next: string | null) => {
      sectionId = next;
      const index = structure?.sections.findIndex((section) => section.id === next) ?? -1;
      const section = index >= 0 ? structure!.sections[index]! : null;
      plan = section
        ? createSectionPlan((document as { sections: SectionDocument[] }).sections[index]!, section.pointer).plan
        : null;
      if (selected && selected.section !== next) selected = null;
      view.setSection(section, plan);
      cursor = Math.min(cursor, plan?.length ?? 0);
      cursorField.value = String(Math.round(cursor * 1000) / 1000);
      view.setCursor(cursor);
      showSections();
      showSelection();
    };
    const moveCursor = (s: number) => {
      cursor = Math.max(0, Math.min(s, plan?.length ?? 0));
      cursorField.value = String(Math.round(cursor * 1000) / 1000);
      view.setCursor(cursor);
    };
    const select = (element: CourseElement | null) => {
      selected = element;
      view.setSelection(element?.pointer ?? null);
      showSelection();
    };
    confirmField(cursorField, finiteNumber, moveCursor);
    layerBoxes.addEventListener('change', () =>
      view.setLayers(
        [...layerBoxes.querySelectorAll<HTMLInputElement>('input:checked')].map((box) => box.value as PlanLayer),
      ),
    );

    /** The Sections, each with where its Links go: the entry, forks, merges and the circuit's return. */
    const showSections = () => {
      if (!structure) {
        sections.replaceChildren();
        return;
      }
      const incoming = (section: string) => structure!.links.filter((link) => link.to.sectionId === section).length;
      sections.replaceChildren(
        ...structure.sections.map((section) => {
          const outgoing = structure!.links.filter((link) => link.from.sectionId === section.id);
          const item = make('li');
          const button = make('button', section.id, { type: 'button', 'data-section': section.id });
          if (section.id === sectionId) button.setAttribute('aria-pressed', 'true');
          button.addEventListener('click', () => openSection(section.id));
          const marks = [
            section.id === structure!.entrySectionId ? 'entry' : null,
            outgoing.length > 1 ? `fork ×${outgoing.length}` : null,
            incoming(section.id) > 1 ? 'merge' : null,
            section.length === null ? 'plan does not compile' : `${section.length.toFixed(1)} m`,
          ].filter(Boolean);
          item.append(button, ` ${marks.join(' · ')}`);
          for (const link of outgoing)
            item.append(
              make('div', `→ ${link.to.sectionId} (${link.id}, from ${link.from.carriagewayId})`, { class: 'hint' }),
            );
          return item;
        }),
      );
    };

    /** The selected element: where it is, how it is written, and its record in the document. */
    const showSelection = () => {
      if (!selected) {
        selection.replaceChildren(make('p', 'Choose an element on the plan.', { class: 'hint' }));
        return;
      }
      const e = selected;
      const lines = [
        `${e.kind} · ${e.point}${e.derivedFrom ? ` from ${e.derivedFrom}` : ''}`,
        e.s === null
          ? 'unresolved'
          : `s ${e.s.toFixed(3)} m${e.l === null ? '' : ` · l ${e.l.toFixed(3)} m`}${e.y === null ? '' : ` · y ${e.y.toFixed(3)} m`}`,
        ...Object.entries(e.positions).map(([name, p]) => `${name}: ${p.offset} m from PI ${p.pi}`),
        ...Object.entries(e.laterals).map(([name, l]) =>
          l.form === 'absolute'
            ? `${name}: ${l.value} m (absolute)`
            : `${name}: Boundary ${l.boundary} ${l.offset >= 0 ? '+' : ''}${l.offset} m`,
        ),
        ...e.copies.map((copy) => `copy ${copy.index} of ${copy.count}, every ${copy.every} m (${copy.path})`),
        e.problem ? `problem: ${e.problem.code}: ${e.problem.message} (${e.problem.pointer})` : '',
      ].filter(Boolean);
      const open = make('button', 'Open in Documents', { type: 'button' });
      open.addEventListener('click', () => context.reveal(path(), e.pointer));
      const record = make(
        'pre',
        JSON.stringify(valueAt(document as never, e.pointer) ?? null, null, 1).slice(0, 2000),
        {
          class: 'diff',
        },
      );
      selection.replaceChildren(make('code', e.pointer), ...lines.map((line) => make('div', line)), open, record);
    };

    const show = async () => {
      const courses = context
        .paths()
        .filter((p) => /^courses\/[^/]+\.course\.json$/.test(p))
        .map((p) => p.slice('courses/'.length, -'.course.json'.length));
      if (courses.join() !== [...course.options].map((o) => o.value).join()) {
        const chosen = course.value;
        course.replaceChildren(...courses.map((c) => make('option', c, { value: c })));
        if (courses.includes(chosen)) course.value = chosen;
      }
      const nextId = course.value || null;
      const bytes = nextId ? await context.store.read(`courses/${nextId}.course.json`).catch(() => null) : null;
      const nextText = bytes ? new TextDecoder().decode(bytes) : null;
      if (nextId === id && nextText === text) return;
      const reopened = nextId !== id;
      id = nextId;
      text = nextText;
      try {
        document = nextText === null ? null : JSON.parse(nextText);
        structure = document === null ? null : readCourseStructure(document);
        note.textContent = structure?.admission
          ? `The document does not admit: ${structure.admission.code} at ${structure.admission.pointer}: ${structure.admission.message}`
          : '';
      } catch (error) {
        document = structure = null;
        note.textContent = `${path()} is not JSON: ${error instanceof Error ? error.message : error}`;
      }
      // Keep the Section and the selection across edits; a new course opens at its entry.
      const keep = !reopened && structure?.sections.some((section) => section.id === sectionId);
      if (selected && structure) {
        const again = structure.sections
          .flatMap((section) => section.elements)
          .find((e) => e.pointer === selected!.pointer && e.kind === selected!.kind);
        selected = again ?? null;
      }
      openSection(keep ? sectionId : (structure?.entrySectionId ?? structure?.sections[0]?.id ?? null));
      view.setSelection(selected?.pointer ?? null);
    };
    let showing = Promise.resolve();
    const refresh = () => (showing = showing.then(show));
    context.subscribe(() => void refresh());
    course.addEventListener('change', () => void refresh());
    void refresh();
  },
};
