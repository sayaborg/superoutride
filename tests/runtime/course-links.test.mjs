import { forkCourseDocument } from '../helpers/course-link-documents.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  parseCourseDocument,
  saveCourseDocument,
  readCourseDocument,
  COURSE_DOCUMENT_LIMITS,
} from '../../dist/course/course-document.js';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';
import { rasterPathToWorld } from '../../dist/core/raster-path.js';
import { guidePathToWorld } from '../../dist/core/guide-curve.js';
import {
  invertPlanarTransform,
  transformPlanarPoint,
  transformPlanarVector,
} from '../../dist/core/planar-transform.js';

const files = ['linked-linear', 'transformed-loop'];
const saved = await Promise.all(
  files.map((name) => readFile(new URL(`../fixtures/${name}.course.json`, import.meta.url), 'utf8')),
);
const fixture = (index = 0) => JSON.parse(saved[index]);
const ok = (result) => {
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result));
  return result.value;
};
const failure = (result, code, path, message) => {
  assert.equal(result.ok, false);
  assert.equal('value' in result, false);
  assert.equal(result.diagnostics[0].code, code);
  if (path) assert.equal(result.diagnostics[0].path, path);
  if (message) assert.match(result.diagnostics[0].message, message);
};
const close = (a, b) =>
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-7, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const anchor = (s) => ({ kind: 'absolute', s });
const port = (id, kind, s, carriagewayId = 'road') => ({ id, kind, anchor: anchor(s), carriagewayId });
const link = (id, from, to, sourcePort = 'out') => ({
  id,
  source: { sectionId: from, portId: sourcePort },
  destination: { sectionId: to, portId: 'in' },
  overlap: { behind: 30, ahead: 30 },
});

const fork = (count = 3) => forkCourseDocument(fixture(), count);

test('saved Links replay canonical immutable graphs, including actual cyclic Port/Section references', async () => {
  for (let i = 0; i < files.length; i++) {
    const input = fixture(i),
      text = ok(saveCourseDocument(input));
    assert.deepEqual(ok(parseCourseDocument(text)), input);
    const product = ok(await compileCourseDocument(input));
    assert.deepEqual(ok(await compileCourseDocument(ok(parseCourseDocument(text)))), product);
    assert.equal(
      product.entry,
      product.sections.find((s) => s.id === input.entrySectionId),
    );
    for (const joined of product.links) {
      for (const p of [joined.source, joined.destination]) {
        assert.equal(
          p.section,
          product.sections.find((s) => s.id === p.section.id),
        );
        assert.equal(
          p,
          p.section.ports.find((v) => v.id === p.id),
        );
        assert.equal(
          p.carriageway,
          p.section.carriageways.find((v) => v.id === p.carriageway.id),
        );
        if (p.anchor.kind === 'primitive') assert.ok(p.section.primitives.includes(p.anchor.primitive));
      }
      assert.ok(joined.source.section.outgoing.includes(joined));
      assert.ok(joined.destination.section.incoming.includes(joined));
    }
    const seen = new Set();
    const frozen = (value) => {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      assert.ok(Object.isFrozen(value));
      assert.equal(value instanceof Map || value instanceof Set || ArrayBuffer.isView(value), false);
      Object.values(value).forEach(frozen);
    };
    frozen(product);
    assert.throws(() => product.entry.outgoing.push(product.links[0]), TypeError);
    assert.throws(() => {
      product.links[0].destinationFromSource.translation.x = 0;
    }, TypeError);
  }
});

