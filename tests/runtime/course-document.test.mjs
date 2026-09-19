import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  COURSE_DOCUMENT_LIMITS,
  parseCourseDocument,
  readCourseDocument,
  saveCourseDocument,
} from '../../dist/course/course-document.js';
import { COURSE_GEOMETRY_RECIPE } from '../../dist/course/course-geometry.js';
import { compileCourseDocument } from '../../dist/runtime/compiled-course.js';
import { createCourseProject } from '../../dist/runtime/course-project.js';
import { guidePathToWorld } from '../../dist/core/guide-curve.js';

const fixtureText = await readFile(new URL('../fixtures/linear.course.json', import.meta.url), 'utf8');
const fixture = () => JSON.parse(fixtureText);
const ok = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
function failure(result, code, at) {
  assert.equal(result.ok, false);
  assert.equal(Object.hasOwn(result, 'value'), false, 'failure must not publish a partial product');
  assert.equal(result.diagnostics[0].code, code);
  if (at !== undefined) assert.equal(result.diagnostics[0].path, at);
  assert.ok(result.diagnostics[0].message.length > 0);
  return result.diagnostics[0];
}
const sha256 = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('saved linear document reopens with identical input and deterministic immutable geometry', async () => {
  const input = fixture();
  const saved = ok(saveCourseDocument(input));
  const reopened = ok(parseCourseDocument(saved));
  assert.deepEqual(reopened, input);
  assert.equal(ok(saveCourseDocument(reopened)), saved);
  const a = ok(await compileCourseDocument(input));
  const b = ok(await compileCourseDocument(reopened));
  assert.deepEqual(a, b);
  assert.notEqual(a.sections[0], b.sections[0]);
  assert.equal(a.sections[0].guide.raster, a.sections[0].raster);
  assert.equal(a.identity.sourceSha256, sha256(reopened));
  assert.equal(
    a.identity.buildSha256,
    sha256({
      sourceSha256: a.identity.sourceSha256,
      compiler: a.identity.compiler,
      geometryRecipe: a.identity.geometryRecipe,
    }),
  );
  // The identity includes the complete recipe, including the existing authoring primitive's contract.
  const changedRecipe = structuredClone(a.identity.geometryRecipe);
  changedRecipe.turtle.straightStepMeters = 25;
  assert.notEqual(
    a.identity.buildSha256,
    sha256({ sourceSha256: a.identity.sourceSha256, compiler: a.identity.compiler, geometryRecipe: changedRecipe }),
  );
});

test('geometry recipe preserves authored degree subdivisions, radius provenance and the compiled chord ruler', async () => {
  for (const turn of [30, -30, 35, -35, 35.001]) {
    const input = fixture();
    const section = input.sections[0];
    section.primitives[0].length = 100.001;
    section.primitives[1].turn = turn;
    section.boundaries[0].knots.splice(1, 0, {
      anchor: { kind: 'primitive', primitiveId: 'bend', fraction: 0.3 },
      l: -4,
    });
    const output = ok(await compileCourseDocument(input)).sections[0];
    const steps = Math.ceil(Math.abs(turn) / 5);
    assert.equal(output.raster.segments.length, 3 + steps + 2);
    const arc = output.primitives[1];
    const chord = 200 * Math.sin((Math.abs(turn) * Math.PI) / 180 / (2 * steps));
    assert.ok(Math.abs(arc.sEnd - arc.sStart - steps * chord) < 1e-10);
    assert.notEqual(arc.sEnd - arc.sStart, (100 * Math.abs(turn) * Math.PI) / 180);
    assert.equal(output.boundaries[0].knots[1].anchor.primitive, arc);
    assert.equal(output.boundaries[0].knots[1].anchor.s, arc.sStart + 0.3 * (arc.sEnd - arc.sStart));
    assert.equal(output.bandPartition.bands[0].end.s, output.raster.length);
    for (let i = 3; i <= 3 + steps; i += 1) assert.equal(output.raster.vertices[i].sourceRadius, 100);
    assert.equal(output.raster.vertices[2].sourceRadius, undefined);
    let accumulated = 0;
    output.raster.segments.forEach((segment, i) => {
      assert.equal(output.raster.vertexS[i], accumulated);
      accumulated += Math.hypot(
        output.raster.vertices[i + 1].x - output.raster.vertices[i].x,
        output.raster.vertices[i + 1].z - output.raster.vertices[i].z,
      );
      assert.equal(segment.sStart, output.raster.vertexS[i]);
    });
    assert.equal(accumulated, output.raster.length);
    const world = guidePathToWorld(output.guide, arc.sStart + (arc.sEnd - arc.sStart) / 2, 0);
    assert.ok(Number.isFinite(world.x) && Number.isFinite(world.z));
  }
});

