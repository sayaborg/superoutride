import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { compileCoursePresentationDomains } from '../../dist/compiler/course-presentation-overlap.js';
import { compileCoursePhysicalDomains } from '../../dist/compiler/course-physical-overlap.js';
import { coursePortLateral } from '../../dist/compiler/course-links.js';
import { coursePresentationDemand } from '../../dist/runtime/course-presentation-demand.js';
import { createCourseGroundSource } from '../../dist/groundmap/course-ground-source.js';
import { guidePathToWorld } from '../../dist/core/guide-curve.js';
import { transformPlanarPoint } from '../../dist/core/planar-transform.js';
import { wrapAngle } from '../../dist/core/math.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { readSpriteLodAsset } from '../../dist/graphics/sprite.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { VisualProfile } from '../../dist/visual/visual-profile.js';
import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';
import { renderDriving } from '../../dist/render/renderer.js';
import {
  compileCourseSprite,
  createCourseSpriteObservation,
  reframeCourseSpriteObservation,
} from '../../dist/render/course-sprite.js';
import { cameraForkDocument } from '../helpers/course-common-presentation.mjs';
import { cameraProfile } from '../helpers/course-driving-probe.mjs';
import { savedImageInput } from '../helpers/course-image-input.mjs';

const ok = (r) => {
  assert.equal(r.ok, true, r.ok ? undefined : JSON.stringify(r));
  return r.value;
};
const cameraInputs = () => ({
  pose: { behind: 2, ahead: 2, left: 1, right: 1 },
  step: { behind: 1, ahead: 1, left: 0.1, right: 0.1 },
  camera: { dCam: cameraProfile.dCam, focalLength: cameraProfile.focalLength, centerX: cameraProfile.centerX },
  render: { width: 320, dMin: 2.5, dMax: 200 },
  maxYawFromPort: (7 * Math.PI) / 180,
  filter: { chainageRadius: 1, lateralRadius: 0.025 },
});
const demand = (c, v = cameraInputs()) =>
  coursePresentationDemand(
    v.pose,
    v.step,
    v.camera,
    v.render,
    v.maxYawFromPort,
    v.filter,
    c.sections.map((s) => s.presentation),
  );
async function fixture() {
  const f = await cameraForkDocument();
  const sky = savedImageInput('sky', {
    ...f.images[2].source,
    levels: [{ paletteRgb555: [0x001f, 0x7c00], indices: [1, 1, 2, 2, 2, 1, 1, 2] }],
  });
  f.document.assets[2] = sky.reference;
  f.inputs[2] = sky.input;
  return f;
}

/** Ordinary renderer composition from real saved sources; no occurrence/graph is passed to the renderer. */
function scene(port, deltaS, deltaL, yaw, pixels, assets, bounds, observed, from, link) {
  const section = port.section,
    p = section.presentation;
  const s = port.anchor.s + deltaS,
    l = coursePortLateral(port) + deltaL;
  const point = guidePathToWorld(section.guide, s, l);
  let vehicle = {
    ...point,
    y: 1,
    yaw: point.heading + yaw,
    course: { s, l, segmentIndex: point.segmentIndex },
    longitudinalSpeed: 20,
    lateralSpeed: 0,
    sprungPitch: 0,
    presentationY: 1,
  };
  let camera = updateCamera(
    createCameraRig(),
    { guide: section.guide, height: section.height },
    vehicle,
    cameraProfile,
    1 / 60,
  );
  if (from) {
    const transform = link.destinationFromSource,
      turn = Math.atan2(transform.sine, transform.cosine);
    vehicle = {
      ...from.vehicle,
      ...transformPlanarPoint(transform, from.vehicle),
      yaw: wrapAngle(from.vehicle.yaw + turn),
      course: { ...from.vehicle.course, s, l },
    };
    camera = {
      ...from.camera,
      ...transformPlanarPoint(transform, from.camera),
      yaw: wrapAngle(from.camera.yaw + turn),
      s: link.destination.anchor.s + (from.camera.s - link.source.anchor.s),
    };
  }
  const base = (color) => (color === null ? { kind: 'transparent' } : { kind: 'color', color: rgb555ToRgba(color) });
  const visual = new VisualProfile(
    section.raster.length,
    p.environments.map((e) => ({
      sStart: e.anchor.s,
      name: e.name,
      groundBaseLeft: base(e.groundBaseLeft),
      groundBaseRight: base(e.groundBaseRight),
    })),
  );
  const environment = p.environments[0],
    backgroundImage = readSpriteLodAsset(environment.background.asset.source);
  const surface = new SoftwareSurface(backgroundImage.width, backgroundImage.height);
  surface.pixels.set(backgroundImage.levels[0].pixels);
  const background = {
    surface,
    sourceHorizonY: environment.background.horizonY,
    pixelsPerRadian: environment.background.pixelsPerRadian,
    yawOriginRadians: environment.background.yawOriginRadians,
  };
  const worldSprites = from
    ? []
    : p.scenery.map((placement) =>
        compileCourseSprite({ length: section.raster.length, raster: section.raster }, section.height, {
          name: placement.instance.id,
          s: placement.anchor.s,
          l: placement.l,
          groundOffset: placement.groundOffset,
          asset: readSpriteLodAsset(placement.instance.asset.source),
        }),
      );
  const observation = from
    ? reframeCourseSpriteObservation(
        from.observation,
        link.destinationFromSource,
        link.source.anchor.s,
        link.destination.anchor.s,
      )
    : createCourseSpriteObservation(worldSprites, camera, 2.5, 200);
  const source = createCourseGroundSource(p.ground);
  const result = renderDriving(
    pixels,
    {
      background,
      guide: { length: section.raster.length, raster: section.raster },
      camera,
      vehicle,
      terrainProfile: {
        screenHeight: 240,
        dMin: 2.5,
        dMax: 200,
        groundLeft: p.ground.left,
        groundRight: p.ground.right,
        roadLeft: 4,
        roadRight: 4,
        height: section.height,
        visual,
      },
      groundProfile: { groundLeft: p.ground.left, groundRight: p.ground.right },
      worldSprites: observation,
      assets,
      playerKind: 'car',
    },
    {
      ground: {
        kind: 'source',
        kMax: 0,
        selectLevel: () => 0,
        sampleAtLevel(s, l) {
          const ds = s - port.anchor.s,
            dl = l - coursePortLateral(port);
          assert.ok(
            ds >= -bounds.behind && ds <= bounds.ahead && dl >= -bounds.left && dl <= bounds.right,
            `renderer query delta=${ds},l=${dl} outside admitted envelope`,
          );
          observed.queries += 1;
          observed.maxL = Math.max(observed.maxL, Math.abs(dl));
          const color = rgb555ToRgba(source.sample(s, l));
          return color;
        },
      },
    },
  );
  return { ...result, vehicle, camera, observation };
}