test('transformed LINEAR overlap aligns both edges and forward vectors, with a coherent inverse', async () => {
  const product = ok(await compileCourseDocument(fixture())),
    joined = product.links[0];
  close(joined.source.pose, { x: 11, z: 220 });
  close(joined.destination.pose, { x: 460, z: -195 });
  close(joined.destinationFromSource.translation, { x: 240, z: -184 });
  close(transformPlanarVector(joined.destinationFromSource, { x: 0, z: 1 }), { x: 1, z: 0 });
  const inverse = invertPlanarTransform(joined.destinationFromSource);
  for (const delta of [-30, -17.3, 0, 8.7, 30])
    for (const offset of [-5, 0, 5])
      for (const reader of ['raster', 'guide']) {
        const read = reader === 'raster' ? rasterPathToWorld : guidePathToWorld;
        const a = read(joined.source.section[reader], joined.source.anchor.s + delta, 1 + offset);
        const b = read(joined.destination.section[reader], joined.destination.anchor.s + delta, -5 + offset);
        close(transformPlanarPoint(joined.destinationFromSource, a), b);
        close(transformPlanarPoint(inverse, b), a);
      }
});

test('identity is derived from matching port frames; a transformed loop reuses its one source', async () => {
  const input = fixture();
  input.sections[1].start = structuredClone(input.sections[0].start);
  input.sections[1].boundaries = structuredClone(input.sections[0].boundaries);
  input.sections[1].ports[0].anchor = anchor(200);
  const identity = ok(await compileCourseDocument(input)).links[0].destinationFromSource;
  assert.equal(identity.cosine, 1);
  assert.equal(identity.sine, 0);
  close(identity.translation, { x: 0, z: 0 });
  const circuit = ok(await compileCourseDocument(fixture(1))),
    joined = circuit.links[0];
  assert.equal(joined.source.section, joined.destination.section);
  assert.equal(circuit.entry.outgoing[0], circuit.entry.incoming[0]);
  assert.equal(joined.destination.section.outgoing[0], joined);
  assert.ok(joined.source.anchor.s - joined.destination.anchor.s > 0);
  assert.ok(
    Math.hypot(joined.source.pose.x - joined.destination.pose.x, joined.source.pose.z - joined.destination.pose.z) >
      100,
  );
  close(transformPlanarPoint(joined.destinationFromSource, joined.source.pose), joined.destination.pose);
  close(
    transformPlanarPoint(invertPlanarTransform(joined.destinationFromSource), joined.destination.pose),
    joined.source.pose,
  );
});

test('two/three-way forks and diamond merges share successor objects across arbitrary IDs and order', async () => {
  for (const count of [2, 3]) {
    const input = fork(count);
    const names = new Map(input.sections.map((s, i) => [s.id, ['__proto__', 'constructor', '枝/~', '0', '共有'][i]]));
    input.entrySectionId = names.get(input.entrySectionId);
    for (const s of input.sections) {
      s.id = names.get(s.id);
      s.ports.reverse();
      s.boundaries.reverse();
      s.bands.reverse();
      s.carriageways.reverse();
    }
    for (const l of input.links) {
      l.source.sectionId = names.get(l.source.sectionId);
      l.destination.sectionId = names.get(l.destination.sectionId);
      l.id = `任意/${l.id}`;
    }
    input.sections.reverse();
    input.links.reverse();
    const product = ok(await compileCourseDocument(input));
    assert.notEqual(product.entry, product.sections[0]);
    assert.equal(product.entry.outgoing.length, count);
    const shared = product.sections.find((s) => s.outgoing.length === 0);
    assert.equal(shared.incoming.length, count);
    assert.equal(new Set(shared.incoming.map((l) => l.destination)).size, 1);
    for (const route of product.entry.outgoing)
      assert.equal(route.destination.section.outgoing[0].destination.section, shared);
  }
});

