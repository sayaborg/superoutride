import assert from 'node:assert/strict';
import test from 'node:test';
import { createGroundMapLevelEncoder } from '../../dist/groundmap/ground-map-encoding.js';
import { BakedGroundMapAsset } from '../../dist/groundmap/baked-ground-map.js';
import { rgbaToRgb555, rgb555ToRgba } from '../../dist/graphics/rgb555.js';

for (const count of [1, 15, 16, 256, 257]) {
  test(`GroundMap ${count}-color encoding round-trips through the runtime reader`, () => {
    const pixels = Uint32Array.from({ length: count }, (_, i) => rgb555ToRgba(i));
    const encoder = createGroundMapLevelEncoder({ lateralTexels: count, chainageTexels: 1, pixels }, true);
    assert.equal(encoder.format, count <= 256 ? 'palette8' : 'rgb555le');
    const bytes = encoder.encodeRows(0, 1);
    assert.equal(bytes.length, count * (count <= 256 ? 1 : 2));
    const metadata = {
      version: 1,
      courseLength: 1,
      groundLeft: count / 2,
      groundRight: count / 2,
      qLAuthority: 1,
      qSAuthority: 1,
      actualBaseQL: 1,
      actualBaseQS: 1,
      kMax: 0,
      chunkTargetMeters: 1,
      paletteRgba: encoder.paletteRgba,
      levels: [
        {
          level: 0,
          lateralTexels: count,
          chainageTexels: 1,
          qLActual: 1,
          qSActual: 1,
          format: encoder.format,
          chunks: [{ rowStart: 0, rowCount: 1, payloadId: 0 }],
        },
      ],
      payloads: [
        {
          format: encoder.format,
          lateralTexels: count,
          rowCount: 1,
          offsetBytes: 0,
          byteLength: bytes.length,
          sha256: '0'.repeat(64),
        },
      ],
      binaryBytes: bytes.length,
      uncompressedRgbaBytes: pixels.byteLength,
    };
    const asset = new BakedGroundMapAsset(metadata, bytes);
    for (let column = 0; column < count; column++) {
      const { s, l } = asset.texelCenter(0, 0, column);
      assert.equal(asset.sampleAtLevel(s, l, 0), pixels[column]);
    }
    assert.deepEqual(encoder.encodeRows(0, 1), bytes);
  });
}

test('prefiltered levels always use RGB555 and its defined rounding', () => {
  const pixels = Uint32Array.of(0xff345678, 0xffabcdef);
  const encoder = createGroundMapLevelEncoder({ lateralTexels: 2, chainageTexels: 1, pixels }, false);
  assert.equal(encoder.format, 'rgb555le');
  assert.deepEqual(encoder.paletteRgba, []);
  const bytes = encoder.encodeRows(0, 1);
  for (let i = 0; i < pixels.length; i++) assert.equal(bytes[i * 2] | (bytes[i * 2 + 1] << 8), rgbaToRgb555(pixels[i]));
});
