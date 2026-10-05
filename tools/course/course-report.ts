import path from 'node:path';
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import { courseReport, type CourseReport } from '../authoring/course-views.js';
import { plotCourseReport } from './plot-report.js';
import { atomicWrite, finite, requireInput } from './authoring-io.js';

type CompiledSection = CompiledCourse['sections'][number];

/** The course command's report: the core's numeric report of a Section written as JSON, text and SVG plots. */
export async function writeCourseReport(
  course: CompiledCourse,
  section: CompiledSection,
  directory: string,
  step = 10,
) {
  finite(step, '/step', 0.01, 100000);
  requireInput(
    Math.ceil(section.coordinates.domain.end / step) <= 4096,
    '/step',
    'Report is limited to 4096 regular stations',
  );
  const report: CourseReport = courseReport(course, section, step);
  const samples = report.samples;
  const json = path.join(directory, 'report.json');
  await atomicWrite(json, JSON.stringify(report, null, 2) + '\n');
  const text =
    [
      `COURSE ${course.id} / ${section.id}`,
      `Length: ${report.lengthMeters.toFixed(3)} m`,
      `Source: ${course.identity.sourceSha256}`,
      `Sprites: ${report.sprites.length} placements; environments: ${report.environments.length}`,
      '',
      ['s_m', 'curvature_1_per_m', 'height_m', ...report.boundaries.map((b) => `${b}_m`)].join('\t'),
      ...samples.map((p) =>
        [p.s, p.curvaturePerMeter, p.heightMeters, ...p.boundaries]
          .map((n) => (n === null ? 'NA' : n.toPrecision(9)))
          .join('\t'),
      ),
      '',
      'SPRITES: s_m l_m asset state',
      ...report.sprites.map((p) => `${p.s.toFixed(3)} ${p.l.toFixed(3)} ${p.asset} ${p.state ?? 'always'}`),
      '',
      'ENVIRONMENTS',
      ...report.environments.map((e) => `${e.s.toFixed(3)} ${e.name}`),
    ].join('\n') + '\n';
  await atomicWrite(path.join(directory, 'report.txt'), text);
  const plots = plotCourseReport(report);
  await atomicWrite(path.join(directory, 'station-plots.svg'), plots.stationPlots);
  await atomicWrite(path.join(directory, 'plan.svg'), plots.plan);
  return {
    directory,
    files: ['report.json', 'report.txt', 'station-plots.svg', 'plan.svg'].map((f) => path.join(directory, f)),
  };
}
