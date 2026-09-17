import assert from 'node:assert/strict';
import { createBranchingGroundAuthoring } from '../../dist/dev/courses/branching-ground-authoring.js';
import { guideCoordinateCurve, guideCoordinateToWorld } from '../../dist/core/guide-coordinate-frame.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';
import { createFarBackground } from '../../dist/visual/far-background.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { BakedGroundMapAsset } from '../../dist/groundmap/baked-ground-map.js';
import { collectDrivingGroundSamples, renderDriving } from '../../dist/render/renderer.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { GroundMapHttpSession } from '../../dist/browser/ground-map-http.js';
import { ReadyFrameController } from '../../dist/browser/ready-frame.js';
import { createFrameLoop } from '../../dist/browser/frame-loop.js';

/** A real loopback HTTP delivery check; this is not evidence of Pages headers or device performance. */
export async function verifyGroundMapHttp(directory, bindings) {
  const sha = '1'.repeat(40); // Deliberately synthetic immutable-build fixture.
  const prefix = `/build/${sha}/ground-pages/`;
  const server = createServer(async (request, response) => {
    const path = request.url ?? '';
    if (!path.startsWith(prefix) || !/^[0-9a-f]{64}\.(json|bin)$/.test(path.slice(prefix.length))) {
      response.writeHead(404).end();
      return;
    }
    try {
      const bytes = await readFile(join(directory, path.slice(prefix.length)));
      const compressed = gzipSync(bytes);
      response.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': compressed.length });
      response.end(compressed);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const session = new GroundMapHttpSession({
    buildRoot: `http://127.0.0.1:${server.address().port}/build/${sha}/`,
    buildSha: sha,
    maxManifestBytes: 1024 * 1024,
    requestTimeoutMs: 10000,
    maxResidentBytes: 1024 * 1024,
    maxLoadingBytes: 1024 * 1024,
  });
  const loop = createFrameLoop(
    () => {},
    () => {},
    { now: () => 0, request: () => 1, cancel: () => {} },
  );
  let prepared;
  const controller = new ReadyFrameController(
    loop,
    (frame) => {
      prepared = frame;
    },
    () => {},
  );
  try {
    const assets = createSpriteAssets();
    const background = createFarBackground();
    for (const { id, runtime } of createBranchingGroundAuthoring().stages) {
      const asset = await session.open(bindings[id]);
      const metadata = JSON.parse(await readFile(join(directory, '..', `${id}-ground-map.json`), 'utf8'));
      const reference = new BakedGroundMapAsset(
        metadata,
        await readFile(join(directory, '..', `${id}-ground-map.bin`)),
      );
      // Actual authored parent, child, successor and later-fork geometry, including both domain ends.
      for (const s of [5, runtime.heightProfile.courseLength / 2, runtime.heightProfile.courseLength - 5]) {
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
          groundProfile: runtime.groundProfile,
        };
        const roadView = runtime.roadView ?? undefined;
        const samples = collectDrivingGroundSamples(scene, roadView);
        assert.ok(samples.length > 0, `${id}: visible terrain`);
        const success = await controller.replace((signal) => session.acquire(asset, asset.rowDemand(samples), signal));
        if (!success) throw controller.error;
        const actual = new SoftwareSurface(320, 240);
        const expected = new SoftwareSurface(320, 240);
        const observed = renderDriving(actual, scene, { roadView, ground: prepared.reader });
        renderDriving(expected, scene, { roadView, ground: reference });
        assert.equal(observed.groundMapBaked, true);
        assert.deepEqual(actual.pixels, expected.pixels, `${id} at ${s}: HTTP pages preserve complete framebuffer`);
        // Final stage-local bytes own color. Drawing must never consult procedural paint again.
        const poisonedScene = {
          ...scene,
          groundProfile: new Proxy(scene.groundProfile, {
            get(target, key) {
              if (key === 'groundLeft' || key === 'groundRight') return target[key];
              throw new Error('procedural ground read');
            },
          }),
        };
        renderDriving(actual, poisonedScene, { roadView, ground: prepared.reader });
        assert.deepEqual(actual.pixels, expected.pixels);
      }
    }
  } finally {
    controller.dispose();
    session.dispose();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
}
