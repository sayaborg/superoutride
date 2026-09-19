import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { courseBoundaryAt, courseBandAt } from '../../dist/course/course-bands.js';
import { guideEnvelopeAt } from '../../dist/core/guide-envelope.js';
import { parseCourseDocument, saveCourseDocument } from '../../dist/course/course-document.js';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';

const text = await readFile(new URL('../fixtures/partition-linear.course.json', import.meta.url), 'utf8');
const fixture = () => JSON.parse(text);
const ok = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
const failure = (result, message, path = '/sections/0/bands') => {
  assert.equal(result.ok, false);
  assert.equal('value' in result, false);
  assert.equal(result.diagnostics[0].code, 'semantic_compile_failure');
  assert.equal(result.diagnostics[0].path, path);
  assert.match(result.diagnostics[0].message, message);
};
const anchor = (s) => ({ kind: 'absolute', s });
const boundary = (id, points) => ({ id, knots: points.map(([s, l]) => ({ anchor: anchor(s), l })) });
const band = (id, start, end, leftBoundaryId, rightBoundaryId, role = 'shoulder') => ({
  id,
  start: anchor(start),
  end: anchor(end),
  leftBoundaryId,
  rightBoundaryId,
  role,
});

test('saved partial profiles reproduce one-to-three-to-one cross-sections and canonical immutable references', async () => {
  const input = fixture(),
    saved = ok(saveCourseDocument(input));
  assert.deepEqual(ok(parseCourseDocument(saved)), input);
  const product = ok(await compileCourseDocument(input));
  assert.deepEqual(ok(await compileCourseDocument(ok(parseCourseDocument(saved)))), product);
  const section = product.sections[0],
    partition = section.bandPartition;
  assert.equal(partition.length, section.raster.length);
  assert.equal(partition.length, 200);
  assert.equal(partition.bands.length, 7);
  for (const b of partition.bands) {
    assert.equal(
      b.left,
      section.boundaries.find((v) => v.id === b.left.id),
    );
    assert.equal(
      b.right,
      section.boundaries.find((v) => v.id === b.right.id),
    );
  }
  for (const road of section.carriageways)
    for (const b of road.bands)
      assert.equal(
        b,
        partition.bands.find((v) => v.id === b.id),
      );
  for (const s of [0, 36.9, 37, 37.1, 77, 100, 123, 162.9, 163, 200])
    for (const l of [-8, -3, 0, 3, 8]) {
      const expected =
        s < 37
          ? 'before'
          : s >= 163
            ? 'after'
            : s === 37
              ? l < -3
                ? 'west'
                : l < 3
                  ? 'center'
                  : 'east'
              : l < -4
                ? 'west'
                : l === -3
                  ? 'median-a'
                  : l === 3
                    ? 'median-b'
                    : l > 4
                      ? 'east'
                      : 'center';
      assert.equal(courseBandAt(partition, s, l)?.id, expected, `s=${s}, l=${l}`);
    }
  assert.throws(() => courseBoundaryAt(section.boundaries[1], 0), RangeError, 'partial profiles never extrapolate');
  assert.throws(() => partition.bands.pop(), TypeError);
  assert.throws(() => {
    partition.length = 1;
  }, TypeError);
  assert.throws(() => {
    partition.bands[0].end.s = 1;
  }, TypeError);
});

test('two-way partition changes and terminal zero-width tapers use the same interval rules', async () => {
  const input = fixture(),
    source = input.sections[0];
  source.bands = source.bands.filter((b) => !['median-b', 'east'].includes(b.id));
  source.bands.find((b) => b.id === 'center').rightBoundaryId = 'right';
  source.carriageways.pop();
  source.physicalBindings = source.physicalBindings.filter((b) => !['median-b', 'east'].includes(b.bandId));
  const section = ok(await compileCourseDocument(input)).sections[0];
  for (const s of [37, 100, 162]) assert.equal(courseBandAt(section.bandPartition, s, 8)?.id, 'center');
  assert.equal(courseBandAt(section.bandPartition, 163, 8)?.id, 'after');
  source.boundaries.push(
    boundary('tip-left', [
      [0, 12],
      [200, 12],
    ]),
    boundary('tip-right', [
      [0, 12],
      [100, 15],
      [200, 12],
    ]),
  );
  source.bands.push(band('tip', 0, 200, 'tip-left', 'tip-right'));
  source.physicalBindings.push({ bandId: 'tip', sections: [{ anchor: anchor(0), material: 'ASPHALT' }] });
  const taper = ok(await compileCourseDocument(input)).sections[0].bandPartition;
  assert.equal(courseBandAt(taper, 0, 12), null);
  assert.equal(courseBandAt(taper, 100, 12)?.id, 'tip');
  assert.equal(courseBandAt(taper, 200, 12), null);
});

