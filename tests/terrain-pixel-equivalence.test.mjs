import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
const build = fileURLToPath(new URL('../dist', import.meta.url));
const load = (p) => import(pathToFileURL(`${build}/${p}.js`).href);
const { createM2StadiumGuide } = await load('dev/debug-course');
const { createM3DebugHeightProfile } = await load('dev/m3-debug-height-profile');
const { createM3DebugVisualProfile } = await load('dev/m3-debug-visual');
const { guidePathToWorld } = await load('core/guide-curve');
const { createFarBackground } = await load('visual/far-background');
const { createSpriteAssets } = await load('visual/sprite-assets');
const { renderDriving } = await load('render/renderer');
const { SoftwareSurface } = await load('graphics/software-surface');
const guide = createM2StadiumGuide(),
  height = createM3DebugHeightProfile(guide.length),
  visual = createM3DebugVisualProfile(guide.length);
const background = createFarBackground(),
  assets = createSpriteAssets();
const ground = {
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  shoulderWidth: 1,
  roadMarkings: [{ centerL: 0, width: 0.14, pattern: 'DASHED', dashLength: 7, gapLength: 5 }],
};
const terrain = { ...ground, screenHeight: 240, dMin: 2.5, dMax: 150, height, visual };
const samples = [];
for (const s of [25, 45, 80, 105, 120, 155, 230, 275, 350, 440, 500, 520, 610, 650])
  for (const pitch of [0, (8 * Math.PI) / 180]) {
    const p = guidePathToWorld(guide, s, 0),
      c = guidePathToWorld(guide, s - 20, 0);
    const vehicle = {
      x: p.x,
      y: height.samplePhysics(s),
      z: p.z,
      yaw: p.heading,
      lateralAcceleration: 0,
      course: { s, l: 0, segmentIndex: p.segmentIndex, distanceSquared: 0 },
    };
    const camera = {
      x: c.x,
      y: height.samplePhysics(s - 20) + 2,
      z: c.z,
      s: s - 20,
      l: 0,
      yaw: p.heading,
      pitch,
      focalLength: 200,
      centerX: 160,
      centerY: 120,
    };
    const surface = new SoftwareSurface(320, 240);
    renderDriving(
      surface,
      {
        background,
        guide,
        camera,
        vehicle,
        terrainProfile: terrain,
        groundProfile: ground,
        worldSprites: [],
        assets,
        playerKind: 'car',
      },
      {},
    );
    samples.push({
      s,
      pitch,
      sha256: createHash('sha256').update(new Uint8Array(surface.pixels.buffer)).digest('hex'),
    });
  }
test('terrain interval traversal preserves the complete pre-change framebuffer across hills, cliffs and curves', async () => {
  // Captured before the boundary traversal change from the inspected 979282e release.
  const reference = JSON.parse(await readFile(new URL('./fixtures/terrain-pixels.json', import.meta.url), 'utf8'));
  assert.deepEqual(samples, reference);
});

test('distinct authored sub-epsilon visual intervals survive terrain traversal without a cursor nudge', async () => {
  const { compileRasterPath } = await load('core/raster-path');
  const { compileGuidePath } = await load('core/guide-curve');
  const { HeightProfile } = await load('core/height-profile');
  const { VisualProfile } = await load('visual/visual-profile');
  const { generateTerrainLines } = await load('road/terrain-line');
  const path = compileGuidePath(
    compileRasterPath([
      { x: 0, z: 0 },
      { x: 0, z: 200 },
    ]),
    { lMax: 13, mMin: 0.25, dCam: 5 },
  );
  const start = 30,
    end = start + 2e-9;
  const base = { groundBaseLeft: { kind: 'transparent' }, groundBaseRight: { kind: 'transparent' } };
  const visual = new VisualProfile(path.length, [
    { ...base, sStart: 0, name: 'before' },
    { ...base, sStart: start, name: 'sliver' },
    { ...base, sStart: end, name: 'after' },
  ]);
  const height = new HeightProfile(path.length, [
    { s: 0, y: 0 },
    { s: path.length, y: 0 },
  ]);
  const camera = { x: 0, y: 2, z: 0, s: 0, l: 0, yaw: 0, pitch: 0, focalLength: 200, centerX: 160, centerY: 120 };
  const lines = generateTerrainLines(path, camera, { ...terrain, height, visual });
  const sliver = lines.find((line) => line.sectionName === 'sliver');
  assert.ok(sliver, 'a positive authored interval must not be silently skipped');
  assert.equal(sliver.sourceFootprint.deltaSCollapse, end - start);
});
