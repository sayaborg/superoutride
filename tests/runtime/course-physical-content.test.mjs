import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readCourseDocument, saveCourseDocument, parseCourseDocument } from '../../dist/course/course-document.js';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { compileCoursePhysicalOverlaps } from '../../dist/compiler/course-physical-overlap.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';
import { createBandSurfaceReader } from '../../dist/physics/band-surface-reader.js';
import { SURFACE_MATERIALS } from '../../dist/physics/surface-map.js';
import { HeightProfile } from '../../dist/core/height-profile.js';
import { forkCourseDocument } from '../helpers/course-link-documents.mjs';

const text = await readFile(new URL('../fixtures/linked-linear.course.json', import.meta.url), 'utf8');
const fixture = () => JSON.parse(text);
const anchor = (s) => ({ kind: 'absolute', s });
const height = (points) => points.map(([s, y]) => ({ anchor: anchor(s), y }));
const ok = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.value;
};
const failure = (result, path, code = 'semantic_compile_failure') => {
  assert.equal(result.ok, false);
  assert.equal('value' in result, false);
  assert.equal(result.diagnostics[0].code, code);
  if (path) assert.equal(result.diagnostics[0].path, path);
  return result.diagnostics[0];
};
const qualify = async (input) => compileCoursePhysicalOverlaps(ok(await compileCourseDocument(input)).links);
function qualificationFailure(result, code = 'physical_support_mismatch', index = 0) {
  const diagnostic = failure(result, undefined, code);
  assert.equal(diagnostic.kind, 'qualification');
  assert.equal(diagnostic.linkIndex, index);
  assert.equal(Object.hasOwn(diagnostic, 'path'), false);
  return diagnostic;
}

test('v3 requires explicit height and physical bindings; older schemas are never silently filled', () => {
  for (const version of [1, 2]) {
    const input = fixture();
    input.version = version;
    failure(readCourseDocument(input), '/version', 'unsupported_version');
  }
  for (const field of ['height', 'physicalBindings']) {
    const input = fixture();
    delete input.sections[0][field];
    failure(readCourseDocument(input), `/sections/0/${field}`, 'invalid_shape');
  }
  const input = fixture();
  input.sections[0].height[0].y = Infinity;
  failure(readCourseDocument(input), '/sections/0/height/0/y', 'invalid_numeric_domain');
});

test('height reuses the Core render/physics/camera authority and owns immutable input', async () => {
  const input = fixture();
  input.sections[0].height = height([
    [0, 2],
    [100, 12],
    [300, 4],
  ]);
  const expected = new HeightProfile(300, [
    { s: 0, y: 2 },
    { s: 100, y: 12 },
    { s: 300, y: 4 },
  ]);
  const pending = compileCourseDocument(input);
  input.sections[0].height[1].y = 99;
  const section = ok(await pending).sections[0];
  for (const s of [0, 25, 50, 100, 121.23, 250, 300]) {
    assert.deepEqual(section.height.sampleRender(s), expected.sampleRender(s));
    assert.deepEqual(section.height.samplePhysicsDifferential(s), expected.samplePhysicsDifferential(s));
    assert.equal(section.height.sampleCamera(s), expected.samplePhysics(s));
  }
  assert.notEqual(section.height.sampleRender(25).y, section.height.samplePhysics(25));
  assert.throws(() => {
    section.height.nodes[0].y = 7;
  }, TypeError);
  assert.throws(() => {
    section.height.courseLength = 1;
  }, TypeError);
});

test('malformed height profiles fail as authored diagnostics before Core construction', async () => {
  for (const points of [
    [],
    [[0, 0]],
    [
      [1, 0],
      [300, 0],
    ],
    [
      [0, 0],
      [299, 0],
    ],
    [
      [0, 0],
      [100, 2],
      [100, 3],
      [300, 0],
    ],
    [
      [0, 0],
      [200, 2],
      [100, 3],
      [300, 0],
    ],
    [
      [0, 0],
      [Number.MIN_VALUE, 1],
      [300, 0],
    ],
    [
      [0, 0],
      [Number.MIN_VALUE, 0],
      [300, 0],
    ],
  ]) {
    const input = fixture();
    input.sections[0].height = height(points);
    const diagnostic = failure(await compileCourseDocument(input));
    assert.ok(diagnostic.path.startsWith('/sections/0/height'));
  }
});