test('longitudinal switches and taper edges have one exact owner without tolerance enlargement', async () => {
  const section = ok(await compileCourseDocument(fixture())).sections[0],
    partition = section.bandPartition;
  const byId = (id) => partition.bands.find((b) => b.id === id);
  for (const [s, id] of [
    [0, 'before'],
    [37 - 1e-10, 'before'],
    [37, 'west'],
    [37 + 1e-10, 'west'],
    [163 - 1e-10, 'west'],
    [163, 'after'],
    [163 + 1e-10, 'after'],
    [200, 'after'],
  ])
    assert.equal(courseBandAt(partition, s, -8), byId(id));
  for (const s of [37, 37 + 1e-8, 55, 77, 100, 123, 163 - 1e-8]) {
    const active = partition.bands.filter((b) => b.start.s <= s && s < b.end.s);
    for (const b of active) {
      const left = courseBoundaryAt(b.left, s),
        right = courseBoundaryAt(b.right, s);
      if (left === right) {
        assert.notEqual(courseBandAt(partition, s, left), b, 'zero width owns no point');
      } else {
        assert.equal(courseBandAt(partition, s, left), b);
        assert.notEqual(courseBandAt(partition, s, left - 1e-12), b);
        assert.equal(courseBandAt(partition, s, right - 1e-12), b);
        assert.notEqual(courseBandAt(partition, s, right), b);
      }
    }
    assert.equal(courseBandAt(partition, s, 9), null);
    assert.equal(courseBandAt(partition, s, -9 - 1e-12), null);
  }
  for (const s of [-1e-12, 200 + 1e-12, NaN, Infinity]) assert.throws(() => courseBandAt(partition, s, 0), RangeError);
});

test('arbitrary IDs and declaration order do not privilege a first Band or join public ID tables', async () => {
  const input = fixture(),
    source = input.sections[0];
  const original = ok(await compileCourseDocument(input)).sections[0];
  const ids = new Map(
    source.bands.map((b, i) => [b.id, ['__proto__', 'constructor', '曲線/~', '0', 'end', 'start', 'else'][i]]),
  );
  for (const b of source.bands) b.id = ids.get(b.id);
  for (const b of source.physicalBindings) b.bandId = ids.get(b.bandId);
  for (const road of source.carriageways) road.bandIds = road.bandIds.map((id) => ids.get(id)).reverse();
  source.bands.push(source.bands.shift()); // The first Band is now partial, [37,163].
  source.boundaries.reverse();
  source.carriageways.reverse();
  const changed = ok(await compileCourseDocument(input)).sections[0];
  assert.equal(changed.bandPartition.bands[0].start.s, 37);
  assert.deepEqual(changed.guide, original.guide);
  for (const s of [0, 37, 50, 163, 200])
    for (const l of [-9, -3, 0, 3, 9])
      assert.equal(
        courseBandAt(changed.bandPartition, s, l)?.id,
        ids.get(courseBandAt(original.bandPartition, s, l)?.id),
      );
});

test('staggered isolated tapers contribute only their closed active extent to the local envelope', async () => {
  const input = fixture(),
    source = input.sections[0];
  source.boundaries.push(
    boundary('island-left', [
      [0, 900],
      [23, 12],
      [177, 12],
      [200, 900],
    ]),
    boundary('island-right', [
      [23, 12],
      [40, 15],
      [170, 15],
      [177, 12],
    ]),
  );
  source.bands.push(band('island', 23, 177, 'island-left', 'island-right'));
  source.physicalBindings.push({ bandId: 'island', sections: [{ anchor: anchor(23), material: 'ASPHALT' }] });
  const section = ok(await compileCourseDocument(input)).sections[0];
  for (const s of [0, 200]) assert.equal(guideEnvelopeAt(section.guide.envelope, s), 11);
  for (const s of [23, 177]) {
    assert.equal(courseBandAt(section.bandPartition, s, 12), null);
    assert.equal(guideEnvelopeAt(section.guide.envelope, s), 14);
  }
  for (const s of [40, 100, 170]) {
    assert.equal(courseBandAt(section.bandPartition, s, 13)?.id, 'island');
    assert.equal(courseBandAt(section.bandPartition, s, 10), null);
    assert.equal(guideEnvelopeAt(section.guide.envelope, s), 17);
  }
});