test('derived camera/filter/scenery envelopes qualify every large static fork/merge incoming and contain actual renderer queries', async () => {
  const f = await fixture(),
    c = ok(await compileCourseDocument(f.document, f.inputs));
  const d = demand(c),
    q = ok(compileCoursePresentationDomains(c.links, d));
  assert.ok(q.demand.bounds.left > 180 && q.demand.bounds.left < 200);
  assert.equal(q.demand.bounds.ahead, 199);
  const physical = {
    pose: d.pose,
    step: d.step,
    consumers: {
      contact: { behind: 10, ahead: 10, left: 1, right: 1 },
      driverLookahead: { behind: 0, ahead: 400, left: 0, right: 0 },
      reverseRecovery: { behind: 20, ahead: 20, left: 1, right: 1 },
    },
  };
  ok(compileCoursePhysicalDomains(c.links, physical));
  const assets = createSpriteAssets(),
    pixels = [new SoftwareSurface(320, 240), new SoftwareSurface(320, 240)];
  const observed = { queries: 0, maxL: 0 };
  for (const link of c.links)
    for (const ds of [-2, 0, 2])
      for (const yaw of [-7, 0, 7]) {
        const results = [];
        for (const [i, port] of [link.source, link.destination].entries())
          results.push(
            scene(
              port,
              ds,
              0.0625,
              (yaw * Math.PI) / 180,
              pixels[i],
              assets,
              q.demand.bounds,
              observed,
              results[0],
              link,
            ),
          );
        assert.ok(results[0].terrainOutputPixels > 1000);
        const differences = [];
        pixels[0].pixels.forEach((color, i) => {
          if (color !== pixels[1].pixels[i])
            differences.push({ x: i % 320, y: Math.floor(i / 320), source: color, destination: pixels[1].pixels[i] });
        });
        assert.equal(
          differences.length,
          0,
          `${link.id} same-pose frame ds=${ds}, yaw=${yaw}: ${JSON.stringify(differences.slice(0, 20))}`,
        );
      }
  assert.ok(observed.queries > 100000);
  assert.ok(observed.maxL > 100, 'real renderer footprint is much wider than the physical corridor');
});

test('yaw, filter and full billboard anchor extent expand coverage; malformed envelopes cannot silently shrink', async () => {
  const f = await fixture(),
    c = ok(await compileCourseDocument(f.document, f.inputs));
  const v = cameraInputs(),
    narrow = demand(c, v);
  v.maxYawFromPort = (20 * Math.PI) / 180;
  assert.ok(demand(c, v).consumers.cameraRender.left > narrow.consumers.cameraRender.left);
  v.filter.lateralRadius = 250;
  const wide = demand(c, v);
  const failed = compileCoursePresentationDomains(c.links, wide);
  assert.equal(failed.ok, false);
  assert.ok(failed.diagnostics.some((i) => i.code === 'presentation_ground_mismatch'));
  const image = savedImageInput('tree', { ...f.images[1].source, anchorX: -40000 });
  f.document.assets[1] = image.reference;
  f.inputs[1] = image.input;
  const big = ok(await compileCourseDocument(f.document, f.inputs));
  assert.ok(demand(big).consumers.scenery.left > 1000);
  assert.equal(compileCoursePresentationDomains(big.links, demand(big)).ok, false);
  for (const yaw of [-1, Math.PI / 2, NaN]) {
    const input = cameraInputs();
    input.maxYawFromPort = yaw;
    assert.throws(() => demand(c, input), RangeError);
  }
});

test('file-backed CLI derives camera demand from explicit profiles and checks all incoming Links', async () => {
  const f = await fixture(),
    directory = await mkdtemp(path.join(tmpdir(), 'superoutride-camera-domain-'));
  try {
    const document = path.join(directory, 'course.json'),
      camera = path.join(directory, 'camera.json');
    await writeFile(document, JSON.stringify(f.document));
    await writeFile(camera, JSON.stringify(cameraInputs()));
    for (const input of f.inputs) await writeFile(path.join(directory, `${input.sha256}.json`), input.bytes);
    const run = spawnSync(
      process.execPath,
      ['tools/course/compile-course.mjs', document, '--images', directory, '--presentation-camera', camera],
      { encoding: 'utf8' },
    );
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.scope, 'presentation-query-domain');
    assert.equal(report.links.length, 6);
    assert.equal(report.demand.bounds.ahead, 199);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
