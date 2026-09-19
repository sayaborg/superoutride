import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { createCameraRig, resetCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { createCourseGeometryTraversal } from '../../dist/runtime/course-occurrence.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { createCourseSectionDrivingSource } from '../../dist/runtime/course-section-driving-view.js';
import { courseSectionDrivingDemand } from '../../dist/runtime/course-driving-demand.js';
import { createBandSurfaceReader } from '../../dist/physics/band-surface-reader.js';
import { createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import {
  advanceVehicleWithRecovery,
  createRecoveryState,
  recoverVehicle,
  RECOVERY_PROFILE,
} from '../../dist/gameplay/recovery.js';
import { sampleRivalDrivingInput } from '../../dist/gameplay/rival-driver.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { GROUND_COLORS } from '../../dist/groundmap/ground-map.js';
import { VisualProfile } from '../../dist/visual/visual-profile.js';
import { createFarBackground } from '../../dist/visual/far-background.js';
import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';
import { renderSourceGround } from '../../dist/dev/diagnostics/source-ground-render.js';
import { CENTER_DASH_MARKINGS } from '../../dist/dev/courses/road-markings.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';

export const ok = (result) => {
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result));
  return result.value;
};
export const cameraProfile = Object.freeze({
  dCam: 5,
  height: 2.469902425419539,
  baseDownPitch: (12 * Math.PI) / 180,
  focalLength: 200,
  centerX: 160,
  centerY: 120,
  directionSpeedMin: 0.25,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
});

/** Explicit diagnostic course/presentation, not authored-image admission or product art acceptance. */
export async function courseDrivingFixture(turn = 30) {
  const document = JSON.parse(await readFile(new URL('../fixtures/linear.course.json', import.meta.url), 'utf8'));
  const source = document.sections[0];
  source.start.heading = 27;
  source.primitives[0].length = 1200;
  source.primitives[1].radius = 300;
  source.primitives[1].turn = turn;
  source.primitives[2].length = 2200;
  source.height.splice(
    1,
    0,
    { anchor: { kind: 'primitive', primitiveId: 'approach', fraction: 0.5 }, y: 4 },
    { anchor: { kind: 'primitive', primitiveId: 'approach', fraction: 1 }, y: 0 },
    { anchor: { kind: 'primitive', primitiveId: 'bend', fraction: 1 }, y: 2 },
  );
  return ok(await compileCourseDocument(document));
}

export function drivingWindow(course, pose, lastSafeS = pose.minS) {
  const traversal = createCourseGeometryTraversal(course.entry, { retainBehind: 0, selectAhead: 0, maxOccurrences: 2 });
  const demand = courseSectionDrivingDemand(
    course.entry.guide,
    pose,
    cameraProfile,
    { dMax: 200 },
    { ...RECOVERY_PROFILE, lastSafeS },
  );
  const view = ok(createCourseGeometryView(traversal.snapshot(), demand));
  return { demand, view };
}

