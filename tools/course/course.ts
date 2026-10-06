import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
interface RenderFrame {
  output: string;
  section: string;
  s: number;
  l: number;
  vehicle: string;
  stats: RenderMeasurements;
}
import path from 'node:path';
import { PNG } from 'pngjs';
import type { RenderMeasurements } from '../../src/view/renderer.js';
import { createCourseFrameRenderer } from '../authoring/course-views.js';
import { expandRgb555Pixels } from '../../src/image/rgb555.js';
import { writeCourseReport } from './course-report.js';
import { options, loadCourse, requireInput, finite, atomicWrite, reportError, jsonFile } from './authoring-io.js';
import { readCourseStructure } from '../authoring/course-structure.js';
import {
  savedCourseDocument,
  addCoursePlanElement,
  moveCourseElement,
  removeCoursePlanElement,
  setCourseNumbers,
  type CourseEditResult,
} from '../authoring/course-edits.js';
import type { Json } from '../authoring/json-pointer.js';
import {
  applyCleaning,
  joinCandidates,
  mergeCandidates,
  roundCandidates,
  sameValueGroups,
  ROUNDED_VALUES,
  unneededKnotCandidates,
  type CleaningScope,
  type RoundedValue,
} from '../authoring/course-cleaning.js';
import type { CourseElementKind } from '../authoring/course-structure.js';
import { countFindings, courseFindings } from '../authoring/course-findings.js';
import {
  bindCourseLateral,
  combineCourseElements,
  explodeCourseRepeat,
  unbindCourseLateral,
  type CourseFormResult,
} from '../authoring/course-forms.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { normalizeCoursePositions } from '../authoring/course-joints.js';
import {
  addCourseLane,
  moveCourseLane,
  removeCourseLane,
  removeCourseWidthKnot,
  setCourseCenterLane,
  taperCourseWidth,
} from '../authoring/course-lane-edits.js';

const EDITS = [
  'set',
  'move',
  'add-plan',
  'remove-plan',
  'normalize',
  'add-lane',
  'remove-lane',
  'move-lane',
  'center-lane',
  'taper',
  'remove-width',
];
const FORMS = ['explode', 'combine', 'bind', 'unbind'];
const CLEANING = ['round', 'remove-knots', 'join', 'merge', 'same'];
const FINDINGS = 'findings';
const [verb, file, ...args] = process.argv.slice(2);
try {
  requireInput(
    ['compile', 'render', 'report', 'structure', ...EDITS, ...FORMS, ...CLEANING, FINDINGS].includes(verb!) && file,
    '/arguments',
    `Usage: npm run course -- compile|render|report|structure|${[...EDITS, ...FORMS, ...CLEANING, FINDINGS].join('|')} course.json [options]`,
  );
  if (EDITS.includes(verb!)) await editVerb(file);
  else if (FORMS.includes(verb!)) await formVerb(file);
  else if (CLEANING.includes(verb!)) await cleaningVerb(file);
  else if (verb === FINDINGS) {
    // Findings never fail the command: they are printed, by kind, and the exit code is 0.
    const opts = options(args, ['--step', '--tolerance', '--color-tolerance']);
    const number = (flag: string, otherwise: number, min = 0) =>
      opts.has(flag) ? finite(Number(opts.get(flag)), `/${flag.slice(2)}`, min) : otherwise;
    const findings = courseFindings((await jsonFile(file)).value as Json, {
      step: number('--step', 0.001, 1e-9),
      tolerance: number('--tolerance', 0.1),
      colorTolerance: number('--color-tolerance', 1),
    });
    console.log(JSON.stringify({ ok: true, counts: countFindings(findings), findings }));
  } else if (verb === 'structure') {
    // The form of the document as saved, compiled or not: read alone, without the content.
    const opts = options(args, ['--section']);
    const structure = readCourseStructure((await jsonFile(file)).value);
    const sections = opts.has('--section')
      ? structure.sections.filter((section) => section.id === opts.get('--section'))
      : structure.sections;
    requireInput(sections.length, '/section', 'Unknown Section');
    console.log(JSON.stringify({ ok: true, ...structure, sections }));
  } else await compiledCourseVerb(file);
} catch (error) {
  reportError(error);
}

/**
 * The edits that keep the document's form, read from the document as saved: the changed values are printed, and with
 * `--out` the edited document is written in the saved layout.
 */