test('matching varying cross-sections may use different internal pavement subdivisions', async () => {
  const input = fixture(),
    [a, b] = input.sections;
  const points = [
    [0, -4],
    [170, -4],
    [177, -5],
    [205, -3],
    [229, -4],
    [300, -4],
  ];
  a.boundaries[0].knots = points.map(([s, l]) => ({ anchor: anchor(s), l }));
  b.boundaries[0].knots = [[0, -10], ...points.slice(1, -1).map(([s, l]) => [s - 140, l - 6]), [300, -10]].map(
    ([s, l]) => ({ anchor: anchor(s), l }),
  );
  b.boundaries.push({
    id: 'middle',
    knots: [
      { anchor: anchor(0), l: -5 },
      { anchor: anchor(300), l: -5 },
    ],
  });
  b.bands.push({ ...structuredClone(b.bands[0]), id: 'second', leftBoundaryId: 'middle' });
  b.bands[0].rightBoundaryId = 'middle';
  b.carriageways[0].bandIds.push('second');
  b.physicalBindings.push({ bandId: 'second', sections: [{ anchor: anchor(0), material: 'ASPHALT' }] });
  assert.equal(ok(await compileCourseDocument(input)).links.length, 1);
});

test('a fractional activation retains its canonical ruler station across offset cancellation', async () => {
  const input = fixture(),
    destination = input.sections[1];
  input.links[0].overlap.behind = 59.5;
  destination.bands.push({ ...structuredClone(destination.bands[0]), id: 'after', start: anchor(1.23) });
  destination.bands[0].end = anchor(1.23);
  destination.carriageways[0].bandIds.push('after');
  destination.physicalBindings.push({ bandId: 'after', sections: [{ anchor: anchor(1.23), material: 'ASPHALT' }] });
  assert.notEqual(60 + (1.23 - 60), 1.23, 'the input exercises cancellation at a real activation');
  assert.equal(ok(await compileCourseDocument(input)).links.length, 1);
});

test('an interior mismatch cannot hide between matching seam and fixed guard probes', async () => {
  const input = fixture(),
    right = input.sections[1].boundaries[1];
  right.knots = [
    [0, 0],
    [60, 0],
    [73, 1],
    [74, 0],
    [300, 0],
  ].map(([s, l]) => ({ anchor: anchor(s), l }));
  failure(await compileCourseDocument(input), 'semantic_compile_failure', '/links/0', /edge.*disagrees/);
});

test('Guide agreement alone cannot certify a mismatched Raster miter inside a straight guard', async () => {
  const input = fixture(),
    source = input.sections[0];
  source.primitives = [
    { id: 'line', kind: 'straight', length: 200 },
    { id: 'bend', kind: 'arc', radius: 100, turn: 30 },
    { id: 'end', kind: 'straight', length: 200 },
  ];
  source.ports[0].anchor = anchor(175);
  for (const b of source.boundaries) b.knots.at(-1).anchor.primitiveId = 'end';
  source.bands[0].end.primitiveId = 'end';
  source.height.at(-1).anchor.primitiveId = 'end';
  input.links[0].overlap = { behind: 10, ahead: 10 };
  failure(await compileCourseDocument(input), 'semantic_compile_failure', '/links/0', /raster carriageway edge/);
});

test('overlap rejects distinct stations that collapse in relative coordinates instead of choosing by declaration order', async () => {
  const input = fixture();
  input.links[0].overlap.behind = 200;
  input.sections[1].ports[0].anchor = anchor(250);
  input.sections[0].boundaries[0].knots = [
    [0, -4],
    [1e-15, -5],
    [2e-15, -4],
    [300, -4],
  ].map(([s, l]) => ({ anchor: anchor(s), l }));
  failure(await compileCourseDocument(input), 'semantic_compile_failure', '/links/0/source', /distinguishable/);
});