test('arbitrary IDs and permuted declarations resolve canonical objects, shared edges and asset identities', async () => {
  const input = fixture();
  const s = input.sections[0];
  const rename = new Map([
    ['approach', '__proto__'],
    ['bend', '0'],
    ['runout', '終端/~'],
    ['left', 'constructor'],
    ['shared', '共用・辺'],
    ['right', 'not-an-index'],
    ['west', '舗装 A'],
    ['east', '舗装 B'],
  ]);
  input.id = 'arbitrary course/~';
  s.id = 'constructor';
  input.entrySectionId = s.id;
  s.primitives.forEach((p) => {
    p.id = rename.get(p.id);
  });
  s.boundaries.forEach((b) => {
    b.id = rename.get(b.id);
    b.knots.forEach((k) => {
      if (k.anchor.kind === 'primitive') k.anchor.primitiveId = rename.get(k.anchor.primitiveId);
    });
  });
  s.bands.forEach((b) => {
    b.id = rename.get(b.id);
    b.leftBoundaryId = rename.get(b.leftBoundaryId);
    b.rightBoundaryId = rename.get(b.rightBoundaryId);
    b.end.primitiveId = rename.get(b.end.primitiveId);
  });
  s.carriageways[0].id = 'unrelated road ID';
  for (const node of s.height)
    if (node.anchor.kind === 'primitive') node.anchor.primitiveId = rename.get(node.anchor.primitiveId);
  for (const binding of s.physicalBindings) binding.bandId = rename.get(binding.bandId);
  s.carriageways[0].bandIds = s.carriageways[0].bandIds.map((id) => rename.get(id));
  input.assets = ['asset/z', 'asset/a'].map((id, i) => ({
    id,
    format: 'superoutride.sprite-lod',
    version: 1,
    sha256: String(i).repeat(64),
  }));
  s.assetIds = ['asset/a', 'asset/z'];
  for (let permutation = 0; permutation < 2; permutation += 1) {
    const product = ok(await compileCourseDocument(input));
    const section = product.sections[0];
    for (const band of section.bandPartition.bands) {
      assert.equal(
        section.boundaries.find((b) => b.id === band.left.id),
        band.left,
      );
      assert.equal(
        section.boundaries.find((b) => b.id === band.right.id),
        band.right,
      );
      assert.equal(band.end.primitive, section.primitives.at(-1));
    }
    const west = section.bandPartition.bands.find((b) => b.id === '舗装 A');
    const east = section.bandPartition.bands.find((b) => b.id === '舗装 B');
    assert.equal(west.right, east.left);
    for (const band of section.carriageways[0].bands)
      assert.equal(
        section.bandPartition.bands.find((b) => b.id === band.id),
        band,
      );
    section.assets.forEach((a) =>
      assert.equal(
        product.assets.find((b) => b.id === a.id),
        a,
      ),
    );
    s.boundaries.reverse();
    s.bands.reverse();
    s.carriageways[0].bandIds.reverse();
    input.assets.reverse();
  }
});

