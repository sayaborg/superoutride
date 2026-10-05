import {
  createSectionPlan,
  readCourseStructure,
  type CourseElement,
  type CourseStructure,
  type SectionPlan,
} from '../authoring/course-structure.js';
import type { SectionDocument } from '../../src/course/course-document.js';
import type { WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { createPlanView, PLAN_LAYERS, type PlanLayer, type PlanStyle } from './course-plan-view.js';

/** The colours of the forms an element is written in. */
const FORM = {
  original: '#ffa657',
  copy: '#f2cc8f',
  reference: '#58a6ff',
  absolute: '#f778ba',
  other: '#8e9aa6',
} as const;

/**
 * An element's form: a repeat's original or copy, else a single element by reference, absolute, or neither. A Strip's
 * laterals are its knots'.
 */
function formColor(element: CourseElement, parts: readonly CourseElement[] = []): string {
  if (element.copies.length) return element.copies.every((copy) => copy.index === 0) ? FORM.original : FORM.copy;
  const laterals = [element, ...parts].flatMap((part) => Object.values(part.laterals));
  if (laterals.some((lateral) => lateral.form === 'reference')) return FORM.reference;
  if (laterals.length) return FORM.absolute;
  return FORM.other;
}
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
    const formColors = make('input', '', { type: 'checkbox' });
    const legend = make('div', '', { class: 'legend' });
    legend.append(
      make('span', '■ written point', { style: 'color:#ffd33d' }),
      make('span', '□ derived point (arc end, curve end, inherited vertex)', { style: 'color:#ffd33d' }),
      make('span', '┄ reference: line to its Boundary', { style: 'color:#58a6ff' }),
      make('span', '━ selected position: measured from its PI', { style: 'color:#ffd33d' }),
      make('span', 'By form: repeat original', { style: `color:${FORM.original}` }),
      make('span', 'repeat copy', { style: `color:${FORM.copy}` }),
      make('span', 'single, by reference', { style: `color:${FORM.reference}` }),
      make('span', 'single, absolute', { style: `color:${FORM.absolute}` }),
    );
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
    const centre = make('div', '', { class: 'course-centre' });
    centre.append(
      field('Cursor s (m)', cursorField),
      ' ',
      layerBoxes,
      ' ',
      field('Color by form', formColors),
      make('br'),
      canvas,
      legend,
      note,
    );
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
    // Each Strip's knots, by the Strip's Pointer, for its form.
    let knotsOf = new Map<string, CourseElement[]>();
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
    /** The elements drawn with a selection: every copy of a repeated record, or everything a repeat holds. */
    const companions = (element: CourseElement | null) => {
      if (!element || !structure) return [];
      const all = structure.sections.flatMap((section) => section.elements);
      if (element.kind === 'repeat') return all.filter((e) => e.copies.some((copy) => copy.path === element.pointer));
      return element.copies.length ? all.filter((e) => e.pointer === element.pointer) : [];
    };
    const select = (element: CourseElement | null, announce = true) => {
      selected = element;
      view.setSelection(
        element?.pointer ?? null,
        companions(element).map((e) => e.pointer),
      );
      showSelection();
      if (element && announce) context.select(path(), element.pointer);
    };
    // The workbench's selection, from the document view or elsewhere: the element at that Pointer or holding it.
    const follow = () => {
      const chosen = context.selection();
      if (!chosen || !structure || chosen.document !== path() || chosen.pointer === selected?.pointer) return;
      const all = structure.sections.flatMap((section) => section.elements);
      let pointer = chosen.pointer;
      for (;;) {
        const match =
          all.find(
            (e) => e.pointer === pointer && e.copies.every((copy) => copy.index === 0) && e.point === 'authored',
          ) ?? all.find((e) => e.pointer === pointer);
        if (match) {
          if (match.section !== sectionId) openSection(match.section);
          select(match, false);
          const shown = match.x !== null ? match : companions(match).find((e) => e.x !== null);
          if (shown) view.centreOn(shown.x!, shown.z!);
          return;
        }
        if (!pointer) return;
        pointer = pointer.slice(0, pointer.lastIndexOf('/'));
      }
    };
    formColors.addEventListener('change', () => view.setStyle(style()));
    /** How elements are drawn: by form when asked, with the marks of references and of the selection. */
    const style = (): PlanStyle => ({
      colorOf: (element) => (formColors.checked ? formColor(element, knotsOf.get(element.pointer)) : null),
      marks: (element, draw) => {
        // A reference: a line to the Boundary it reads, at its station.
        for (const lateral of Object.values(element.laterals))
          if (lateral.form === 'reference' && lateral.l !== null && element.s !== null && element.x !== null) {
            const target = draw.world(element.s, lateral.l - lateral.offset);
            draw.context.strokeStyle = '#58a6ff';
            draw.context.lineWidth = draw.pixel;
            draw.context.setLineDash([2 * draw.pixel, 2 * draw.pixel]);
            draw.context.beginPath();
            draw.context.moveTo(element.x, element.z!);
            draw.context.lineTo(target.x, target.z);
            draw.context.stroke();
            draw.context.setLineDash([]);
          }
        // The selection's Positions: the centreline from each PI it is measured from to where it resolves.
        if (element.pointer === selected?.pointer && element === selected && plan)
          for (const position of Object.values(element.positions)) {
            const from = plan.stations.get(position.pi);
            if (from === undefined || position.s === null) continue;
            draw.context.strokeStyle = '#ffd33d';
            draw.context.lineWidth = 4 * draw.pixel;
            draw.context.beginPath();
            const steps = Math.max(2, Math.ceil(Math.abs(position.s - from) / 2));
            for (let i = 0; i <= steps; i++) {
              const p = draw.world(from + ((position.s - from) * i) / steps, 0);
              if (i) draw.context.lineTo(p.x, p.z);
              else draw.context.moveTo(p.x, p.z);
            }
            draw.context.stroke();
          }
      },
    });
    view.setStyle(style());
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
      const repeat = (pointer: string) => {
        const value = valueAt(document as never, pointer) as { every?: number; count?: number; elements?: unknown[] };
        return `${value?.elements?.length ?? 0} element${value?.elements?.length === 1 ? '' : 's'} × ${value?.count}, every ${value?.every} m`;
      };
      const inside = (e.kind === 'repeat' ? [{ path: e.pointer }] : []).concat(e.copies);
      const problems = diagnosticsOf(e.pointer);
      const lines = [
        `${e.kind} · ${e.point}${e.derivedFrom ? ` from ${e.derivedFrom}` : ''}`,
        ...inside.map((copy, depth) => `${'  '.repeat(depth)}repeat ${copy.path}: ${repeat(copy.path)}`),
        ...problems.map((d) => `diagnostic: ${d.code}: ${d.message} (${d.path})`),
        e.s === null
          ? 'unresolved'
          : `s ${e.s.toFixed(3)} m${e.l === null ? '' : ` · l ${e.l.toFixed(3)} m`}${e.y === null ? '' : ` · y ${e.y.toFixed(3)} m`}`,
        ...Object.entries(e.positions).map(([name, p]) => `${name}: ${p.offset} m from PI ${p.pi}`),
        ...Object.entries(e.laterals).map(([name, l]) =>
          l.form === 'absolute'
            ? `${name}: ${l.value} m (absolute)`
            : `${name}: Boundary ${l.boundary} ${l.offset >= 0 ? '+' : ''}${l.offset} m`,
        ),
        ...e.copies.map((copy) => `this is copy ${copy.index} (0 is the original) of ${copy.path}`),
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
        knotsOf = new Map();
        for (const element of structure?.sections.flatMap((section) => section.elements) ?? [])
          if (element.kind === 'strip-knot') {
            const strip = element.pointer.slice(0, element.pointer.lastIndexOf('/knots/'));
            knotsOf.set(strip, [...(knotsOf.get(strip) ?? []), element]);
          }
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
      view.setSelection(
        selected?.pointer ?? null,
        companions(selected).map((e) => e.pointer),
      );
    };
    /** The compile's diagnostics in this course's document under `pointer`. */
    const diagnosticsOf = (pointer: string) => {
      const state = context.compile();
      if (state.status !== 'failed') return [];
      return state.diagnostics.flatMap((d) => {
        const at = 'path' in d ? (d.path ?? '') : '';
        return 'document' in d && d.document === `content/${path()}` && at.startsWith(pointer)
          ? [{ code: d.code, message: d.message, path: at }]
          : [];
      });
    };
    // Diagnostics show on the element their Pointer falls in.
    const showProblems = () => {
      if (!structure) return;
      const pointers = structure.sections.flatMap((section) => section.elements.map((e) => e.pointer));
      view.setProblems(
        diagnosticsOf('').flatMap(({ path: at }) => {
          const owner = pointers
            .filter((p) => at === p || at.startsWith(`${p}/`))
            .sort((a, b) => b.length - a.length)[0];
          return owner ? [owner] : [];
        }),
      );
    };
    let showing = Promise.resolve();
    const refresh = () => (showing = showing.then(show));
    context.subscribe(() => {
      void refresh().then(() => {
        follow();
        showProblems();
      });
    });
    course.addEventListener('change', () => void refresh());
    void refresh();
  },
};
