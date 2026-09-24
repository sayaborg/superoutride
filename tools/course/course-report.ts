import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';

type CompiledSection = CompiledCourse['sections'][number];

export interface CourseReport {
  course: string;
  section: string;
  lengthMeters: number;
  identity: CompiledCourse['identity'];
  reference: CompiledCourse['reference'];
  boundaries: string[];
  samples: {
    s: number;
    curvaturePerMeter: number;
    heightMeters: number;
    x: number;
    z: number;
    boundaries: (number | null)[];
  }[];
  scenery: { s: number; l: number; asset: string; state: string | null }[];
  environments: { s: number; name: string }[];
  segments: { index: number; kind: string; start: number; end: number }[];
}

import path from 'node:path';
import { plotCourseReport } from './plot-report.js';

import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import { atomicWrite, finite, requireInput } from './authoring-io.js';

export async function courseReport(course: CompiledCourse, section: CompiledSection, directory: string, step = 10) {
  finite(step, '/step', 0.01, 100000);
  const length = section.coordinates.domain.end;
  requireInput(Math.ceil(length / step) <= 4096, '/step', 'Report is limited to 4096 regular stations');
  const stations = [
    ...new Set([
      0,
      length,
      ...Array.from({ length: Math.ceil(length / step) }, (_, i) => i * step),
      ...section.height.knots.map((n) => n.s),
      ...section.segments.flatMap((p) => [p.sStart, p.sEnd]),
      ...section.height.knots.flatMap((n) => [n.s - n.curveLength / 2, n.s + n.curveLength / 2]),
      ...section.boundaries.flatMap((b) => b.vertices.map((k) => k.at.s)),
    ]),
  ].sort((a, b) => a - b);
  const metric = { curvature: 0, offsetMetric: 1 };
  const samples = stations.map((s) => {
    const world = section.coordinates.toWorld(s, 0, createPlanCoordinateSample());
    return {
      s,
      curvaturePerMeter: section.coordinates.metricsAt(s, 0, metric).curvature,
      heightMeters: section.height.sample(s),
      x: world.x,
      z: world.z,
      boundaries: section.boundaries.map((b) =>
        s < b.vertices[0]!.at.s || s > b.vertices.at(-1)!.at.s ? null : courseBoundaryAt(b, s),
      ),
    };
  });
  const report: CourseReport = {
    course: course.id,
    section: section.id,
    lengthMeters: length,
    identity: course.identity,
    reference: course.reference,
    boundaries: section.boundaries.map((b) => b.id),
    samples,
    scenery: section.presentation!.scenery.map((p) => ({
      s: p.at.s,
      l: p.l,
      asset: p.instance.asset.source.name,
      state: p.unselected?.id ?? null,
    })),
    environments: section.presentation!.environments.map((e) => ({ s: e.at.s, name: e.name })),
    segments: section.segments.map((p) => ({ index: p.index, kind: p.geometry.kind, start: p.sStart, end: p.sEnd })),
  };
  const json = path.join(directory, 'report.json');
  await atomicWrite(json, JSON.stringify(report, null, 2) + '\n');
  const text =
    [
      `COURSE ${course.id} / ${section.id}`,
      `Length: ${report.lengthMeters.toFixed(3)} m`,
      `Source: ${course.identity.sourceSha256}`,
      `Scenery: ${report.scenery.length} placements; environments: ${report.environments.length}`,
      '',
      ['s_m', 'curvature_1_per_m', 'height_m', ...report.boundaries.map((b) => `${b}_m`)].join('\t'),
      ...samples.map((p) =>
        [p.s, p.curvaturePerMeter, p.heightMeters, ...p.boundaries]
          .map((n) => (n === null ? 'NA' : n.toPrecision(9)))
          .join('\t'),
      ),
      '',
      'SCENERY: s_m l_m asset state',
      ...report.scenery.map((p) => `${p.s.toFixed(3)} ${p.l.toFixed(3)} ${p.asset} ${p.state ?? 'always'}`),
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