test('finite guards reject hidden curves, Guide fillets and lost carriageway coverage', async () => {
  const curve = fixture(),
    dest = curve.sections[1];
  dest.primitives = [
    { id: 'line', kind: 'straight', length: 40 },
    { id: 'bend', kind: 'arc', radius: 100, turn: 5 },
    { id: 'end', kind: 'straight', length: 270 },
  ];
  for (const b of dest.boundaries) b.knots.at(-1).anchor.primitiveId = 'end';
  dest.bands[0].end.primitiveId = 'end';
  dest.height.at(-1).anchor.primitiveId = 'end';
  failure(await compileCourseDocument(curve), 'semantic_compile_failure', '/links/0/destination', /authored straight/);
  const fillet = fixture(),
    s = fillet.sections[1];
  s.primitives = [
    { id: 'line', kind: 'straight', length: 200 },
    { id: 'bend', kind: 'arc', radius: 100, turn: 15 },
    { id: 'end', kind: 'straight', length: 200 },
  ];
  for (const b of s.boundaries) b.knots.at(-1).anchor.primitiveId = 'end';
  s.bands[0].end.primitiveId = 'end';
  s.height.at(-1).anchor.primitiveId = 'end';
  s.ports[0].anchor = anchor(150);
  fillet.links[0].overlap.ahead = 49;
  failure(await compileCourseDocument(fillet), 'semantic_compile_failure', '/links/0/destination', /Guide fillet/);
  const gap = fixture(),
    from = gap.sections[0];
  from.bands.push({ ...structuredClone(from.bands[0]), id: 'after', start: anchor(215) });
  from.bands[0].end = anchor(215);
  from.carriageways.push({ id: 'after', bandIds: ['after'] });
  from.physicalBindings.push({ bandId: 'after', sections: [{ anchor: anchor(215), material: 'ASPHALT' }] });
  failure(await compileCourseDocument(gap), 'semantic_compile_failure', '/links/0', /does not cover/);
  for (const behind of [61, Number.MIN_VALUE]) {
    const invalid = fixture();
    invalid.links[0].overlap.behind = behind;
    failure(
      await compileCourseDocument(invalid),
      'semantic_compile_failure',
      behind === 61 ? '/links/0/destination' : '/links/0/source',
      /representable extent/,
    );
  }
});

test('reference scopes, schema identity, guard domains and resource limits fail before publication', async () => {
  for (const [mutate, code, path] of [
    [
      (d) => {
        d.version = 1;
        delete d.links;
      },
      'unsupported_version',
      '/version',
    ],
    [
      (d) => {
        d.entrySectionId = 'missing';
      },
      'unresolved_reference',
      '/entrySectionId',
    ],
    [
      (d) => {
        d.links[0].source.sectionId = 'missing';
      },
      'unresolved_reference',
      '/links/0/source/sectionId',
    ],
    [
      (d) => {
        d.links[0].destination.portId = 'missing';
      },
      'unresolved_reference',
      '/links/0/destination/portId',
    ],
    [
      (d) => {
        d.sections[0].ports[0].carriagewayId = 'missing';
      },
      'unresolved_reference',
      '/sections/0/ports/0/carriagewayId',
    ],
    [
      (d) => {
        d.sections[0].ports.push(structuredClone(d.sections[0].ports[0]));
      },
      'duplicate_id',
      '/sections/0/ports/1/id',
    ],
    [
      (d) => {
        d.links.push(structuredClone(d.links[0]));
      },
      'duplicate_id',
      '/links/1/id',
    ],
    [
      (d) => {
        d.links[0].overlap.ahead = 0;
      },
      'invalid_numeric_domain',
      '/links/0/overlap/ahead',
    ],
    [
      (d) => {
        d.links[0].overlap.ahead = Infinity;
      },
      'invalid_numeric_domain',
      '/links/0/overlap/ahead',
    ],
    [
      (d) => {
        d.links[0].overlap.ahead = '30';
      },
      'invalid_shape',
      '/links/0/overlap/ahead',
    ],
    [
      (d) => {
        d.sections[0].scenery = [];
      },
      'unsupported_feature',
      '/sections/0/scenery',
    ],
    [
      (d) => {
        d.sections[0].ports = Array.from({ length: COURSE_DOCUMENT_LIMITS.ports + 1 }, (_, i) =>
          port(String(i), 'exit', 200),
        );
      },
      'resource_limit',
      '/sections/0/ports',
    ],
    [
      (d) => {
        d.links = Array.from({ length: COURSE_DOCUMENT_LIMITS.links + 1 }, (_, i) => ({
          ...d.links[0],
          id: String(i),
        }));
      },
      'resource_limit',
      '/links',
    ],
  ]) {
    const input = fixture();
    mutate(input);
    failure(await compileCourseDocument(input), code, path);
  }
  const draft = fixture();
  draft.links[0].destination.portId = 'missing';
  assert.deepEqual(ok(parseCourseDocument(ok(saveCourseDocument(draft)))), draft);
  assert.equal(ok(readCourseDocument(draft)).links[0].destination.portId, 'missing');
});