test('JSON property order is normalized while saved authoring array order remains meaningful', async () => {
  const input = fixture();
  const reverseKeys = (value) =>
    Array.isArray(value)
      ? value.map(reverseKeys)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, v]) => [key, reverseKeys(v)]),
          )
        : value;
  assert.equal(ok(saveCourseDocument(input)), ok(saveCourseDocument(reverseKeys(input))));
  const a = ok(await compileCourseDocument(input));
  input.sections[0].primitives[0].length = 80;
  const b = ok(await compileCourseDocument(input));
  assert.notEqual(a.identity.sourceSha256, b.identity.sourceSha256);
  assert.notEqual(a.identity.buildSha256, b.identity.buildSha256);
  assert.notEqual(a.sections[0].primitives[1].sStart, b.sections[0].primitives[1].sStart);
});

test('caller mutations during digesting and nested publication mutations cannot change the product', async () => {
  const input = fixture();
  const pending = compileCourseDocument(input);
  input.sections[0].primitives[0].length = 300;
  input.sections[0].boundaries[0].knots[0].l = -99;
  input.sections[0].carriageways[0].bandIds.length = 0;
  const output = ok(await pending);
  assert.equal(output.sections[0].primitives[0].source.length, 100);
  assert.equal(output.sections[0].boundaries[0].knots[0].l, -4);
  const seen = new Set();
  function frozenGraph(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    assert.ok(Object.isFrozen(value));
    assert.equal(value instanceof Map || value instanceof Set || ArrayBuffer.isView(value), false);
    for (const child of Object.values(value)) frozenGraph(child);
  }
  frozenGraph(output);
  assert.throws(() => {
    output.sections[0].raster.vertices[0].x = 80;
  }, TypeError);
  assert.throws(() => {
    output.sections[0].bandPartition.bands[0].left.knots[0].l = 80;
  }, TypeError);
  assert.throws(
    () => output.sections[0].carriageways[0].bands.push(output.sections[0].bandPartition.bands[0]),
    TypeError,
  );
  assert.throws(() => {
    output.sections[0].guide.corners[3].center.x = 80;
  }, TypeError);
});

test('schema admission reports syntax, format/version, shape and numeric domains without a product', () => {
  failure(parseCourseDocument('{oops'), 'parse_failure', '');
  assert.throws(() => parseCourseDocument({}), TypeError);
  for (const bad of [null, [], new Date(), 'document']) failure(readCourseDocument(bad), 'invalid_shape', '');
  for (const [key, value] of [
    ['format', 'other'],
    ['version', 1],
  ]) {
    const input = fixture();
    input[key] = value;
    failure(readCourseDocument(input), 'unsupported_version', `/${key}`);
  }
  const units = fixture();
  units.units.angle = 'rad';
  failure(readCourseDocument(units), 'unsupported_version', '/units/angle');
  const missing = fixture();
  delete missing.sections[0].start.x;
  failure(readCourseDocument(missing), 'invalid_shape', '/sections/0/start/x');
  for (const length of [0, -1, NaN, Infinity, 100001]) {
    const input = fixture();
    input.sections[0].primitives[0].length = length;
    failure(readCourseDocument(input), 'invalid_numeric_domain', '/sections/0/primitives/0/length');
  }
  for (const turn of [0, NaN, Infinity, 361]) {
    const input = fixture();
    input.sections[0].primitives[1].turn = turn;
    failure(readCourseDocument(input), 'invalid_numeric_domain', '/sections/0/primitives/1/turn');
  }
  const input = fixture();
  input.sections[0].bands[0].end.fraction = 1.01;
  failure(readCourseDocument(input), 'invalid_numeric_domain', '/sections/0/bands/0/end/fraction');
});

