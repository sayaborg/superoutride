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
  primitives: { id: string; kind: string; start: number; end: number }[];
}
import { createPlanarCoordinateSample } from '../../src/core/planar-sample.js';
import path from 'node:path';
import { plotCourseReport } from './plot-report.js';
import { guidePathToWorld, sampleGuidePath } from '../../src/course/geometry/guide-curve.js';
import { guideCoordinateMetricsAt } from '../../src/course/geometry/guide-coordinate-frame.js';
import { courseBoundaryAt } from '../../src/course/course-regions.js';
import { atomicWrite, finite, requireInput } from './authoring-io.js';

export async function courseReport(course: CompiledCourse, section: CompiledSection, directory: string, step = 10) {
  finite(step, '/step', 0.01, 100000);
  requireInput(Math.ceil(section.raster.length / step) <= 4096, '/step', 'Report is limited to 4096 regular stations');
  const stations = [
    ...new Set([
      0,
      section.raster.length,
      ...Array.from({ length: Math.ceil(section.raster.length / step) }, (_, i) => i * step),
      ...section.height.nodes.map((n) => n.s),
      ...section.boundaries.flatMap((b) => b.knots.map((k) => k.anchor.s)),
    ]),
  ].sort((a, b) => a - b);
  const samples = stations.map((s) => {
    const guide = sampleGuidePath(section.guide, s, createPlanarCoordinateSample()),
      world = guidePathToWorld(section.guide, s, 0, createPlanarCoordinateSample());
    return {
      s,
      curvaturePerMeter: guideCoordinateMetricsAt(section.guide, s, 0, guide.segmentIndex, {
        curvature: 0,
        metric: 1,
        offsetMetric: 1,
      }).curvature,
      heightMeters: section.height.samplePhysics(s),
      x: world.x,
      z: world.z,
      boundaries: section.boundaries.map((b) =>
        s < b.knots[0]!.anchor.s || s > b.knots.at(-1)!.anchor.s ? null : courseBoundaryAt(b, s),
      ),
    };
  });
  const report: CourseReport = {
    course: course.id,
    section: section.id,
    lengthMeters: section.raster.length,
    identity: course.identity,
    reference: course.reference,
    boundaries: section.boundaries.map((b) => b.id),
    samples,
    scenery: section.presentation!.scenery.map((p) => ({
      s: p.anchor.s,
      l: p.l,
      asset: p.instance.asset.source.name,
      state: p.unselected?.id ?? null,
    })),
    environments: section.presentation!.environments.map((e) => ({ s: e.anchor.s, name: e.name })),
    primitives: section.primitives.map((p) => ({ id: p.source.id, kind: p.source.kind, start: p.sStart, end: p.sEnd })),
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
  await atomicWrite(path.join(directory, 'regions.svg'), plots.regions);
  await atomicWrite(path.join(directory, 'plan.svg'), plots.plan);
  return {
    directory,
    files: ['report.json', 'report.txt', 'regions.svg', 'plan.svg'].map((f) => path.join(directory, f)),
  };
}