async function editVerb(file: string) {
  const flags = {
    set: ['--values'],
    move: ['--element', '--ds', '--dl', '--fields', '--step'],
    'add-plan': ['--section', '--index', '--kind', '--length', '--radius', '--turn'],
    'remove-plan': ['--element'],
    normalize: [],
    'add-lane': ['--section', '--index', '--kind', '--width'],
    'remove-lane': ['--element'],
    'move-lane': ['--element', '--step'],
    'center-lane': ['--section', '--lane'],
    taper: ['--element', '--start', '--end', '--width'],
    'remove-width': ['--element'],
  }[verb!]!;
  const opts = options(args, [...flags, '--out']);
  const document = (await jsonFile(file)).value as Json;
  const number = (flag: string) => finite(Number(opts.get(flag)), `/${flag.slice(2)}`);
  let result: CourseEditResult;
  if (verb === 'set') {
    requireInput(opts.has('--values'), '/values', 'Name the values: /pointer=number,...');
    result = setCourseNumbers(
      document,
      opts
        .get('--values')!
        .split(',')
        .map((pair) => {
          const at = pair.lastIndexOf('=');
          requireInput(at > 0, '/values', `Expected /pointer=number: ${pair}`);
          return { pointer: pair.slice(0, at), value: finite(Number(pair.slice(at + 1)), '/values') };
        }),
    );
  } else if (verb === 'move') {
    const pointer = opts.get('--element');
    const elements = readCourseStructure(document).sections.flatMap((section) => section.elements);
    const element =
      elements.find((e) => e.pointer === pointer && e.point === 'authored') ??
      elements.find((e) => e.pointer === pointer);
    requireInput(element, '/element', 'Name an element by its Pointer');
    result = moveCourseElement(document, element, {
      ds: opts.has('--ds') ? number('--ds') : 0,
      dl: opts.has('--dl') ? number('--dl') : 0,
      ...(opts.has('--fields') ? { fields: opts.get('--fields')!.split(',') } : {}),
      step: opts.has('--step') ? number('--step') : null,
    });
  } else if (verb === 'add-plan') {
    const kind = opts.get('--kind');
    requireInput(kind === 'straight' || kind === 'arc', '/kind', 'The kind is straight or arc');
    const turn = opts.get('--turn');
    requireInput(kind === 'straight' || turn === 'left' || turn === 'right', '/turn', 'An arc turns left or right');
    result = addCoursePlanElement(
      document,
      opts.get('--section') ?? '',
      number('--index'),
      kind === 'straight'
        ? { kind, length: number('--length') }
        : { kind, length: number('--length'), radius: number('--radius'), turn: turn as 'left' | 'right' },
    );
  } else if (verb === 'remove-plan') result = removeCoursePlanElement(document, opts.get('--element') ?? '');
  else if (verb === 'add-lane') {
    const kind = opts.get('--kind') ?? 'lane';
    requireInput(kind === 'lane' || kind === 'median', '/kind', 'The kind is lane or median');
    result = addCourseLane(document, opts.get('--section') ?? '', number('--index'), kind, number('--width'));
  } else if (verb === 'remove-lane') result = removeCourseLane(document, opts.get('--element') ?? '');
  else if (verb === 'move-lane') {
    const step = number('--step');
    requireInput(step === -1 || step === 1, '/step', 'The step is -1 or 1');
    result = moveCourseLane(document, opts.get('--element') ?? '', step);
  } else if (verb === 'center-lane')
    result = setCourseCenterLane(document, opts.get('--section') ?? '', opts.get('--lane') ?? '');
  else if (verb === 'taper')
    result = taperCourseWidth(
      document,
      opts.get('--element') ?? '',
      number('--start'),
      number('--end'),
      number('--width'),
    );
  else if (verb === 'remove-width') result = removeCourseWidthKnot(document, opts.get('--element') ?? '');
  else result = { ok: true, ...normalizeCoursePositions(document) };
  requireInput(result.ok, '/edit', result.ok ? '' : result.reason);
  if (opts.has('--out'))
    await atomicWrite(path.resolve(opts.get('--out')!), formatSavedJson(savedCourseDocument(result.document)));
  console.log(JSON.stringify({ ok: true, changes: result.changes }));
}

/**
 * The operations that change how the document is written: the changed values and the shift (the largest move of
 * anything the Section resolves, metres) are printed, and with `--out` the edited document is written.
 */
