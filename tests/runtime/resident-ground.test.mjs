import assert from 'node:assert/strict';
import test from 'node:test';
import { compileResidentGround } from '../../dist/groundmap/compile-resident-ground.js';
import {
  readResidentGround,
  selectGroundLevel,
  groundByteLength,
  GROUND_LIMITS,
} from '../../dist/groundmap/resident-ground.js';
import { createCourseGroundSource } from '../../dist/groundmap/course-ground-source.js';
import { rgb555ToRgba, rgbaToRgb555 } from '../../dist/graphics/rgb555.js';
import { rgba, unpackRgba } from '../../dist/graphics/software-surface.js';
import { contentDigest } from '../../dist/core/content-digest.js';

function source(length = 3.315) {
  const boundary = (a, b) => ({
    knots: [
      { anchor: { s: 0 }, l: a },
      { anchor: { s: length }, l: b },
    ],
  });
  const band = { start: { s: 0 }, end: { s: length }, left: boundary(-0.32, -0.28), right: boundary(1.1, 1.6) };
  const image = { width: 2, height: 2, levels: [{ paletteRgb555: [0, 32767, 31], indices: [1, 2, 3, 0] }] };
  const paint = {
    asset: { source: image },
    phaseS: 0.013,
    phaseL: -0.027,
    alternate: { paletteRgb555: [1024, 992, 31744], spanS: 0.225, spanL: 0.15 },
  };
  return {
    partition: { length, bands: [band] },
    left: 0.325,
    right: 1.725,
    baseRgb555: 99,
    bands: [{ band, sections: [{ anchor: { s: 0 }, paint }] }],
    stamps: [
      { id: 'patch', asset: { source: image }, gridL: 0, gridS: 63 },
      { id: 'top', asset: { source: image }, gridL: 1, gridS: 63 },
    ],
  };
}

function oracle(data, grid, k, x, y) {
  const field = createCourseGroundSource(data);
  const dx = 2 ** k,
    dy = 4 * 4 ** k;
  const x0 = grid.originCell + x * dx,
    x1 = x0 + dx,
    y0 = y * dy,
    y1 = y0 + dy;
  let r = 0,
    g = 0,
    b = 0,
    a = 0;
  for (let iy = y0; iy < Math.min(y1, Math.ceil(data.partition.length * 40)); iy++) {
    const top = iy,
      bottom = Math.min(iy + 1, data.partition.length * 40);
    for (let ix = Math.max(x0, Math.floor(-data.left * 40)); ix < Math.min(x1, Math.ceil(data.right * 40)); ix++) {
      const left = Math.max(ix, -data.left * 40),
        right = Math.min(ix + 1, data.right * 40);
      const weight = (bottom - top) * (right - left);
      if (weight <= 0) continue;
      // The source lattice fixes cell-centre classification; finite edges clip area only.
      const l = (ix + 0.5) / 40;
      const color = field.sample((top + bottom) / 80, Math.min(data.right - 1e-12, Math.max(-data.left, l)));
      const c = unpackRgba(rgb555ToRgba(color));
      r += c.r * weight;
      g += c.g * weight;
      b += c.b * weight;
      a += weight;
    }
  }
  return rgb555ToRgba(rgbaToRgb555(rgba(r / a, g / a, b / a)));
}

test('resident levels equal independent direct-source area integration at partial edges, paint and ordered stamps', async () => {
  const data = source(),
    compiled = await compileResidentGround([data], 'fixture');
  const product = await readResidentGround(compiled.manifest, compiled.payload, 'fixture', compiled.manifest.grids);
  const grid = compiled.manifest.grids[0],
    reader = product.readers[0];
  for (let k = 0; k <= compiled.manifest.kMax; k++) {
    const dx = 2 ** k,
      dy = 4 * 4 ** k;
    const width = Math.ceil((grid.right * 40 - grid.originCell) / dx),
      height = Math.ceil((grid.length * 40) / dy);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const left = Math.max(grid.left, (grid.originCell + x * dx) / 40),
          right = Math.min(grid.right, (grid.originCell + (x + 1) * dx) / 40);
        if (right <= left) continue;
        const top = (y * dy) / 40,
          bottom = Math.min(grid.length, ((y + 1) * dy) / 40);
        assert.equal(
          reader.sampleAtLevel((top + bottom) / 2, (left + right) / 2, k),
          oracle(data, grid, k, x, y),
          `level ${k}, ${x},${y}`,
        );
      }
  }
  assert.equal(product.metrics.encodedBytes, compiled.payload.length);
  assert.equal(
    product.metrics.residentBytes,
    compiled.payload.length + product.metrics.metadataBytes + product.metrics.colorLookupBytes,
  );
  assert.equal(
    groundByteLength(compiled.manifest.grids, compiled.manifest.uniqueTiles, compiled.manifest.kMax),
    compiled.payload.length,
  );
  for (let k = 0; k <= compiled.manifest.kMax; k++)
    for (const origin of [-0.37, 0, 0.41]) {
      const pixels = new Uint32Array(37).fill(123),
        expected = pixels.slice();
      let l = -1.7;
      const s = data.partition.length - 0.001,
        step = 0.173;
      for (let i = 2; i < 35; i++, l += step) {
        const sourceL = l + origin;
        const color =
          sourceL < reader.domain.left
            ? null
            : sourceL >= reader.domain.right
              ? 777
              : reader.sampleAtLevel(s, sourceL, k);
        if (color !== null) expected[i] = color;
      }
      reader.sampleSpan(pixels, 2, 33, s, -1.7, step, k, origin, null, 777);
      assert.deepEqual(
        pixels,
        expected,
        'affine batch preserves scalar addition order, finite edges and transparent outside',
      );
    }
  const saved = reader.sampleAtLevel(0.1, 0.1, 0);
  compiled.payload.fill(0);
  assert.equal(reader.sampleAtLevel(0.1, 0.1, 0), saved, 'reader owns immutable bytes');
});

