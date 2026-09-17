import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { GroundMapHttpSession } from '../../dist/browser/ground-map-http.js';
import { GroundPresentation, PRODUCT_GROUND_LIMITS } from '../../dist/browser/ground-presentation.js';
import { createFrameLoop } from '../../dist/browser/frame-loop.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';
import { createFarBackground } from '../../dist/visual/far-background.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { guideCoordinateCurve, guideCoordinateToWorld } from '../../dist/core/guide-coordinate-frame.js';
import { collectDrivingGroundSamples, renderDriving } from '../../dist/render/renderer.js';
import { createGroundMapCompileSource } from '../../dist/groundmap/ground-map-compile-source.js';
import { productGroundSources } from './product-ground-sources.mjs';

/** Real product files, gzip decoder, bounded resident store, presentation lifecycle and renderer. */
export async function verifyProductGround(directory, entries = productGroundSources()) {
  const sha = '1'.repeat(40);
  const prefix = `/build/${sha}/ground-pages/`;
  let requests = 0,
    transferredBytes = 0;
  const server = createServer(async (request, response) => {
    const file = request.url?.slice(prefix.length);
    if (!request.url?.startsWith(prefix) || !/^(catalog\.json|[0-9a-f]{64}\.(json|bin\.gz))$/.test(file)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const bytes = await readFile(join(directory, file));
      requests++;
      transferredBytes += bytes.length;
      response.writeHead(200, {
        'Content-Length': bytes.length,
        'Content-Type': file.endsWith('.gz') ? 'application/gzip' : 'application/json',
      });
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const session = new GroundMapHttpSession({
    ...PRODUCT_GROUND_LIMITS,
    buildRoot: `http://127.0.0.1:${server.address().port}/build/${sha}/`,
    buildSha: sha,
    payloadEncoding: 'gzip',
  });
  const assets = createSpriteAssets(),
    background = createFarBackground();
  let finish, fail;
  const ground = new GroundPresentation(
    createFrameLoop(
      () => {},
      () => {},
      { now: () => 0, request: () => 1, cancel: () => {} },
    ),
    () => {},
    (state, error) => {
      if (state === 'ready') finish?.();
      if (state === 'failed') fail?.(error);
    },
    session,
  );
  const frames = [];
  let peakResidentBytes = 0,
    peakPinnedBytes = 0;
  try {
    const catalog = await session.catalog();
    assert.deepEqual(Object.keys(catalog).sort(), entries.map((e) => e.id).sort());
    for (const entry of entries) {
      const asset = await session.open(catalog[entry.id]);
      assert.equal(asset.manifest.identity.sourceId, entry.id);
      const source = createGroundMapCompileSource(entry.length, entry.profile, entry.view);
      const level = asset.manifest.layout.levels[0];
      const rows = [0, Math.floor(level.chainageTexels / 2), level.chainageTexels - 1];
      const lease = await session.acquire(
        asset,
        rows.map((rowStart) => ({ level: 0, rowStart, rowCount: 1 })),
      );
      try {
        for (const row of rows)
          for (const column of [0, Math.floor(level.lateralTexels / 2), level.lateralTexels - 1]) {
            const { s, l } = lease.reader.texelCenter(0, row, column);
            assert.equal(
              lease.reader.sampleAtLevel(s, l, 0),
              source.sample(s, l),
              `${entry.id}: independently evaluated L0 color`,
            );
          }
      } finally {
        lease.release();
      }
      for (const s of entry.frame.positions ?? [45, entry.length / 2, entry.length - 5]) {
        const runtime = entry.frame;
        const point = guideCoordinateToWorld(runtime.coordinateFrame, s, 0);
        const vehicle = {
          x: point.x,
          y: runtime.heightProfile.sampleCamera(s),
          z: point.z,
          yaw: point.heading,
          longitudinalSpeed: 0,
          lateralSpeed: 0,
          lateralAcceleration: 0,
          course: { s, l: 0, segmentIndex: point.segmentIndex, distanceSquared: 0 },
        };
        const scene = {
          background,
          assets,
          vehicle,
          playerKind: 'car',
          worldSprites: [],
          guide: guideCoordinateCurve(runtime.coordinateFrame),
          camera: updateCamera(
            createCameraRig(),
            { guide: runtime.coordinateFrame, height: runtime.heightProfile },
            vehicle,
            CURRENT_CAMERA_PROFILE,
            1 / 60,
          ),
          terrainProfile: runtime.terrainProfile,
          groundProfile: entry.profile,
        };
        const roadView = entry.view ?? undefined;
        const target = new SoftwareSurface(320, 240);
        const done = new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        });
        ground.draw(
          { sourceId: entry.id, samples: collectDrivingGroundSamples(scene, roadView), sourceS: runtime.sourceS },
          (reader) => {
            const stats = renderDriving(target, scene, { roadView, ground: reader });
            assert.equal(stats.groundMapBaked, true);
            assert.ok(stats.terrainOutputPixels > 0);
          },
        );
        await done;
        peakResidentBytes = Math.max(peakResidentBytes, session.accounting.residentBytes);
        peakPinnedBytes = Math.max(peakPinnedBytes, session.accounting.pinnedBytes);
        frames.push({
          id: entry.id,
          s,
          sha256: createHash('sha256').update(new Uint8Array(target.pixels.buffer)).digest('hex'),
        });
      }
    }
    console.log(
      JSON.stringify({
        productHttp: { frames: frames.length, requests, transferredBytes, peakResidentBytes, peakPinnedBytes },
      }),
    );
    assert.deepEqual(
      frames,
      JSON.parse(await readFile(new URL('../../tests/fixtures/product-ground-pixels.json', import.meta.url), 'utf8')),
      'explicit baked-product pixel contract',
    );
    return frames;
  } finally {
    ground.dispose();
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}