async function formVerb(file: string) {
  const flags = {
    explode: ['--repeat'],
    combine: ['--elements', '--tolerance'],
    bind: ['--lateral', '--boundary', '--lane', '--side'],
    unbind: ['--lateral'],
  }[verb!]!;
  const opts = options(args, [...flags, '--out']);
  const document = (await jsonFile(file)).value as Json;
  const lateral = opts.get('--lateral') ?? '';
  const [element, field] = [lateral.slice(0, lateral.lastIndexOf('/')), lateral.slice(lateral.lastIndexOf('/') + 1)];
  const result: CourseFormResult =
    verb === 'explode'
      ? explodeCourseRepeat(document, opts.get('--repeat') ?? '')
      : verb === 'combine'
        ? combineCourseElements(
            document,
            (opts.get('--elements') ?? '').split(','),
            opts.has('--tolerance') ? finite(Number(opts.get('--tolerance')), '/tolerance', 0) : 0,
          )
        : verb === 'bind'
          ? bindCourseLateral(
              document,
              element,
              field,
              opts.has('--lane')
                ? { lane: opts.get('--lane')!, side: (opts.get('--side') ?? 'center') as 'left' | 'center' | 'right' }
                : { boundary: opts.get('--boundary') ?? '' },
            )
          : unbindCourseLateral(document, element, field);
  requireInput(result.ok, '/operation', result.ok ? '' : result.reason);
  if (opts.has('--out'))
    await atomicWrite(path.resolve(opts.get('--out')!), formatSavedJson(savedCourseDocument(result.document)));
  console.log(JSON.stringify({ ok: true, shift: result.shift, changes: result.changes }));
}

/**
 * The cleaning operations, in two phases: without `--apply` the candidates are printed (each with its changes and
 * shift); `--apply all` or `--apply id,id` applies the chosen ones as one edit, printing the shift and each changed
 * Section's centreline shift and length change, and `--out` writes the result.
 */
async function cleaningVerb(file: string) {
  const own = { round: ['--step', '--values'], merge: ['--color-tolerance'], same: [] }[verb!] ?? ['--tolerance'];
  const opts = options(args, [...own, '--section', '--elements', '--kinds', '--apply', '--out']);
  const document = (await jsonFile(file)).value as Json;
  const list = (flag: string) => (opts.has(flag) ? opts.get(flag)!.split(',') : undefined);
  const scope: CleaningScope = {
    ...(opts.has('--section') ? { section: opts.get('--section')! } : {}),
    ...(opts.has('--elements') ? { pointers: list('--elements')! } : {}),
    ...(opts.has('--kinds') ? { kinds: list('--kinds')! as CourseElementKind[] } : {}),
  };
  if (verb === 'same') {
    console.log(JSON.stringify({ ok: true, ...sameValueGroups(document) }));
    return;
  }
  const tolerance = (flag: string, otherwise: number) =>
    opts.has(flag) ? finite(Number(opts.get(flag)), `/${flag.slice(2)}`, 0) : otherwise;
  let candidates;
  if (verb === 'join') candidates = joinCandidates(document, { tolerance: tolerance('--tolerance', 0.1), scope });
  else if (verb === 'merge')
    candidates = mergeCandidates(document, { colorTolerance: tolerance('--color-tolerance', 0), scope });
  else if (verb === 'round') {
    const values = (list('--values') ?? [...ROUNDED_VALUES]) as RoundedValue[];
    requireInput(
      values.every((v) => ROUNDED_VALUES.includes(v)),
      '/values',
      `Values are ${ROUNDED_VALUES.join(', ')}`,
    );
    candidates = roundCandidates(document, { step: finite(Number(opts.get('--step')), '/step', 1e-9), values, scope });
  } else candidates = unneededKnotCandidates(document, { tolerance: tolerance('--tolerance', 0), scope });
  if (!opts.has('--apply')) {
    console.log(JSON.stringify({ ok: true, candidates }));
    return;
  }
  const chosen = opts.get('--apply') === 'all' ? candidates : candidates.filter((c) => list('--apply')!.includes(c.id));
  const result = applyCleaning(document, chosen);
  if (opts.has('--out'))
    await atomicWrite(path.resolve(opts.get('--out')!), formatSavedJson(savedCourseDocument(result.document)));
  console.log(
    JSON.stringify({
      ok: true,
      applied: chosen.length,
      shift: result.shift,
      sections: result.sections,
      changes: result.changes,
    }),
  );
}