/** Real mechanics/recovery/driver/camera/Painter comparison; no recorded hashes or fake vehicle poses. */
export function compareCourseDriving(
  course,
  {
    entry = VEHICLE_CATALOG[0],
    frames = 600,
    poseSlack = 64,
    initialSpeed = 45,
    manualRecoveryAt = 200,
    forceExcursion = false,
  } = {},
) {
  const section = course.entry;
  const source = createCourseSectionDrivingSource(section);
  const traversal = createCourseGeometryTraversal(section, { retainBehind: 0, selectAhead: 0, maxOccurrences: 2 });
  const nativeWorld = {
    guide: section.guide,
    height: section.height,
    surfaces: createBandSurfaceReader(section.bandPartition, section.physicalBindings),
  };
  const spawn = { s: 950, l: 0, initialSpeed, torqueProtection: entry.torqueProtection };
  const native = createArcadeVehicle(entry.profile, nativeWorld, spawn);
  const states = [createRecoveryState(native), null];
  const rigs = [createCameraRig(), createCameraRig()];
  const pixels = [new SoftwareSurface(320, 240), new SoftwareSurface(320, 240)];
  const assets = createSpriteAssets(),
    background = createFarBackground();
  const visual = new VisualProfile(section.raster.length, [
    {
      sStart: 0,
      name: 'COURSE DRIVING PROBE',
      groundBaseLeft: { kind: 'color', color: GROUND_COLORS.grassA },
      groundBaseRight: { kind: 'color', color: GROUND_COLORS.grassA },
    },
  ]);
  const ground = {
    groundLeft: 4,
    groundRight: 6,
    road: { roadLeft: 4, roadRight: 6, shoulderWidth: 0 },
    roadMarkings: CENTER_DASH_MARKINGS,
  };
  const terrain = {
    screenHeight: 240,
    dMin: 2.5,
    dMax: 200,
    groundLeft: 4,
    groundRight: 6,
    roadLeft: 4,
    roadRight: 6,
    visual,
  };
  let current,
    admittedPose,
    constructions = 0,
    maxRasterMetadata = 0,
    maxHeightMetadata = 0,
    draws = 0,
    measuredQueries = 0;
  const observed = { minS: Infinity, maxS: -Infinity, minL: Infinity, maxL: -Infinity };
  const prepare = (s, lastSafeS) => {
    if (
      current &&
      poseSlack > 0 &&
      s >= admittedPose.minS + 2 &&
      s <= admittedPose.maxS - 2 &&
      lastSafeS <= admittedPose.maxS
    )
      return current;
    admittedPose = { minS: s - Math.max(2, poseSlack), maxS: s + Math.max(2, poseSlack), maxAdvance: 2 };
    const demand = courseSectionDrivingDemand(section.guide, admittedPose, cameraProfile, terrain, {
      ...RECOVERY_PROFILE,
      lastSafeS,
    });
    const view = ok(createCourseGeometryView(traversal.snapshot(), demand));
    current = ok(source.createView(view));
    constructions += 1;
    maxRasterMetadata = Math.max(maxRasterMetadata, current.metadata.rasterSegments);
    maxHeightMetadata = Math.max(maxHeightMetadata, current.metadata.heightNodes);
    return current;
  };
  prepare(spawn.s, spawn.s);
  const bounded = createArcadeVehicle(entry.profile, current.world, spawn);
  states[1] = createRecoveryState(bounded);
  assert.deepEqual(bounded, native);
  const observe = (s, l) => {
    measuredQueries += 1;
    observed.minS = Math.min(observed.minS, s);
    observed.maxS = Math.max(observed.maxS, s);
    if (l !== undefined) {
      observed.minL = Math.min(observed.minL, l);
      observed.maxL = Math.max(observed.maxL, l);
    }
    assert.ok(s >= current.range.start - 1e-8 && s <= current.range.end + 1e-8);
  };
  const instrument = (view) => ({
    guide: {
      ...view.world.guide,
      toWorld(s, l) {
        observe(s, l);
        return view.world.guide.toWorld(s, l);
      },
      metricsAt(s, l, segment) {
        observe(s, l);
        return view.world.guide.metricsAt(s, l, segment);
      },
      locateLocal(...args) {
        const value = view.world.guide.locateLocal(...args);
        observe(value.s, value.l);
        return value;
      },
    },
    height: Object.fromEntries(
      Object.entries(view.world.height).map(([key, value]) => [
        key,
        typeof value === 'function'
          ? (s) => {
              observe(s);
              return value(s);
            }
          : value,
      ]),
    ),
    surfaces: {
      ...view.world.surfaces,
      sample(s, l) {
        observe(s, l);
        return view.world.surfaces.sample(s, l);
      },
    },
  });
  let lastCamera;
  for (let frame = 0; frame < frames; frame += 1) {
    prepare(bounded.course.s, states[1].lastSafeS);
    const worlds = [nativeWorld, instrument(current)];
    const vehicles = [native, bounded];
    const input = worlds.map((world, i) => sampleRivalDrivingInput(world.guide, vehicles[i]));
    assert.deepEqual(input[1], input[0]);
    if (initialSpeed < 0) input.fill({ steering: 0, throttle: false, brake: false });
    if (forceExcursion) input.fill({ steering: 1, throttle: true, brake: false });
    const reasons = vehicles.map((vehicle, i) =>
      advanceVehicleWithRecovery(worlds[i], vehicle, { state: states[i], input: input[i], dt: 1 / 60 }),
    );
    assert.equal(reasons[1], reasons[0]);
    if (frame === manualRecoveryAt)
      vehicles.forEach((vehicle, i) => recoverVehicle(worlds[i], vehicle, { state: states[i], reason: 'manual' }));
    if (reasons[0] !== null || frame === manualRecoveryAt) rigs.forEach(resetCameraRig);
    assert.deepEqual(bounded, native, `complete vehicle at frame ${frame}`);
    assert.deepEqual(states[1], states[0]);
    const cameras = vehicles.map((vehicle, i) => updateCamera(rigs[i], worlds[i], vehicle, cameraProfile, 1 / 60));
    assert.deepEqual(cameras[1], cameras[0], `camera at frame ${frame}`);
    lastCamera = cameras[1];
    if (frame % 20 === 0 || frame === frames - 1) {
      const geometry = {
        ...current.geometry,
        raster: {
          ...current.geometry.raster,
          toWorld(s, l) {
            observe(s, l);
            return current.geometry.raster.toWorld(s, l);
          },
        },
      };
      const results = vehicles.map((vehicle, i) =>
        renderSourceGround(pixels[i], {
          guide: i === 0 ? section.guide : geometry,
          camera: cameras[i],
          vehicle,
          terrainProfile: { ...terrain, height: worlds[i].height },
          groundProfile: ground,
          background,
          assets,
          worldSprites: [],
          playerKind: entry.presentationFamily.toLowerCase(),
        }),
      );
      assert.deepEqual(results[1], results[0]);
      assert.deepEqual(pixels[1].pixels, pixels[0].pixels, `full framebuffer at frame ${frame}`);
      assert.ok(results[1].playerWrittenPixels > 0 && results[1].terrainLineCount > 0);
      draws += 1;
    }
  }
  return {
    frames,
    draws,
    constructions,
    maxRasterMetadata,
    maxHeightMetadata,
    measuredQueries,
    observed,
    sourceRasterSegments: section.raster.segments.length,
    sourceHeightNodes: section.height.nodes.length,
    recoveries: states[1].recoveries,
    finalS: bounded.course.s,
    vehicle: bounded,
    camera: lastCamera,
    frame: current.frame,
    section,
    pixels: pixels[1].pixels,
  };
}
