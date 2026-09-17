import { mkdir, mkdtemp, rm, writeFile, readdir, stat, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { productGroundSources } from './product-ground-sources.mjs';
import { verifyProductGround } from './verify-product-ground.mjs';
import { createGroundMapCompileSource } from '../../dist/groundmap/ground-map-compile-source.js';
import { deriveGroundMapDensity } from '../../dist/groundmap/ground-map-lod.js';
import { deriveGroundMapTargetEnvelope } from '../../dist/groundmap/ground-map-target-envelope.js';
import {
  CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  CURRENT_CAMERA_HEIGHT_METERS,
} from '../../dist/camera/current-camera-profile.js';
import {
  CURRENT_CAMERA_DISTANCE_METERS,
  CURRENT_FOCAL_LENGTH_PIXELS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
} from '../../dist/core/presentation-scale.js';
import { compileGroundMapFiles } from './ground-map-files.mjs';
import { publishGroundMapPages } from './ground-map-pages.mjs';

// The shipped content catalog is built from the same concrete course authoring as the roots.
const entries = productGroundSources();
const density = deriveGroundMapDensity({
  d0: CURRENT_CAMERA_DISTANCE_METERS,
  focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
  cameraHeight: CURRENT_CAMERA_HEIGHT_METERS,
  pitchRadians: CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
});
const { kMax } = deriveGroundMapTargetEnvelope({
  dMin: CURRENT_RENDER_NEAR_DEPTH_METERS,
  dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
  qS: density.qS,
  thinSpanScreenRows: 1,
});
const output = resolve(process.argv[2] ?? 'dist/ground-pages');
await mkdir(resolve(output, '..'), { recursive: true });
const staging = await mkdtemp(output + '-');
const scratch = await mkdtemp(join(tmpdir(), 'outride-product-ground-'));
const catalog = { kind: 'ground-map-catalog', version: 1, encoding: 'gzip', bindings: {} };
try {
  for (const entry of entries) {
    const started = performance.now();
    const path = join(scratch, 'source.bin');
    const metadata = await compileGroundMapFiles(
      path,
      createGroundMapCompileSource(entry.length, entry.profile, entry.view),
      density,
      kMax,
    );
    const identity = {
      sourceId: entry.id,
      compilerId: 'point-source-2x4-rgba-round-v1',
      targetId: 'current-camera-v1',
      inputSha256: createHash('sha256')
        .update(
          JSON.stringify({
            id: entry.id,
            length: entry.length,
            profile: entry.profile,
            view: entry.view,
            density,
            kMax,
          }),
        )
        .digest('hex'),
    };
    catalog.bindings[entry.id] = await publishGroundMapPages(staging, path, metadata, identity, { gzip: true });
    console.log(
      JSON.stringify({
        source: entry.id,
        seconds: (performance.now() - started) / 1000,
        binaryBytes: metadata.binaryBytes,
        maxPayloadBytes: Math.max(...metadata.payloads.map((p) => p.byteLength)),
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
      }),
    );
    await rm(path);
  }
  await writeFile(join(staging, 'catalog.json'), JSON.stringify(catalog));
  await verifyProductGround(staging, entries);
  let bytes = 0;
  const files = await readdir(staging);
  for (const file of files) bytes += (await stat(join(staging, file))).size;
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  console.log(JSON.stringify({ productGround: output, sources: entries.length, files: files.length, bytes }));
} finally {
  await rm(staging, { recursive: true, force: true });
  await rm(scratch, { recursive: true, force: true });
}
