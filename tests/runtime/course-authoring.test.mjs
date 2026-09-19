import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { readCourseDocument } from '../../dist/course/course-document.js';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { loadCourse } from '../../tools/course/authoring-io.mjs';

const source = 'content/courses/linear.course.json';
function cli(tool, args, success = true) {
  const result = spawnSync(process.execPath, [`tools/course/${tool}.mjs`, ...args], { encoding: 'utf8' });
  const value = JSON.parse(result.stdout);
  assert.equal(result.status, success ? 0 : 1, JSON.stringify(value));
  assert.equal(value.ok, success);
  return value;
}
async function temporary(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'course-authoring-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('sequence uses the same scene as individual renders and rejects unbounded requests', async (t) => {
  const dir = await temporary(t),
    sequence = cli('course', [
      'render',
      source,
      '--vehicle',
      'VFR750R',
      '--start',
      '500',
      '--end',
      '600',
      '--step',
      '100',
      '--out',
      dir,
    ]);
  assert.equal(sequence.render.frames.length, 2);
  const single = path.join(dir, 'single.png');
  cli('course', ['render', source, '--vehicle', 'VFR750R', '--s', '600', '--out', single]);
  assert.deepEqual(await readFile(single), await readFile(sequence.render.frames[1].output));
  const failure = cli(
    'course',
    ['render', source, '--start', '30', '--end', '2700', '--step', '1', '--out', dir],
    false,
  );
  assert.equal(failure.diagnostics[0].path, '/sequence');
  const malformed = path.join(dir, 'invalid.json');
  await writeFile(malformed, Buffer.from([0xff, 0x7b]));
  assert.equal(cli('course', ['compile', malformed], false).diagnostics[0].code, 'parse_failure');
});

test('report includes finite fork Boundary domains, compiled geometry, scenery and saved images', async (t) => {
  const dir = await temporary(t);
  cli('course', ['report', 'content/courses/branch.course.json', '--step', '50', '--out', dir]);
  const report = JSON.parse(await readFile(path.join(dir, 'report.json'), 'utf8'));
  assert.ok(report.samples[0].boundaries.includes(null));
  assert.ok(report.samples.every((s) => Number.isFinite(s.curvaturePerMeter) && Number.isFinite(s.heightMeters)));
  assert.ok(report.scenery.some((s) => s.state !== null));
  assert.ok(report.environments.length);
  assert.match(await readFile(path.join(dir, 'report.txt'), 'utf8'), /NA/);
  for (const file of ['bands.png', 'plan.png']) {
    const png = PNG.sync.read(await readFile(path.join(dir, file)));
    assert.ok(png.width >= 800 && png.height >= 1000);
    assert.ok(new Set(png.data).size > 100);
  }
  assert.equal(cli('course', ['report', source, '--step', '0.01', '--out', dir], false).diagnostics[0].path, '/step');
});

test('offline fit reproduces the saved course, provenance and primitive anchors without partial publication', async (t) => {
  const dir = await temporary(t),
    out = path.join(dir, 'course.json');
  const args = [
    'content/authoring/linear.observations.json',
    'content/authoring/linear.fit.json',
    '--out',
    out,
    '--distance-scale',
    '1.05',
    '--curvature-scale',
    '0.94',
    '--height-scale',
    '0.8',
  ];
  const result = cli('fit', args),
    once = await readFile(out);
  cli('fit', args);
  assert.deepEqual(await readFile(out), once);
  const fitted = JSON.parse(once),
    saved = JSON.parse(await readFile(source, 'utf8'));
  fitted.reference.observations.location = saved.reference.observations.location;
  assert.deepEqual(fitted, saved);
  assert.equal(result.primitives, 7);
  assert.ok(result.lengthMeters > 2900 && result.lengthMeters < 3000);
  assert.equal(
    fitted.reference.observations.sha256,
    createHash('sha256')
      .update(await readFile(args[0]))
      .digest('hex'),
  );
  assert.ok(result.checkpoints.every((p) => fitted.sections[0].primitives.some((g) => g.id === p.anchor.primitiveId)));
  const visit = (value) => {
    if (value && typeof value === 'object') {
      assert.notEqual(value.kind, 'absolute');
      Object.values(value).forEach(visit);
    }
  };
  visit(fitted.sections[0]);
  const failure = cli('fit', [...args.slice(0, 4), '--distance-scale', '-1'], false);
  assert.equal(failure.diagnostics[0].path, '/distanceScale');
  assert.deepEqual(await readFile(out), once);
  const loaded = await loadCourse(source);
  const admitted = readCourseDocument(saved);
  assert.equal(admitted.ok, true);
  assert.ok(
    Object.isFrozen(admitted.value.reference.source) && Object.isFrozen(admitted.value.reference.remasterDeviations),
  );
  const changed = structuredClone(saved);
  changed.reference.source.edition += ' revised';
  const compiled = await compileCourseDocument(changed, loaded.images);
  assert.equal(compiled.ok, true);
  assert.notEqual(compiled.value.identity.sourceSha256, loaded.course.identity.sourceSha256);
  changed.reference.calibration.heightScale = -1;
  assert.equal(readCourseDocument(changed).ok, false);
  changed.reference = saved.reference;
  changed.version = 7;
  assert.equal(readCourseDocument(changed).ok, false);
});