test('whole records deduplicate across Sections and retain directly integrated coarse colors', async () => {
  const data = source(1.6),
    one = await compileResidentGround([data], 'shared'),
    two = await compileResidentGround([data, data], 'shared');
  assert.equal(two.manifest.uniqueTiles, one.manifest.uniqueTiles);
  const product = await readResidentGround(two.manifest, two.payload, 'shared', two.manifest.grids);
  assert.equal(product.readers.length, 2);
  for (let k = 0; k <= two.manifest.kMax; k++)
    assert.equal(product.readers[0].sampleAtLevel(0.7, 0.3, k), product.readers[1].sampleAtLevel(0.7, 0.3, k));
});

test('selector coarsens at exact chainage thresholds and preserves the full collapsed footprint', () => {
  let threshold = 0.2;
  for (let k = 0; k < 8; k++, threshold *= 4) {
    assert.equal(selectGroundLevel(threshold * (1 - Number.EPSILON), 8), k);
    assert.equal(selectGroundLevel(threshold, 8), k + 1);
    assert.equal(selectGroundLevel(threshold * (1 + Number.EPSILON), 8), k + 1);
  }
  assert.equal(selectGroundLevel(1e9, 8), 8);
  assert.throws(() => selectGroundLevel(NaN, 8), RangeError);
});

test('admission rejects stale, incomplete, corrupt and oversized ground before publishing readers', async () => {
  const compiled = await compileResidentGround([source()], 'ready'),
    m = compiled.manifest,
    p = compiled.payload;
  const read = (manifest, payload = p) => readResidentGround(manifest, payload, 'ready', m.grids);
  await assert.rejects(read({ ...m, identity: 'stale' }), /identity/);
  await assert.rejects(read(m, p.slice(1)), /length/);
  const corrupt = p.slice();
  corrupt[0] ^= 1;
  await assert.rejects(read(m, corrupt), /SHA-256/);
  const invalid = p.slice();
  new DataView(invalid.buffer).setUint32(m.uniqueTiles * 1168 * 2, m.uniqueTiles, true);
  await assert.rejects(read({ ...m, sha256: await contentDigest(invalid) }, invalid), /reference/);
  await assert.rejects(
    read({
      ...m,
      uniqueTiles: Math.ceil(GROUND_LIMITS.residentBytes / 2336) + 1,
      byteLength: groundByteLength(m.grids, Math.ceil(GROUND_LIMITS.residentBytes / 2336) + 1, m.kMax),
    }),
    (e) => e.diagnostic.code === 'capacity',
  );
});

test('equal L0 with different directly filtered lower levels remains two dictionary records', async () => {
  const length = 1.6;
  const boundary = (l) => ({
    knots: [
      { anchor: { s: 0 }, l },
      { anchor: { s: length }, l },
    ],
  });
  const band = (left, right) => ({ start: { s: 0 }, end: { s: length }, left: boundary(left), right: boundary(right) });
  const a = band(-1.6, 0),
    b = band(0, 1.6);
  const paint = (indices) => ({
    phaseS: 0,
    phaseL: 0,
    alternate: null,
    asset: { source: { width: 2, height: 4, levels: [{ paletteRgb555: [0, 1], indices }] } },
  });
  const data = {
    partition: { length, bands: [a, b] },
    left: 1.6,
    right: 1.6,
    baseRgb555: 0,
    stamps: [],
    bands: [
      { band: a, sections: [{ anchor: { s: 0 }, paint: paint([1, 2, 2, 2, 1, 2, 2, 2]) }] },
      { band: b, sections: [{ anchor: { s: 0 }, paint: paint([1, 2, 1, 2, 1, 2, 1, 1]) }] },
    ],
  };
  const { manifest, payload } = await compileResidentGround([data], 'lower-levels');
  assert.equal(manifest.uniqueTiles, 2);
  const bytes = new DataView(payload.buffer);
  const first = Array.from({ length: 1168 }, (_, i) => bytes.getUint16(i * 2, true));
  const second = Array.from({ length: 1168 }, (_, i) => bytes.getUint16((1168 + i) * 2, true));
  assert.deepEqual(first.slice(0, 1024), second.slice(0, 1024));
  assert.notDeepEqual(first.slice(1024), second.slice(1024));
});