test('binding admission rejects missing, repeated, unresolved and uncovered authored data', async () => {
  const cases = [
    [
      (s) => {
        s.physicalBindings = [];
      },
      '/physicalBindings',
    ],
    [
      (s) => {
        s.physicalBindings.push(structuredClone(s.physicalBindings[0]));
      },
      '/physicalBindings/1/bandId',
    ],
    [
      (s) => {
        s.physicalBindings[0].bandId = 'missing';
      },
      '/physicalBindings/0/bandId',
      'unresolved_reference',
    ],
    [
      (s) => {
        s.physicalBindings[0].sections = [];
      },
      '/physicalBindings/0/sections',
    ],
    [
      (s) => {
        s.physicalBindings[0].sections[0].material = '__proto__';
      },
      '/physicalBindings/0/sections/0/material',
      'unresolved_reference',
    ],
    [
      (s) => {
        s.physicalBindings[0].sections[0].anchor.s = 1;
      },
      '/physicalBindings/0/sections/0/anchor',
    ],
    [
      (s) => {
        s.physicalBindings[0].sections.push({ anchor: anchor(300), material: 'GRASS' });
      },
      '/physicalBindings/0/sections/1/anchor',
    ],
    [
      (s) => {
        s.physicalBindings[0].sections.push({ anchor: anchor(0), material: 'GRASS' });
      },
      '/physicalBindings/0/sections/1/anchor',
    ],
  ];
  for (const [edit, path, code] of cases) {
    const input = fixture();
    edit(input.sections[0]);
    failure(await compileCourseDocument(input), `/sections/0${path}`, code);
  }
});

test('physical profiles preserve canonical Bands/materials, independent of role, IDs and declaration order', async () => {
  const input = fixture(),
    source = input.sections[0];
  source.bands[0].id = 'constructor';
  source.carriageways[0].bandIds = ['constructor'];
  source.physicalBindings[0] = {
    bandId: 'constructor',
    sections: [
      { anchor: anchor(0), material: 'GRASS' },
      { anchor: anchor(101.23), material: 'VOID' },
      { anchor: { kind: 'primitive', primitiveId: 'line', fraction: 0.5 }, material: 'DIRT' },
    ],
  };
  const saved = ok(saveCourseDocument(input)),
    first = ok(await compileCourseDocument(input));
  assert.deepEqual(ok(parseCourseDocument(saved)), input);
  assert.deepEqual(ok(await compileCourseDocument(ok(parseCourseDocument(saved)))), first);
  const section = first.sections[0],
    binding = section.physicalBindings[0];
  assert.equal(binding.band, section.bandPartition.bands[0]);
  assert.equal(binding.sections[2].anchor.primitive, section.primitives[0]);
  assert.equal(binding.sections[0].material, SURFACE_MATERIALS.GRASS);
  const reader = createBandSurfaceReader(section.bandPartition, section.physicalBindings);
  for (const [s, type] of [
    [0, 'GRASS'],
    [101.23 - 1e-10, 'GRASS'],
    [101.23, 'VOID'],
    [149.99, 'VOID'],
    [150, 'DIRT'],
    [300, 'DIRT'],
  ])
    assert.equal(reader.sample(s, 0).material, SURFACE_MATERIALS[type]);
  assert.equal(reader.sample(0, -4).type, 'GRASS');
  assert.equal(reader.sample(0, -4 - 1e-10).type, 'VOID');
  assert.equal(reader.sample(0, 6).type, 'VOID');
  assert.throws(() => {
    binding.sections[0].material.gripFactor = 8;
  }, TypeError);
  assert.throws(() => binding.sections.pop(), TypeError);
  assert.throws(() => {
    binding.band = null;
  }, TypeError);
  for (const query of [() => reader.sample('0', 0), () => reader.sample(0, '0')]) assert.throws(query, TypeError);
  for (const [s, l] of [
    [-1e-12, 0],
    [301, 0],
    [NaN, 0],
    [0, Infinity],
  ])
    assert.throws(() => reader.sample(s, l), RangeError);
  assert.throws(() => createBandSurfaceReader(section.bandPartition, []), RangeError);
});