test('scoped duplicate identities and every missing reference family fail before publication', async () => {
  for (const collection of ['primitives', 'boundaries', 'bands', 'carriageways']) {
    const input = fixture();
    const list = input.sections[0][collection];
    list.push(structuredClone(list[0]));
    failure(await compileCourseDocument(input), 'duplicate_id', `/sections/0/${collection}/${list.length - 1}/id`);
  }
  const duplicateSection = fixture();
  duplicateSection.sections.push(structuredClone(duplicateSection.sections[0]));
  failure(readCourseDocument(duplicateSection), 'duplicate_id', '/sections/1/id');
  const duplicateAsset = fixture();
  const a = { id: 'same', format: 'superoutride.sprite-lod', version: 1, sha256: 'a'.repeat(64) };
  duplicateAsset.assets = [a, a];
  failure(readCourseDocument(duplicateAsset), 'duplicate_id', '/assets/1/id');
  for (const [change, at] of [
    [
      (s) => {
        s.boundaries[0].knots[1].anchor.primitiveId = 'missing';
      },
      '/sections/0/boundaries/0/knots/1/anchor/primitiveId',
    ],
    [
      (s) => {
        s.bands[0].leftBoundaryId = 'missing';
      },
      '/sections/0/bands/0/leftBoundaryId',
    ],
    [
      (s) => {
        s.bands[0].rightBoundaryId = 'missing';
      },
      '/sections/0/bands/0/rightBoundaryId',
    ],
    [
      (s) => {
        s.carriageways[0].bandIds[0] = 'missing';
      },
      '/sections/0/carriageways/0/bandIds/0',
    ],
    [
      (s) => {
        s.assetIds = ['missing'];
      },
      '/sections/0/assetIds/0',
    ],
  ]) {
    const input = fixture();
    change(input.sections[0]);
    failure(await compileCourseDocument(input), 'unresolved_reference', at);
  }
});

test('unfinished semantic drafts save and reopen while unsupported features never substitute geometry', async () => {
  const input = fixture();
  input.sections[0].bands[0].start.s = 5;
  assert.deepEqual(ok(parseCourseDocument(ok(saveCourseDocument(input)))), input);
  failure(await compileCourseDocument(input), 'semantic_compile_failure', '/sections/0/bands');
  for (const [change, at] of [
    [
      (d) => {
        d.sections[0].primitives[1] = { id: 'curve', kind: 'bezier' };
      },
      '/sections/0/primitives/1/kind',
    ],
    [
      (d) => {
        d.views = [];
      },
      '/views',
    ],
    [
      (d) => {
        d.type = 'NETWORK';
      },
      '/type',
    ],
  ]) {
    const draft = fixture();
    change(draft);
    failure(await compileCourseDocument(draft), 'unsupported_feature', at);
  }
  const unresolved = fixture();
  unresolved.sections[0].carriageways[0].bandIds[0] = 'deleted-band';
  assert.deepEqual(ok(parseCourseDocument(ok(saveCourseDocument(unresolved)))), unresolved);
  failure(await compileCourseDocument(unresolved), 'unresolved_reference');
});

test('invalid widths, coverage, membership, Guide metrics and mapped geometry produce semantic diagnostics', async () => {
  for (const change of [
    (s) => {
      s.bands[0].rightBoundaryId = s.bands[0].leftBoundaryId;
    },
    (s) => {
      s.boundaries[0].knots[1].anchor = { kind: 'absolute', s: 0 };
    },
    (s) => {
      s.bands[0].end = { kind: 'absolute', s: 0 };
    },
    (s) => {
      s.bands[0].end = { kind: 'absolute', s: 999 };
    },
    (s) => {
      s.bands[1].leftBoundaryId = s.bands[0].leftBoundaryId;
    },
    (s) => {
      s.carriageways[0].bandIds.push(s.carriageways[0].bandIds[0]);
    },
    (s) => {
      s.carriageways.length = 0;
    },
    (s) => {
      s.bands[1].role = 'median';
    },
    (s) => {
      s.primitives[1].radius = 2;
    },
    (s) => {
      s.guide.mMin = 0.99;
    },
    (s) => {
      s.primitives[0].length = 1e-12;
    },
    (s) => {
      s.primitives[1].turn = 360;
    },
  ]) {
    const input = fixture();
    change(input.sections[0]);
    failure(await compileCourseDocument(input), 'semantic_compile_failure');
  }
  const duplicatedEdge = fixture();
  const s = duplicatedEdge.sections[0];
  s.boundaries.push({ ...structuredClone(s.boundaries[1]), id: 'same-location-different-edge' });
  s.bands[1].leftBoundaryId = 'same-location-different-edge';
  failure(await compileCourseDocument(duplicatedEdge), 'semantic_compile_failure', '/sections/0/bands');
});

