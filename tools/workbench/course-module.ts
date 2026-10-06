import {
  createSectionPlan,
  lateralLineName,
  createSectionProfile,
  readCourseSection,
  readCourseStructure,
  type CourseElement,
  type CourseStructure,
  type SectionPlan,
} from '../authoring/course-structure.js';
import type { SectionDocument } from '../../src/course/course-document.js';
import type { ProfileReader } from '../../src/course/geometry/profile.js';
import type { WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { createPlanView, PLAN_LAYERS, type PlanLayer, type PlanStyle } from './course-plan-view.js';
import { createProfileView } from './course-profile-view.js';
import { createSectionView } from './course-section-view.js';
import { createGameView } from './course-game-view.js';
import { createFormPanel } from './course-form-panel.js';
import { createCleaningPanel, refreshCleaningPanel } from './course-cleaning-panel.js';
import { createFindingsBar } from './course-findings-bar.js';
import { createUnderlayControls } from './course-underlay-controls.js';
import { createPlanEditing, createProfileEditing, writtenNumbers, type CourseEditHost } from './course-editing.js';
import {
  addCoursePlanElement,
  removeCoursePlanElement,
  setCoursePlanTurn,
  splitCoursePlanElement,
  savedCourseDocument,
  setCourseNumbers,
  type CourseEditResult,
} from '../authoring/course-edits.js';

/** The colours of the forms an element is written in. */
const FORM = {
  original: '#ffa657',
  copy: '#f2cc8f',
  reference: '#58a6ff',
  absolute: '#f778ba',
  other: '#8e9aa6',
} as const;

/** An element's form: a repeat's original or copy, else a single element by reference, absolute, or neither. */
function formColor(element: CourseElement): string {
  if (element.copies.length) return element.copies.every((copy) => copy.index === 0) ? FORM.original : FORM.copy;
  const laterals = Object.values(element.laterals);
  if (laterals.some((lateral) => lateral.form === 'reference')) return FORM.reference;
  if (laterals.length) return FORM.absolute;
  return FORM.other;
}
import { make } from './dom.js';
import { confirmField, finiteNumber } from './pending-edit.js';
import { valueAt, type Json } from '../authoring/json-pointer.js';

/**
 * The course editor: a course's Sections and Links, and four views of a Section seen together — its plan and profile
 * drawn from the document's form (`readCourseStructure`), the cross section at the cursor, and the game's frame there
 * from the compile worker — with one cursor (Section and s) and one selection, which the document view opens.
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
    const profileCanvas = make('canvas', '', { width: '640', height: '220', class: 'course-profile' });
    const sectionCanvas = make('canvas', '', { width: '640', height: '220', class: 'course-cross-section' });
    const gameCanvas = make('canvas', '', { width: '320', height: '240', class: 'course-game' });
    const gameStatus = make('div', '', { class: 'hint course-game-status', role: 'status' });
    const lateralField = make('input', '', { type: 'number', step: 'any', value: '0' });
    const vehicle = make('select');
    const snap = make('select');
    for (const step of ['off', '0.01', '0.1', '0.5', '1', '5', '10'])
      snap.append(make('option', step === 'off' ? 'off' : `${step} m`, { value: step }));
    snap.value = '0.1';
    const newKind = make('select');
    for (const kind of ['straight', 'arc']) newKind.append(make('option', kind, { value: kind }));
    const newLength = make('input', '', { type: 'number', step: 'any', min: '0', value: '100' });
    const newRadius = make('input', '', { type: 'number', step: 'any', min: '0', value: '100' });
    const newTurn = make('select');
    for (const turn of ['left', 'right']) newTurn.append(make('option', turn, { value: turn }));
    const addPlan = make('button', 'Add plan element at cursor', { type: 'button' });
    const removePlan = make('button', 'Remove selected plan element', { type: 'button' });
    const selection = make('div', '', { class: 'course-selection' });
    const formColors = make('input', '', { type: 'checkbox' });
    const legend = make('div', '', { class: 'legend' });
    legend.append(
      make('span', '■ written point', { style: 'color:#ffd33d' }),
      make('span', '□ derived point (Section end, tangent intersection, curve end, inherited vertex)', {
        style: 'color:#ffd33d',
      }),
      make('span', '┄ reference: line to its Boundary', { style: 'color:#58a6ff' }),
      make('span', '━ selected position: measured from its joint', { style: 'color:#ffd33d' }),
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
    const cleaning = createCleaningPanel({
      document: () => document as Json | null,
      section: () => sectionId,
      chosen: () => group,
      mark: (pointers) => {
        marked = pointers;
        showSelected();
      },
      preview: (result) => showPending(result),
      select: (pointer) => context.select(path(), pointer),
      commit: (next, label) => commit(next, label),
    });
    const underlay = createUnderlayControls({
      store: () => context.store,
      course: () => id,
      section: () => sectionId,
      centre: () => plan?.toWorld(cursor, 0) ?? { x: 0, z: 0 },
      show: (next) => view.setUnderlay(next),
      save: (at, value, label) => context.replace(at, value, label),
    });
    const findings = createFindingsBar({
      document: () => document as Json | null,
      query: (query) => context.query(query),
      select: (pointer) => context.select(path(), pointer),
      open: (operation, pointer, amount) => cleaning.findFor(operation, [pointer], amount),
    });
    const views = make('div', '', { class: 'course-views' });
    const game = make('div', '', { class: 'course-game-pane' });
    game.append(gameCanvas, gameStatus);
    views.append(canvas, profileCanvas, sectionCanvas, game);
    const centre = make('div', '', { class: 'course-centre' });
    centre.append(
      field('Cursor s (m)', cursorField),
      ' ',
      layerBoxes,
      ' ',
      field('Color by form', formColors),
      ' ',
      field('Game lateral l (m)', lateralField),
      ' ',
      field('Vehicle', vehicle),
      make('br'),
      field('Snap', snap),
      ' ',
      addPlan,
      ' ',
      newKind,
      ' ',
      field('length (m)', newLength),
      ' ',
      field('radius (m)', newRadius),
      ' ',
      newTurn,
      ' ',
      removePlan,
      findings.element,
      views,
      legend,
      note,
      underlay.element,
      cleaning.element,
    );
    const panes = make('div', '', { class: 'side-by-side' });
    panes.append(side, centre);
    element.append(make('h2', 'Course'), field('Course', course), panes);

    // The open course: its document and form, the open Section, the cursor and the selection.
    let id: string | null = null,
      text: string | null = null,
      document: unknown = null,
      structure: CourseStructure | null = null,
      status = '';
    let sectionId: string | null = null,
      sectionIndex = -1,
      plan: SectionPlan | null = null,
      profile: ProfileReader | null = null,
      cursor = 0,
      lateral = 0,
      // The elements chosen together (the selection and shift-clicked ones), for Combine.
      group: string[] = [],
      // The cleaning candidates' elements, ringed on the plan.
      marked: readonly string[] = [],
      selected: CourseElement | null = null;
    const path = () => `courses/${id}.course.json`;
    /** One step: the edited document replaces the course's. */
    const commit = (next: Json, label: string) => context.replace(path(), savedCourseDocument(next), label);
    const refuse = (result: CourseEditResult) => {
      if (!result.ok) note.textContent = result.reason;
      return result.ok ? result : null;
    };
    const editing: CourseEditHost = {
      document: () => document as Json | null,
      selected: () => selected,
      plan: () => plan,
      elements: () => structure?.sections[sectionIndex]?.elements ?? [],
      step: () => (snap.value === 'off' ? null : Number(snap.value)),
      preview: (result) => showPending(result),
      commit,
    };
    const view = createPlanView(canvas, {
      pick: (picked, additive) => {
        if (!additive || !picked) return select(picked);
        group = group.includes(picked.pointer) ? group.filter((p) => p !== picked.pointer) : [...group, picked.pointer];
        showSelected();
        showSelection();
      },
      cursor: (s) => moveCursor(s),
      grab: (() => {
        const edit = createPlanEditing(editing);
        // The underlay takes a press first while it is being scaled or moved.
        return (at: { x: number; z: number }, pixel: number, picked: CourseElement | null) =>
          underlay.grab(at) ?? edit(at, pixel, picked);
      })(),
    });
    /**
     * A pending edit on the plan, read again through the product's functions alone (no compile); what moves with it is
     * marked. Null ends it and shows the document again.
     */
    const showPending = (result: CourseEditResult | null) => {
      const before = structure?.sections[sectionIndex];
      if (!before) return;
      if (!result) {
        view.setSection(before, plan);
        profileView.setSection(before, plan, profile);
        showSelected();
        note.textContent = status;
        return;
      }
      if (!result.ok) {
        note.textContent = result.reason;
        return;
      }
      const pending = readCourseSection(result.document, sectionIndex);
      view.setSection(pending.structure, pending.plan);
      profileView.setSection(pending.structure, pending.plan, pending.profile);
      const moved = pending.structure.elements
        .filter((e, i) => e.x !== before.elements[i]?.x || e.z !== before.elements[i]?.z)
        .map((e) => e.pointer);
      view.setSelection(selected?.pointer ?? null, moved);
      profileView.setSelection(selected?.pointer ?? null, moved);
      const shown = (value: unknown) =>
        typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
      note.textContent = `Pending: ${result.changes.map((c) => `${c.pointer} ${shown(c.before)} → ${shown(c.after)}`).join(', ')}`;
    };
    const profileView = createProfileView(profileCanvas, {
      pick: (picked) => select(picked),
      cursor: (s) => moveCursor(s),
      grab: createProfileEditing(editing),
    });
    const sectionView = createSectionView(sectionCanvas, { pick: (picked) => select(picked) });
    const gameView = createGameView(gameCanvas, gameStatus, (query) => context.query(query));
    /** Every view at the cursor. */
    const showCursor = () => {
      cursorField.value = String(Math.round(cursor * 1000) / 1000);
      view.setCursor(cursor);
      profileView.setCursor(cursor);
      sectionView.setCursor(cursor);
      gameView.show(
        id && sectionId && plan
          ? { kind: 'render', course: id, section: sectionId, s: cursor, l: lateral, vehicle: vehicle.value || null }
          : null,
      );
    };

    const openSection = (next: string | null) => {
      sectionId = next;
      const index = (sectionIndex = structure?.sections.findIndex((section) => section.id === next) ?? -1);
      const section = index >= 0 ? structure!.sections[index]! : null;
      plan = section
        ? createSectionPlan((document as { sections: SectionDocument[] }).sections[index]!, section.pointer).plan
        : null;
      if (selected && selected.section !== next) selected = null;
      view.setSection(section, plan);
      profile = section
        ? createSectionProfile((document as { sections: SectionDocument[] }).sections[index]!, section.pointer, plan)
            .profile
        : null;
      profileView.setSection(section, plan, profile);
      sectionView.setSection(section);
      // The cursor stays while the plan does not compile.
      if (plan) cursor = Math.min(cursor, plan.length);
      showCursor();
      showSections();
      showSelection();
      void underlay.place();
    };
    const moveCursor = (s: number) => {
      cursor = Math.max(0, Math.min(s, plan?.length ?? 0));
      showCursor();
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
      group = element ? [element.pointer] : [];
      // A form operation's preview belongs to the selection it was chosen for.
      showPending(null);
      showSelected();
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
    /** The selection and its companions in every view. */
    const showSelected = () => {
      const others = [...companions(selected).map((e) => e.pointer), ...group, ...marked];
      view.setSelection(selected?.pointer ?? null, others);
      profileView.setSelection(selected?.pointer ?? null, others);
      sectionView.setSelection(selected?.pointer ?? null);
    };
    formColors.addEventListener('change', () => {
      view.setStyle(style());
      profileView.setStyle(style());
    });
    /** How elements are drawn: by form when asked, with the marks of references and of the selection. */
    const style = (): PlanStyle => ({
      colorOf: (element) => (formColors.checked ? formColor(element) : null),
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
        // The selected arc's tangents, from its ends to where they meet.
        if (element.kind === 'tangent-point' && selected?.pointer === element.pointer && plan) {
          const arc = structure?.sections[sectionIndex]?.elements.find(
            (e) => e.kind === 'plan' && e.pointer === element.pointer,
          );
          if (arc && arc.s !== null) {
            draw.context.strokeStyle = '#ffd33d';
            draw.context.lineWidth = draw.pixel;
            draw.context.setLineDash([4 * draw.pixel, 3 * draw.pixel]);
            draw.context.beginPath();
            const start = draw.world(arc.s, 0),
              end = draw.world(arc.s + Number(arc.values.length), 0);
            draw.context.moveTo(start.x, start.z);
            draw.context.lineTo(element.x!, element.z!);
            draw.context.lineTo(end.x, end.z);
            draw.context.stroke();
            draw.context.setLineDash([]);
          }
        }
        // The selection's Positions: the centreline from each joint it is measured from to where it resolves.
        if (element.pointer === selected?.pointer && element === selected && plan)
          for (const position of Object.values(element.positions)) {
            const from = plan.stations.get(position.joint);
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
    profileView.setStyle(style());
    // A plan element after the one the cursor is on.
    addPlan.addEventListener('click', () => {
      const section = structure?.sections[sectionIndex];
      if (!section || !plan) return;
      const index = section.elements.filter((e) => e.kind === 'plan' && e.s !== null && e.s <= cursor).length;
      const length = finiteNumber(newLength.value) ?? 0;
      const result = refuse(
        addCoursePlanElement(
          document as Json,
          section.pointer,
          index,
          newKind.value === 'arc'
            ? {
                kind: 'arc',
                length,
                radius: finiteNumber(newRadius.value) ?? 0,
                turn: newTurn.value as 'left' | 'right',
              }
            : { kind: 'straight', length },
        ),
      );
      if (result) {
        // The new element is the selection once it is read.
        const pointer = `${section.pointer}/plan/${index}`;
        context.select(path(), pointer);
        commit(result.document, `Add plan element at ${pointer}`);
      }
    });
    removePlan.addEventListener('click', () => {
      if (selected?.kind !== 'plan') return;
      const result = refuse(removeCoursePlanElement(document as Json, selected.pointer));
      if (result) commit(result.document, `Remove ${selected.pointer}`);
    });
    confirmField(cursorField, finiteNumber, moveCursor);
    confirmField(lateralField, finiteNumber, (l) => {
      lateral = l;
      showCursor();
    });
    vehicle.addEventListener('change', showCursor);
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
      const incoming = (section: string) => structure!.links.filter((link) => link.to === section).length;
      sections.replaceChildren(
        ...structure.sections.map((section) => {
          const outgoing = structure!.links.filter((link) => link.from.section === section.id);
          const item = make('li');
          const button = make('button', section.id, { type: 'button', 'data-section': section.id });
          if (section.id === sectionId) button.setAttribute('aria-pressed', 'true');
          button.addEventListener('click', () => openSection(section.id));
          const marks = [
            section.id === structure!.entry ? 'entry' : null,
            outgoing.length > 1 ? `fork ×${outgoing.length}` : null,
            incoming(section.id) > 1 ? 'merge' : null,
            section.length === null ? 'plan does not compile' : `${section.length.toFixed(1)} m`,
          ].filter(Boolean);
          item.append(button, ` ${marks.join(' · ')}`);
          for (const link of outgoing)
            item.append(make('div', `→ ${link.to} (${link.id}, from ${link.from.carriageway})`, { class: 'hint' }));
          return item;
        }),
      );
    };

    /** The selected element: where it is, how it is written, and its record in the document. */
    const showSelection = () => {
      if (!selected) {
        removePlan.disabled = true;
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
        ...Object.entries(e.positions).map(([name, p]) => `${name}: ${p.offset} m from ${p.joint}`),
        ...Object.entries(e.laterals).map(([name, l]) =>
          l.form === 'absolute'
            ? `${name}: ${l.value} m (absolute)`
            : `${name}: ${lateralLineName(l)} ${l.offset >= 0 ? '+' : ''}${l.offset} m`,
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
      // Each written number, set by its field: one step.
      const numbers = make('div', '', { class: 'course-numbers' });
      for (const written of writtenNumbers(e, document as Json)) {
        const input = make('input', '', { type: 'number', step: 'any', value: String(written.value) });
        input.dataset.pointer = written.pointer;
        confirmField(input, finiteNumber, (value) => {
          const result = refuse(setCourseNumbers(document as Json, [{ pointer: written.pointer, value }]));
          if (result?.changes.length) commit(result.document, `Set ${written.pointer}`);
        });
        numbers.append(field(written.label, input));
      }
      if (e.kind === 'plan' && e.s !== null) {
        // An arc's turn, and a split of the element at the cursor.
        if (e.values.kind === 'arc') {
          const turn = make('select');
          for (const side of ['left', 'right']) turn.append(make('option', side, { value: side }));
          turn.value = String(e.values.turn);
          turn.addEventListener('change', () => {
            const result = refuse(setCoursePlanTurn(document as Json, e.pointer, turn.value as 'left' | 'right'));
            if (result?.changes.length) commit(result.document, `Set ${e.pointer}/turn`);
          });
          numbers.append(field('turn', turn));
        }
        const split = make('button', 'Split at cursor', { type: 'button' });
        split.addEventListener('click', () => {
          const result = refuse(splitCoursePlanElement(document as Json, e.pointer, cursor - e.s!));
          if (result) commit(result.document, `Split ${e.pointer}`);
        });
        numbers.append(' ', split);
      }
      removePlan.disabled = e.kind !== 'plan';
      selection.replaceChildren(
        make('code', e.pointer),
        ...lines.map((line) => make('div', line)),
        numbers,
        createFormPanel(e, {
          document: () => document as Json | null,
          section: () => structure?.sections[sectionIndex] ?? null,
          group: () => group,
          preview: (result) => showPending(result),
          commit: (next, label) => {
            group = [];
            commit(next, label);
          },
        }),
        open,
        record,
      );
    };

    const show = async () => {
      const courses = context
        .paths()
        .filter((p) => /^courses\/[^/]+\.course\.json$/.test(p))
        .map((p) => p.slice('courses/'.length, -'.course.json'.length));
      const vehicles = context
        .paths()
        .filter((p) => /^vehicles\/[^/]+\.json$/.test(p))
        .map((p) => p.slice('vehicles/'.length, -'.json'.length));
      if (vehicles.join() !== [...vehicle.options].map((o) => o.value).join()) {
        const chosen = vehicle.value;
        vehicle.replaceChildren(...vehicles.map((v) => make('option', v, { value: v })));
        if (vehicles.includes(chosen)) vehicle.value = chosen;
      }
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
        status = structure?.admission
          ? `The document does not admit: ${structure.admission.code} at ${structure.admission.pointer}: ${structure.admission.message}`
          : '';
        note.textContent = status;
      } catch (error) {
        document = structure = null;
        note.textContent = status = `${path()} is not JSON: ${error instanceof Error ? error.message : error}`;
      }
      // Keep the Section and the selection across edits; a new course opens at its entry.
      const keep = !reopened && structure?.sections.some((section) => section.id === sectionId);
      if (selected && structure) {
        const again = structure.sections
          .flatMap((section) => section.elements)
          .find((e) => e.pointer === selected!.pointer && e.kind === selected!.kind);
        selected = again ?? null;
      }
      openSection(keep ? sectionId : (structure?.entry ?? structure?.sections[0]?.id ?? null));
      showSelected();
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
        refreshCleaningPanel(cleaning.element);
        findings.update();
        // The game's frame follows the latest compile that succeeded, stale while the document is newer.
        const state = context.compile();
        if (state.last) gameView.compiled(state.last.step, state.status === 'ok');
      });
    });
    course.addEventListener(
      'change',
      () =>
        void refresh().then(() => {
          refreshCleaningPanel(cleaning.element);
          findings.update();
        }),
    );
    void refresh();
  },
};