test('support bound considers active material intervals and interior boundary knots only', async () => {
  const input = fixture(),
    s = input.sections[0];
  input.links = [];
  s.ports = [];
  input.sections.pop();
  s.boundaries[1].knots = [
    [0, 6],
    [100, 18],
    [150, 7],
    [200, 80],
    [300, 6],
  ].map(([s, l]) => ({ anchor: anchor(s), l }));
  s.physicalBindings[0].sections = [
    { anchor: anchor(0), material: 'VOID' },
    { anchor: anchor(50), material: 'SAND' },
    { anchor: anchor(150), material: 'VOID' },
  ];
  const section = ok(await compileCourseDocument(input)).entry;
  const reader = createBandSurfaceReader(section.bandPartition, section.physicalBindings);
  assert.equal(reader.maxSupportedAbsL, 18);
  assert.equal(reader.sample(100, 17).type, 'SAND');
  assert.equal(reader.sample(200, 70).type, 'VOID');
});

test('activation ownership and zero-area taper points carry through the physical reader', async () => {
  const input = JSON.parse(
    await readFile(new URL('../fixtures/partition-linear.course.json', import.meta.url), 'utf8'),
  );
  for (const binding of input.sections[0].physicalBindings)
    binding.sections[0].material = binding.bandId.startsWith('median') ? 'GRASS' : 'ASPHALT';
  const section = ok(await compileCourseDocument(input)).entry;
  const reader = createBandSurfaceReader(section.bandPartition, section.physicalBindings);
  assert.equal(reader.sample(37 - 1e-10, -3).type, 'ASPHALT');
  assert.equal(reader.sample(37, -3).type, 'ASPHALT');
  assert.equal(reader.sample(100, -3).type, 'GRASS');
  assert.equal(reader.sample(163, -3).type, 'ASPHALT');
  assert.equal(reader.sample(200, 9).type, 'VOID');
});

test('physical overlap is a separate immutable qualification with canonical Links, not runtime readiness', async () => {
  for (const name of ['linked-linear', 'transformed-loop']) {
    const input = JSON.parse(await readFile(new URL(`../fixtures/${name}.course.json`, import.meta.url), 'utf8'));
    const course = ok(await compileCourseDocument(input));
    const proof = ok(compileCoursePhysicalOverlaps(course.links));
    assert.equal(proof.scope, 'physical-overlap');
    assert.equal(proof.links[0], course.links[0]);
    assert.throws(() => proof.links.pop(), TypeError);
    assert.deepEqual(Object.keys(proof), ['scope', 'links']);
  }
});

test('equal seam heights do not hide an interior hill, slope or vertical offset', async () => {
  for (const points of [
    [
      [0, 0],
      [60, 0],
      [73, 1],
      [74, 0],
      [300, 0],
    ],
    [
      [0, 0],
      [60, 0],
      [300, 1],
    ],
    [
      [0, 1],
      [300, 1],
    ],
  ]) {
    const input = fixture();
    input.sections[1].height = height(points);
    const result = await qualify(input);
    qualificationFailure(
      result,
      points.every((point) => point[1] === points[0][1]) ? 'physical_height_mismatch' : 'nonhorizontal_overlap',
    );
  }
  const input = fixture();
  for (const section of input.sections)
    section.height = height([
      [0, 9],
      [300, 9],
    ]);
  ok(await qualify(input));
});

test('all material changes including the closed guard endpoint participate in overlap proof', async () => {
  for (const station of [73, 90]) {
    const input = fixture();
    input.sections[1].physicalBindings[0].sections.push({ anchor: anchor(station), material: 'GRASS' });
    qualificationFailure(await qualify(input));
    input.sections[0].physicalBindings[0].sections.push({ anchor: anchor(station + 140), material: 'GRASS' });
    ok(await qualify(input));
  }
});

test('the full support field includes nonselected shoulder geometry and its interior knots', async () => {
  const input = fixture();
  for (const [index, s] of input.sections.entries()) {
    const right = index === 0 ? 6 : 0;
    s.boundaries.push({
      id: 'shoulder-edge',
      knots: [
        { anchor: anchor(0), l: right + 2 },
        { anchor: anchor(300), l: right + 2 },
      ],
    });
    s.bands.push({
      id: 'shoulder',
      start: anchor(0),
      end: anchor(300),
      leftBoundaryId: s.boundaries[1].id,
      rightBoundaryId: 'shoulder-edge',
      role: 'shoulder',
    });
    s.physicalBindings.push({ bandId: 'shoulder', sections: [{ anchor: anchor(0), material: 'SHOULDER' }] });
  }
  ok(await qualify(input));
  input.sections[1].boundaries.at(-1).knots.splice(
    1,
    0,
    ...[
      [73, 3],
      [74, 2],
    ].map(([s, l]) => ({ anchor: anchor(s), l })),
  );
  qualificationFailure(await qualify(input));
});