test('a positive but unreadably short Guide is an authoring diagnostic and preserves the project', async () => {
  const project = createCourseProject();
  ok(await project.importDocument(fixtureText));
  const prior = project.getState();
  const input = fixture();
  input.sections[0].start = { x: 0, z: 0, heading: 0 };
  input.sections[0].primitives = [{ id: 'runout', kind: 'straight', length: 2e-9 }];
  // This survives Raster's minimum segment, but has no readable Guide interval.
  const saved = ok(saveCourseDocument(input));
  failure(await project.importDocument(saved), 'semantic_compile_failure', '/sections/0/guide');
  assert.equal(project.getState(), prior);
});

test('admission and generated-geometry resource limits fail before excessive allocation', async () => {
  const bytes = COURSE_DOCUMENT_LIMITS.jsonBytes;
  failure(parseCourseDocument(' '.repeat(bytes + 1)), 'resource_limit', '');
  failure(parseCourseDocument(' '.repeat(bytes - 1) + '海'), 'resource_limit', '');
  const longId = fixture();
  longId.id = 'x'.repeat(COURSE_DOCUMENT_LIMITS.idCodeUnits + 1);
  failure(readCourseDocument(longId), 'resource_limit', '/id');
  const many = fixture();
  many.sections[0].primitives = Array.from({ length: COURSE_DOCUMENT_LIMITS.primitives + 1 }, (_, i) => ({
    id: String(i),
    kind: 'straight',
    length: 1,
  }));
  failure(readCourseDocument(many), 'resource_limit', '/sections/0/primitives');
  const generated = fixture();
  generated.sections[0].primitives[0].length = 100000;
  generated.sections[0].primitives[2].length = 100000;
  failure(await compileCourseDocument(generated), 'resource_limit', '/sections/0/primitives');
});

test('project import is atomic and source edits invalidate all dependent output while retaining prior success', async () => {
  const project = createCourseProject();
  failure(project.save(), 'semantic_compile_failure');
  failure(await project.compile(), 'semantic_compile_failure');
  const first = ok(await project.importDocument(fixtureText));
  const original = project.getState();
  failure(await project.importDocument('{broken'), 'parse_failure');
  assert.equal(project.getState(), original);
  const bad = fixture();
  bad.sections[0].bands[0].leftBoundaryId = 'lost';
  failure(await project.importDocument(JSON.stringify(bad)), 'unresolved_reference');
  assert.equal(project.getState(), original);
  assert.equal(ok(project.exportCompiled()), first);
  const edit = fixture();
  edit.sections[0].primitives[0].length = 120;
  ok(project.editDocument(edit));
  assert.equal(project.getState().compiled, null);
  assert.equal(project.getState().lastSuccessful, first);
  failure(project.exportCompiled(), 'stale_source');
  assert.deepEqual(ok(parseCourseDocument(ok(project.save()))), edit);
  const second = ok(await project.compile());
  assert.notEqual(second.identity.buildSha256, first.identity.buildSha256);
  const ready = project.getState();
  ok(project.editDocument(edit));
  assert.equal(project.getState(), ready, 'a no-op edit retains the current build');
  failure(project.editDocument({}), 'invalid_shape');
  assert.equal(project.getState(), ready);
  ok(project.editDocument(bad));
  const dirty = project.getState();
  failure(await project.compile(), 'unresolved_reference');
  assert.equal(project.getState(), dirty);
  assert.equal(project.getState().lastSuccessful, second);
  assert.deepEqual(ok(parseCourseDocument(ok(project.save()))), bad, 'invalid semantic drafts remain saveable');
});

