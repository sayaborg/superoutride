import path from 'node:path';
import { createHash } from 'node:crypto';
import { readCourseDocument } from '../../dist/course/course-document.js';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { readObservations } from './observations.mjs';
import {
  options,
  jsonFile,
  loadCourse,
  requireInput,
  finite,
  atomicWrite,
  AuthoringError,
  reportError,
} from './authoring-io.mjs';

function compact(points) {
  const result = [];
  for (const p of points) {
    while (result.length >= 2) {
      const a = result.at(-2),
        b = result.at(-1);
      const expected = a.value + ((p.value - a.value) * (b.s - a.s)) / (p.s - a.s);
      if (Math.abs(expected - b.value) > 1e-9) break;
      result.pop();
    }
    result.push(p);
  }
  return result;
}
const [observationsPath, recipePath, ...args] = process.argv.slice(2);
try {
  requireInput(
    observationsPath && recipePath,
    '/arguments',
    'Usage: fit.mjs observations.json recipe.json --out course.json [--distance-scale n --curvature-scale n --height-scale n]',
  );
  const opts = options(args, ['--out', '--distance-scale', '--curvature-scale', '--height-scale']);
  requireInput(opts.has('--out'), '/out', 'An output CourseDocument path is required');
  const observed = await jsonFile(observationsPath),
    obs = readObservations(observed.value),
    recipe = (await jsonFile(recipePath)).value;
  requireInput(
    recipe.format === 'superoutride.course-fit' && recipe.version === 1,
    '/recipe',
    'Expected course-fit v1',
    'fit',
  );
  const templatePath = path.resolve(path.dirname(recipePath), recipe.template),
    loaded = await loadCourse(templatePath);
  const output = path.resolve(opts.get('--out')),
    document = structuredClone(loaded.document),
    section = document.sections[0],
    source = loaded.course.entry;
  requireInput(
    document.type === 'LINEAR' &&
      document.sections.length === 1 &&
      document.links.length === 0 &&
      section.fork === null,
    '/template',
    'The initial fitter owns one LINEAR Section',
    'fit',
  );
  requireInput(
    section.presentation &&
      section.presentation.ground.kind === 'resident' &&
      section.presentation.ground.stamps.length === 0 &&
      section.presentation.scenery.length === 0,
    '/template/presentation',
    'Fitting uses explicit row scenery and unstamped ground',
    'fit',
  );
  requireInput(
    source.regionPartition.regions.every((b) => b.start.s === 0 && b.end.s === source.raster.length) &&
      section.physicalBindings.every((b) => b.sections.length === 1) &&
      section.presentation.ground.regions.every((b) => b.sections.length === 1),
    '/template/regions',
    'Template Regions and constant bindings must span the source',
    'fit',
  );
  const scales = {
    distanceScale: finite(Number(opts.get('--distance-scale') ?? 1), '/distanceScale', Number.EPSILON, 100),
    curvatureScale: finite(Number(opts.get('--curvature-scale') ?? 1), '/curvatureScale', 0, 100),
    heightScale: finite(Number(opts.get('--height-scale') ?? 1), '/heightScale', 0, 100),
  };
  const tolerance = finite(recipe.curvatureTolerance, '/recipe/curvatureTolerance', 0, 1),
    groups = [];
  for (let i = 0; i + 1 < obs.samples.length; i++) {
    const a = obs.samples[i],
      b = obs.samples[i + 1];
    requireInput(b.s > a.s, `/samples/${i + 1}/s`, 'Select distinct-distance observations before fitting', 'fit');
    const k = a.curvaturePerMeter,
      last = groups.at(-1),
      ds = b.s - a.s;
    if (last && Math.abs(k - last.integral / (last.end - last.start)) <= tolerance) {
      last.end = b.s;
      last.integral += k * ds;
    } else groups.push({ start: a.s, end: b.s, integral: k * ds });
  }
  section.primitives = groups.map((g, i) => {
    g.id = `fit-${String(i + 1).padStart(3, '0')}`;
    const k = (g.integral / (g.end - g.start)) * scales.curvatureScale,
      length = (g.end - g.start) * scales.distanceScale;
    if (Math.abs(k) < 1e-9) return { id: g.id, kind: 'straight', length };
    const turn = (length * k * 180) / Math.PI;
    requireInput(
      Math.abs(turn) <= 360,
      `/primitives/${i}`,
      'Split a curvature interval whose sweep exceeds 360 degrees',
      'fit',
    );
    return { id: g.id, kind: 'arc', radius: 1 / Math.abs(k), turn };
  });
  const anchor = (s) => {
    finite(s, '/station', 0, obs.samples.at(-1).s);
    const g = groups.find((g) => s < g.end) ?? groups.at(-1);
    return { kind: 'primitive', primitiveId: g.id, fraction: (s - g.start) / (g.end - g.start) };
  };
  const first = anchor(0),
    last = anchor(obs.samples.at(-1).s);
  requireInput(
    Array.isArray(recipe.boundaries) && recipe.boundaries.length === section.boundaries.length,
    '/recipe/boundaries',
    'Map every template Boundary explicitly',
    'fit',
  );
  const mappings = new Map(recipe.boundaries.map((m) => [m.id, m]));
  requireInput(
    mappings.size === section.boundaries.length,
    '/recipe/boundaries',
    'Boundary mappings must be unique',
    'fit',
  );
  for (const boundary of section.boundaries) {
    const m = mappings.get(boundary.id);
    requireInput(m, `/recipe/boundaries/${boundary.id}`, 'Missing Boundary mapping', 'fit');
    finite(m.widthFactor, '/widthFactor', -10, 10);
    finite(m.offsetMeters, '/offsetMeters', -1000, 1000);
    boundary.knots = compact(
      obs.samples.map((p) => ({ s: p.s, value: p.roadWidthMeters * m.widthFactor + m.offsetMeters })),
    ).map((p) => ({ anchor: anchor(p.s), l: p.value }));
  }
  let y = obs.samples[0].heightMeters ?? 0;
  const heights = obs.samples.map((p, i) => {
    if (p.heightMeters !== null) y = p.heightMeters;
    else if (i) y += obs.samples[i - 1].grade * (p.s - obs.samples[i - 1].s);
    return { s: p.s, value: y * scales.heightScale };
  });
  section.height = compact(heights).map((p) => ({ anchor: anchor(p.s), y: p.value }));
  for (const b of section.regions) {
    b.start = first;
    b.end = last;
  }
  for (const binding of [...section.physicalBindings, ...section.presentation.ground.regions])
    binding.sections[0].anchor = first;
  requireInput(
    Array.isArray(recipe.ports) && recipe.ports.length === section.ports.length,
    '/recipe/ports',
    'Map every Port station',
    'fit',
  );
  for (const port of section.ports) {
    const p = recipe.ports.find((p) => p.id === port.id);
    requireInput(p, '/recipe/ports', 'Missing Port mapping', 'fit');
    port.anchor = anchor(p.s);
  }
  section.presentation.sceneryRows = obs.sceneryRows.map((row, i) => {
    const m = recipe.sceneryKinds?.find((m) => m.kind === row.kind);
    requireInput(m, `/sceneryRows/${i}/kind`, 'Map the observed scenery kind to a separately saved asset', 'fit');
    return {
      id: `fit-row-${i + 1}`,
      assetId: m.assetId,
      start: anchor(row.startS),
      end: anchor(row.endS),
      spacing: row.spacingMeters * scales.distanceScale,
      boundaryId: row.side === 'left' ? m.leftBoundaryId : m.rightBoundaryId,
      side: row.side,
      offset: row.offsetMeters,
      groundOffset: row.groundOffsetMeters,
    };
  });
  const profiles = section.presentation.environments;
  section.presentation.environments = obs.environments.map((e, i) => {
    const m = recipe.environments?.find((m) => m.label === e.label),
      profile = profiles.find((p) => p.name === m?.templateName);
    requireInput(profile, `/environments/${i}/label`, 'Map the observed environment to a saved profile', 'fit');
    return { ...profile, anchor: anchor(e.s) };
  });
  document.reference = {
    source: obs.source,
    observations: {
      location: path.relative(path.dirname(output), path.resolve(observationsPath)).split(path.sep).join('/'),
      sha256: createHash('sha256').update(observed.bytes).digest('hex'),
    },
    calibration: scales,
    remasterDeviations: [
      ...obs.remasterDeviations,
      'Curvature intervals become constant-curvature primitives; the saved Raster recipe discretizes arcs.',
    ],
  };
  const admitted = readCourseDocument(document);
  if (!admitted.ok) throw new AuthoringError(admitted.diagnostics);
  const compiled = await compileCourseDocument(admitted.value, loaded.images);
  if (!compiled.ok) throw new AuthoringError(compiled.diagnostics);
  await atomicWrite(output, JSON.stringify(admitted.value, null, 2) + '\n');
  console.log(
    JSON.stringify({
      ok: true,
      output,
      identity: compiled.value.identity,
      calibration: scales,
      primitives: section.primitives.length,
      checkpoints: obs.checkpoints.map((p) => ({ name: p.name, anchor: anchor(p.s) })),
      lengthMeters: compiled.value.entry.raster.length,
    }),
  );
} catch (error) {
  reportError(error);
}