/** The verbs over the compiled course: compile, render and report. */
async function compiledCourseVerb(file: string) {
  const flags =
    verb === 'compile'
      ? ['--images']
      : verb === 'report'
        ? ['--images', '--section', '--out', '--step']
        : ['--images', '--section', '--s', '--l', '--vehicle', '--out', '--start', '--end', '--step', '--exit'];
  const opts = options(args, flags),
    { course, content } = await loadCourse(file, opts.get('--images'));
  const result: {
    ok: boolean;
    course: string;
    identity: CompiledCourse['identity'];
    sections: { id: string; length: number; sprites: number }[];
    type?: CompiledCourse['type'];
    entrySection?: string;
    forks?: { section: string; lock: number; closure: number; exits: unknown[] }[];
    ground?: Record<string, number>;
    render?: RenderFrame | { frames: RenderFrame[] };
    report?: Awaited<ReturnType<typeof writeCourseReport>>;
  } = {
    ok: true,
    course: course.id,
    identity: course.identity,
    sections: course.sections.map((s) => ({
      id: s.id,
      length: s.coordinates.domain.end,
      sprites: s.appearance.sprites.length,
    })),
  };
  const section = opts.has('--section') ? course.sections.find((s) => s.id === opts.get('--section')) : course.entry;
  requireInput(section, '/section', 'Unknown Section');
  if (verb === 'compile') {
    result.type = course.type;
    result.entrySection = course.entry.id;
    result.forks = course.sections.flatMap(({ id, fork }) =>
      fork
        ? [
            {
              section: id,
              lock: fork.lock.s,
              closure: fork.closure.s,
              exits: fork.exits.map(({ link, ...exit }) => ({ ...exit, link: link.id })),
            },
          ]
        : [],
    );
    // The report sums each Section's color ground metrics; the maximum is the course maximum.
    const metrics = course.sections.map((s) => s.color.metrics);
    const sum = (key: 'expandedStrips' | 'preblendCells' | 'lateralFields' | 'coefficientBytes' | 'directoryBytes') =>
      metrics.reduce((n, m) => n + m[key], 0);
    result.ground = {
      sectionCount: metrics.length,
      expandedStrips: sum('expandedStrips'),
      maxActiveStrips: Math.max(...metrics.map((m) => m.maxActiveStrips)),
      preblendCells: sum('preblendCells'),
      lateralFields: sum('lateralFields'),
      coefficientBytes: sum('coefficientBytes'),
      directoryBytes: sum('directoryBytes'),
    };
  } else if (verb === 'render') {
    const sequence = ['--start', '--end', '--step'].some((f) => opts.has(f));
    let stations;
    if (sequence) {
      requireInput(
        !opts.has('--s') && ['--start', '--end', '--step'].every((f) => opts.has(f)),
        '/sequence',
        'Specify start/end/step together, separately from s',
      );
      const start = finite(Number(opts.get('--start')), '/start', 0, section.coordinates.domain.end),
        end = finite(Number(opts.get('--end')), '/end', start, section.coordinates.domain.end),
        step = finite(Number(opts.get('--step')), '/step', 0.01);
      const count = Math.floor((end - start) / step + 1e-10) + 1;
      requireInput(count <= 240, '/sequence', 'At most 240 frames per command');
      stations = Array.from({ length: count }, (_, i) => start + i * step);
    } else stations = [finite(Number(opts.get('--s') ?? 45), '/s', 0, section.coordinates.domain.end)];
    const l = finite(Number(opts.get('--l') ?? 0), '/l', -1000, 1000);
    requireInput(
      !opts.has('--vehicle') ||
        content.definitions.vehicles.some((e) => e.compiledVehicle.id === opts.get('--vehicle')),
      '/vehicle',
      'Unknown vehicle',
    );
    requireInput(
      !opts.has('--exit') || section.outgoing.some((link) => link.id === opts.get('--exit')),
      '/exit',
      'Exit must name a canonical outgoing Link',
    );
    const renderer = createCourseFrameRenderer(content, course, section, {
      ...(opts.has('--vehicle') ? { vehicle: opts.get('--vehicle')! } : {}),
      ...(opts.has('--exit') ? { exit: opts.get('--exit')!, through: Math.max(...stations) } : {}),
    });
    const destination = path.resolve(opts.get('--out') ?? (sequence ? 'frames' : 'frame.png'));
    const frames: RenderFrame[] = [];
    for (const [i, s] of stations.entries()) {
      const frame = renderer.render(s, l);
      const rgba = new Uint32Array(frame.pixels.length),
        png = new PNG({ width: frame.width, height: frame.height });
      expandRgb555Pixels(frame.pixels, rgba);
      png.data = Buffer.from(rgba.buffer);
      const output = sequence ? path.join(destination, `${String(i).padStart(4, '0')}.png`) : destination;
      await atomicWrite(output, PNG.sync.write(png));
      frames.push({
        output,
        section: frame.section,
        s: frame.s,
        l: frame.l,
        vehicle: frame.vehicle,
        stats: frame.stats,
      });
    }
    result.render = sequence ? { frames } : frames[0];
  } else if (verb === 'report') {
    result.report = await writeCourseReport(
      course,
      section,
      path.resolve(opts.get('--out') ?? 'course-report'),
      Number(opts.get('--step') ?? 10),
    );
  }
  console.log(JSON.stringify(result));
}