test('same-material subdivisions coalesce while material seams and exact activation points remain observable', async () => {
  const input = fixture(),
    d = input.sections[1];
  d.boundaries.push({
    id: 'middle',
    knots: [
      { anchor: anchor(0), l: -5 },
      { anchor: anchor(300), l: -5 },
    ],
  });
  d.bands.push({ ...structuredClone(d.bands[0]), id: 'right', leftBoundaryId: 'middle' });
  d.bands[0].rightBoundaryId = 'middle';
  d.carriageways[0].bandIds.push('right');
  d.physicalBindings.push({ bandId: 'right', sections: [{ anchor: anchor(0), material: 'ASPHALT' }] });
  ok(await qualify(input));
  d.physicalBindings[1].sections[0].material = 'DIRT';
  qualificationFailure(await qualify(input));
});

test('fractional longitudinal activation keeps exact original ruler stations in physical qualification', async () => {
  const input = fixture(),
    d = input.sections[1];
  input.links[0].overlap.behind = 59.5;
  d.bands.push({ ...structuredClone(d.bands[0]), id: 'after', start: anchor(1.23) });
  d.bands[0].end = anchor(1.23);
  d.carriageways[0].bandIds.push('after');
  d.physicalBindings.push({ bandId: 'after', sections: [{ anchor: anchor(1.23), material: 'ASPHALT' }] });
  ok(await qualify(input));
  d.physicalBindings[1].sections[0].material = 'DIRT';
  qualificationFailure(await qualify(input));
});

test('geometry-only fork fixtures fail complete physical qualification; every merge incoming is checked', async () => {
  const input = forkCourseDocument(fixture());
  const course = ok(await compileCourseDocument(input));
  qualificationFailure(compileCoursePhysicalOverlaps(course.links));
  const incoming = course.sections.at(-1).incoming;
  assert.equal(ok(compileCoursePhysicalOverlaps(incoming)).links.length, 3);
  input.sections[3].physicalBindings[0].sections[0].material = 'GRASS';
  const changed = ok(await compileCourseDocument(input));
  qualificationFailure(compileCoursePhysicalOverlaps(changed.sections.at(-1).incoming), 'physical_support_mismatch', 2);
});

test('material stations lost in seam-relative coordinates fail instead of silently erasing a profile interval', async () => {
  const input = fixture();
  input.links[0].overlap.behind = 200;
  input.sections[1].ports[0].anchor = anchor(250);
  input.sections[0].physicalBindings[0].sections.push({ anchor: anchor(1e-15), material: 'ASPHALT' });
  const diagnostic = qualificationFailure(await qualify(input), 'semantic_compile_failure');
  assert.match(diagnostic.message, /distinguishable/);
});

test('physical edits invalidate identity; failed import preserves the prior immutable project', async () => {
  const project = createCourseProject(),
    original = ok(await project.importDocument(text));
  const before = project.getState(),
    input = fixture();
  input.sections[0].physicalBindings = [];
  failure(await project.importDocument(ok(saveCourseDocument(input))), '/sections/0/physicalBindings');
  assert.equal(project.getState(), before);
  for (const edit of [
    (s) => {
      s.height[0].y = 1;
    },
    (s) => {
      s.physicalBindings[0].sections[0].material = 'GRASS';
    },
  ]) {
    const changed = fixture();
    edit(changed.sections[0]);
    ok(project.editDocument(changed));
    failure(project.exportCompiled(), undefined, 'stale_source');
    assert.notEqual(ok(await project.compile()).identity.buildSha256, original.identity.buildSha256);
  }
  assert.equal(original.sections[0].height.nodes[0].y, 0);
  assert.equal(original.sections[0].physicalBindings[0].sections[0].material, SURFACE_MATERIALS.ASPHALT);
});

test('offline entry exposes scoped physical qualification and ordinary surface-reader evidence', () => {
  const file = 'tests/fixtures/linked-linear.course.json';
  const report = spawnSync(process.execPath, ['tools/course/compile-course.mjs', file], { encoding: 'utf8' });
  assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).sections[0].maxSupportedAbsL, 6);
  const proof = spawnSync(process.execPath, ['tools/course/compile-course.mjs', file, '--physical-overlap'], {
    encoding: 'utf8',
  });
  assert.equal(proof.status, 0, proof.stderr);
  assert.equal(JSON.parse(proof.stdout).scope, 'physical-overlap');
  assert.equal(JSON.parse(proof.stdout).links.length, 1);
});