test('calibrated pixel measurement recovers horizon, scanline centers, HUD speed and integrated distance', async (t) => {
  const dir = await temporary(t),
    templates = Object.fromEntries([
      ['0', ['111', '101', '101', '101', '111']],
      ['1', ['010', '110', '010', '010', '111']],
      ['2', ['111', '001', '111', '100', '111']],
      ['3', ['111', '001', '111', '001', '111']],
      ['4', ['101', '101', '111', '001', '001']],
      ['5', ['111', '100', '111', '001', '111']],
      ['6', ['111', '100', '111', '101', '111']],
      ['7', ['111', '001', '010', '010', '010']],
      ['8', ['111', '101', '111', '101', '111']],
      ['9', ['111', '101', '111', '001', '111']],
    ]);
  const colors = { sky: [10, 40, 200], road: [80, 80, 80], ink: [255, 255, 255] };
  for (const [i, speed] of ['20', '40'].entries()) {
    const png = new PNG({ width: 160, height: 120 });
    const pixel = (x, y, color) => {
      const at = (y * 160 + x) * 4;
      png.data.set([...color, 255], at);
    };
    for (let y = 0; y < 120; y++) for (let x = 0; x < 160; x++) pixel(x, y, y < 40 ? colors.sky : [0, 80, 0]);
    for (let y = 41; y < 120; y++) {
      const half = (y - 40) * 0.5;
      for (let x = Math.ceil(80 - half); x <= Math.floor(80 + half); x++) pixel(x, y, colors.road);
    }
    [...speed].forEach((digit, i) =>
      templates[digit].forEach((row, y) =>
        [...row].forEach((b, x) => {
          if (b === '1') pixel(5 + i * 4 + x, 5 + y, colors.ink);
        }),
      ),
    );
    await writeFile(path.join(dir, `${i}.png`), PNG.sync.write(png));
  }
  const request = {
    format: 'superoutride.frame-measurement',
    version: 1,
    id: 'known-calibrated-frames',
    source: { kind: 'video', location: 'synthetic://measurement-fixture', edition: 'deterministic test v1' },
    environmentLabel: 'fixture',
    calibration: {
      camera: { focalLengthPixels: 100, heightMeters: 2, centerXPixels: 80, horizonReferencePixels: 40 },
      horizon: { columns: [0, 159], top: 20, bottom: 60, palette: [colors.sky], tolerance: 0 },
      road: {
        rows: [60, 80, 100],
        left: 20,
        right: 140,
        maxGapPixels: 1,
        minWidthPixels: 5,
        palette: [colors.road],
        tolerance: 0,
      },
      hud: {
        x: 5,
        y: 5,
        digitWidth: 3,
        digitHeight: 5,
        spacing: 1,
        count: 2,
        palette: [colors.ink],
        tolerance: 0,
        maxMismatchFraction: 0,
        templates,
      },
    },
    frames: [
      { path: '0.png', timeSeconds: 0 },
      { path: '1.png', timeSeconds: 1 },
    ],
  };
  const file = path.join(dir, 'request.json'),
    out = path.join(dir, 'observations.json');
  await writeFile(file, JSON.stringify(request));
  cli('measure', [file, '--out', out]);
  const bytes = await readFile(out),
    obs = JSON.parse(bytes);
  assert.equal(obs.source.edition, request.source.edition);
  assert.equal(obs.samples[1].s, 30 / 3.6);
  assert.deepEqual(
    obs.measurements.map((m) => m.speedKph),
    [20, 40],
  );
  for (const m of obs.measurements) {
    assert.equal(m.horizonPixels, 40);
    assert.deepEqual(
      m.roadCenters.map((r) => r.center),
      [80, 80, 80],
    );
    assert.equal(m.curvaturePerMeter, 0);
    assert.equal(m.grade, 0);
    assert.ok(Math.abs(m.roadWidthMeters - 2) < 0.11);
    assert.match(m.sha256, /^[a-f0-9]{64}$/);
  }
  request.calibration.hud.x = 30;
  await writeFile(file, JSON.stringify(request));
  assert.equal(cli('measure', [file, '--out', out], false).diagnostics[0].path, '/hud');
  assert.deepEqual(await readFile(out), bytes);
});
