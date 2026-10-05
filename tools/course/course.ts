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

const [verb, file, ...args] = process.argv.slice(2);
try {
  requireInput(
    ['compile', 'render', 'report', 'structure'].includes(verb!) && file,
    '/arguments',
    'Usage: npm run course -- compile|render|report|structure course.json [options]',
  );
  if (verb === 'structure') {
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
      sprites: s.appearance?.sprites.length ?? 0,
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
    requireInput(section.appearance, '/section', 'Report needs explicit saved appearance');
    result.report = await writeCourseReport(
      course,
      section,
      path.resolve(opts.get('--out') ?? 'course-report'),
      Number(opts.get('--step') ?? 10),
    );
  }
  console.log(JSON.stringify(result));
}