test('coverage, interior zero width, inverted tapers and temporal overlaps fail with causal diagnostics', async () => {
  for (const [mutate, message, path] of [
    [
      (s) => {
        s.boundaries[1].knots[0].anchor.s = 38;
      },
      /cover.*closed interval/,
      '/sections/0/bands/1/rightBoundaryId',
    ],
    [
      (s) => {
        s.boundaries[1].knots.at(-1).anchor.s = 162;
      },
      /cover.*closed interval/,
      '/sections/0/bands/1/rightBoundaryId',
    ],
    [
      (s) => {
        s.boundaries[2].knots[1].l = -4;
      },
      /positive width/,
    ],
    [
      (s) => {
        s.boundaries[2].knots[1].l = -5;
      },
      /positive width|overlap/,
    ],
    [
      (s) => {
        s.bands[0].end.s = 40;
      },
      /overlap/,
    ],
    [
      (s) => {
        s.bands.at(-1).start.s = 170;
      },
      /active Bands/,
    ],
    [
      (s) => {
        s.bands[0].end.s = 0;
      },
      /positive length/,
      '/sections/0/bands/0',
    ],
    [
      (s) => {
        s.carriageways[0].bandIds.push('center');
        s.carriageways.splice(1, 1);
      },
      /contiguous/,
      '/sections/0/carriageways/0',
    ],
  ]) {
    const input = fixture();
    mutate(input.sections[0]);
    failure(await compileCourseDocument(input), message, path);
  }
  const zero = fixture(),
    source = zero.sections[0];
  source.boundaries.push(
    boundary('zero', [
      [17, 12],
      [23, 12],
    ]),
  );
  source.bands.push(band('empty', 17, 23, 'zero', 'zero'));
  failure(await compileCourseDocument(zero), /zero width throughout/);
});

test('transition proof compares complete unions, not only outer edges or occupancy including shoulders', async () => {
  for (const replacement of ['gap', 'shoulder']) {
    const input = fixture(),
      source = input.sections[0];
    source.boundaries[1].knots[0].l = -4;
    source.boundaries[2].knots[0].l = -2;
    if (replacement === 'gap') source.bands.splice(2, 1);
    else source.bands[2].role = 'shoulder';
    failure(await compileCourseDocument(input), replacement === 'gap' ? /Active Band union/ : /Pavement\/median union/);
  }
  const valid = fixture();
  valid.sections[0].boundaries[1].knots[0].l = -4;
  valid.sections[0].boundaries[2].knots[0].l = -2;
  const section = ok(await compileCourseDocument(valid)).sections[0];
  assert.equal(
    courseBandAt(section.bandPartition, 37, -3)?.id,
    'median-a',
    'positive-width replacement is a continuous partition change',
  );
});

test('a shared edge requires canonical identity even when its only stations are activation endpoints', async () => {
  const input = fixture(),
    source = input.sections[0];
  source.primitives = [{ id: 'tiny', kind: 'straight', length: 10 }];
  source.boundaries = [-2, 0, 0, 2].map((l, i) =>
    boundary(`edge-${i}`, [
      [0, l],
      [10, l],
    ]),
  );
  source.bands = [band('a', 0, 10, 'edge-0', 'edge-1', 'pavement'), band('b', 0, 10, 'edge-2', 'edge-3', 'pavement')];
  source.carriageways = [
    { id: 'a', bandIds: ['a'] },
    { id: 'b', bandIds: ['b'] },
  ];
  failure(await compileCourseDocument(input), /canonical shared Boundary/);
  source.bands[1].leftBoundaryId = 'edge-1';
  source.height.at(-1).anchor = { kind: 'primitive', primitiveId: 'tiny', fraction: 1 };
  source.physicalBindings = source.bands.map((b) => ({
    bandId: b.id,
    sections: [{ anchor: b.start, material: 'ASPHALT' }],
  }));
  const section = ok(await compileCourseDocument(input)).sections[0];
  assert.equal(courseBandAt(section.bandPartition, 5, 0), section.bandPartition.bands[1]);
});

test('activation edits invalidate publication and failed replacement preserves the complete prior project', async () => {
  const project = createCourseProject();
  const original = ok(await project.importDocument(text)),
    state = project.getState();
  const invalid = fixture();
  invalid.sections[0].bands[0].end.s = 38;
  failure(await project.importDocument(ok(saveCourseDocument(invalid))), /overlap/);
  assert.equal(project.getState(), state);
  const changed = fixture(),
    source = changed.sections[0];
  source.bands[0].end.s = 36;
  for (const b of source.bands) if (b.start.s === 37) b.start.s = 36;
  for (const b of source.boundaries) if (b.knots[0].anchor.s === 37) b.knots[0].anchor.s = 36;
  for (const b of source.physicalBindings) if (b.sections[0].anchor.s === 37) b.sections[0].anchor.s = 36;
  ok(project.editDocument(changed));
  assert.deepEqual(project.exportCompiled(), { ok: false, reason: 'stale_source' });
  const pending = project.compile();
  source.bands[0].end.s = 300;
  const product = ok(await pending);
  assert.notEqual(product.identity.buildSha256, original.identity.buildSha256);
  assert.equal(courseBandAt(original.sections[0].bandPartition, 36.5, 0)?.id, 'before');
  assert.equal(courseBandAt(product.sections[0].bandPartition, 36.5, 0)?.id, 'center');
});