test('recipe and asset identity changes invalidate dependent output, and unsupported recipes never silently migrate', async () => {
  const project = createCourseProject();
  const original = ok(await project.importDocument(fixtureText));
  assert.equal(original.identity.geometryRecipe, COURSE_GEOMETRY_RECIPE);
  for (const version of [1, 2]) {
    const recipeEdit = fixture();
    recipeEdit.geometryRecipe.version = version;
    ok(project.editDocument(recipeEdit));
    failure(project.exportCompiled(), 'stale_source');
    failure(await project.compile(), 'unsupported_version', '/geometryRecipe');
    assert.equal(project.getState().lastSuccessful, original);
    assert.deepEqual(ok(parseCourseDocument(ok(project.save()))), recipeEdit);
  }
  const asset = fixture();
  asset.assets = [{ id: 'sprite', format: 'superoutride.sprite-lod', version: 1, sha256: 'a'.repeat(64) }];
  asset.sections[0].assetIds = ['sprite'];
  const a = ok(await project.importDocument(JSON.stringify(asset)));
  asset.assets[0].sha256 = 'b'.repeat(64);
  ok(project.editDocument(asset));
  failure(project.exportCompiled(), 'stale_source');
  const b = ok(await project.compile());
  assert.notEqual(a.identity.buildSha256, b.identity.buildSha256);
});

test('late imports/builds cannot overwrite an intervening edit or newer import', async () => {
  const project = createCourseProject();
  ok(await project.importDocument(fixtureText));
  const pending = project.compile();
  const changed = fixture();
  changed.sections[0].primitives[0].length = 150;
  ok(project.editDocument(changed));
  failure(await pending, 'stale_source');
  assert.equal(project.getState().source.sections[0].primitives[0].length, 150);
  assert.equal(project.getState().compiled, null);
  const older = project.importDocument(fixtureText);
  const newer = project.importDocument(JSON.stringify(changed));
  failure(await older, 'stale_source');
  assert.equal(project.getState().source.sections[0].primitives[0].length, 150);
  const latest = ok(await newer);
  assert.equal(ok(project.exportCompiled()), latest);
});

test('unexpected platform failures propagate and cannot replace the valid project', async (t) => {
  const project = createCourseProject();
  ok(await project.importDocument(fixtureText));
  const prior = project.getState();
  const fault = new Error('hash platform unavailable');
  t.mock.method(crypto.subtle, 'digest', async () => {
    throw fault;
  });
  await assert.rejects(project.importDocument(fixtureText), (error) => error === fault);
  assert.equal(project.getState(), prior);
});

test('declared offline entry compiles the saved fixture and reports diagnostics without changing inputs', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'course-document-'));
  try {
    const input = path.join(dir, 'linear.json');
    await writeFile(input, fixtureText);
    const run = (file) => spawnSync(process.execPath, ['tools/course/compile-course.mjs', file], { encoding: 'utf8' });
    const good = run(input);
    assert.equal(good.status, 0, good.stderr);
    const report = JSON.parse(good.stdout);
    assert.equal(report.sections[0].segments, 10);
    assert.equal(report.identity.buildSha256, ok(await compileCourseDocument(fixture())).identity.buildSha256);
    assert.equal(await readFile(input, 'utf8'), fixtureText);
    await writeFile(input, '{broken');
    const bad = run(input);
    assert.equal(bad.status, 1);
    failure(JSON.parse(bad.stderr), 'parse_failure');
    assert.equal(await readFile(input, 'utf8'), '{broken');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