test('course topology rejects disconnected nodes, duplicate exits and cycles outside CIRCUIT', async () => {
  const disconnected = fixture(),
    extra = structuredClone(disconnected.sections[1]);
  extra.id = 'orphan';
  disconnected.sections.push(extra);
  failure(await compileCourseDocument(disconnected), 'semantic_compile_failure', '/sections', /reachable/);
  const duplicate = fixture();
  duplicate.links.push({ ...structuredClone(duplicate.links[0]), id: 'again' });
  failure(await compileCourseDocument(duplicate), 'semantic_compile_failure', '/sections/0/ports', /exactly one/);
  const wrongType = fork(2);
  wrongType.type = 'LINEAR';
  failure(await compileCourseDocument(wrongType), 'semantic_compile_failure', '/sections/0/ports', /Too many/);
  const cycle = fork(2);
  cycle.sections.at(-1).ports.push(port('out', 'exit', 240));
  cycle.links.push(link('cycle', 'shared', 'child-0'));
  failure(await compileCourseDocument(cycle), 'semantic_compile_failure', '/links', /acyclic/);
  const backward = fixture(),
    lap = backward.sections[0];
  backward.type = 'CIRCUIT';
  backward.sections = [lap];
  lap.ports = [port('in', 'entry', 200), port('out', 'exit', 60)];
  backward.links = [link('backward', lap.id, lap.id)];
  failure(await compileCourseDocument(backward), 'semantic_compile_failure', '/sections/0/ports', /positive span/);
  const wrongDirection = fixture();
  wrongDirection.sections[0].ports[0].kind = 'entry';
  failure(await compileCourseDocument(wrongDirection), 'semantic_compile_failure', '/links/0', /exit Port to an entry/);
});

test('failed imports and stale topology edits preserve prior graphs; caller mutation cannot alter publication', async () => {
  const project = createCourseProject(),
    original = ok(await project.importDocument(saved[1])),
    state = project.getState();
  const invalid = fixture(1);
  invalid.links[0].destination.portId = 'missing';
  failure(await project.importDocument(ok(saveCourseDocument(invalid))), 'unresolved_reference');
  assert.equal(project.getState(), state);
  const changed = fixture();
  ok(project.editDocument(changed));
  failure(project.exportCompiled(), 'stale_source');
  const pending = project.compile();
  changed.sections[1].start.x = 9999;
  changed.links.length = 0;
  const product = ok(await pending);
  assert.notEqual(product.identity.buildSha256, original.identity.buildSha256);
  close(product.links[0].destination.pose, { x: 460, z: -195 });
  assert.equal(original.links[0].source.section, original.links[0].destination.section);
  const transformEdit = fixture();
  transformEdit.sections[1].start.x += 10;
  ok(project.editDocument(transformEdit));
  failure(project.exportCompiled(), 'stale_source');
  const rebuilt = ok(await project.compile());
  assert.notEqual(product.identity.buildSha256, rebuilt.identity.buildSha256);
  assert.ok(
    Math.abs(
      rebuilt.links[0].destinationFromSource.translation.x - product.links[0].destinationFromSource.translation.x - 10,
    ) < 1e-8,
  );
});

test('offline reports handle cyclic compiled graphs without pretending to serialize them', () => {
  for (const name of files) {
    const result = spawnSync(
      process.execPath,
      ['tools/course/compile-course.mjs', `tests/fixtures/${name}.course.json`],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.links, 1);
    assert.ok(report.sections.every((s) => s.ports > 0));
    assert.equal(report.entrySection, report.sections[0].id);
  }
});
