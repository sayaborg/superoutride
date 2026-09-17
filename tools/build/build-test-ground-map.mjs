import { createBranchingGroundMapFixture } from '../../dist/dev/fixtures/branching-ground-map.js';
import { createGroundMapCompileSource } from '../../dist/groundmap/ground-map-compile-source.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CENTER_DASH_MARKINGS } from '../../dist/dev/courses/road-markings.js';

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
import { STADIUM_JUNCTION, STADIUM_ROAD_CROSS_SECTION } from '../../dist/dev/courses/stadium/junction.js';
import { createStadiumEnvironment } from '../../dist/dev/fixtures/stadium-environment.js';
import { createStadiumGuide } from '../../dist/dev/fixtures/raster-courses.js';
import { compileGroundMapFiles } from './ground-map-files.mjs';
import { deriveGroundMapDensity } from '../../dist/groundmap/ground-map-lod.js';
import { deriveGroundMapTargetEnvelope } from '../../dist/groundmap/ground-map-target-envelope.js';

const cameraHeight = CURRENT_CAMERA_HEIGHT_METERS;
const pitch = CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS;
const dMin = CURRENT_RENDER_NEAR_DEPTH_METERS;
const dMax = CURRENT_RENDER_FAR_DEPTH_METERS;
const guide = createStadiumGuide();
const compiledSurfaces = createStadiumEnvironment(guide.length);
const groundProfile = {
  groundLeft: 12,
  groundRight: 12,
  road: STADIUM_ROAD_CROSS_SECTION,
  roadMarkings: CENTER_DASH_MARKINGS,
  junctionMarkings: CENTER_DASH_MARKINGS,
  junction: STADIUM_JUNCTION,
  logical: compiledSurfaces.groundMap,
};
const density = deriveGroundMapDensity({
  d0: CURRENT_CAMERA_DISTANCE_METERS,
  focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
  cameraHeight,
  pitchRadians: pitch,
});
const target = deriveGroundMapTargetEnvelope({
  dMin,
  dMax,
  qS: density.qS,
  thinSpanScreenRows: 1,
});
await mkdir(new URL('../../.test-assets/', import.meta.url), { recursive: true });
const asset = {
  metadata: await compileGroundMapFiles(
    fileURLToPath(new URL('../../.test-assets/stadium-ground-map.bin', import.meta.url)),
    createGroundMapCompileSource(guide.length, groundProfile),
    density,
    target.kMax,
    32,
  ),
};
await writeFile(
  new URL('../../.test-assets/stadium-ground-map.json', import.meta.url),
  JSON.stringify(asset.metadata, null, 2) + '\n',
);

const chunkRefs = asset.metadata.levels.reduce((sum, level) => sum + level.chunks.length, 0);
console.log(
  'BAKED TEST GROUND MAP',
  JSON.stringify({
    courseLength: asset.metadata.courseLength,
    baseLateralTexels: asset.metadata.levels[0].lateralTexels,
    baseChainageTexels: asset.metadata.levels[0].chainageTexels,
    actualBaseQL: asset.metadata.actualBaseQL,
    actualBaseQS: asset.metadata.actualBaseQS,
    kMax: asset.metadata.kMax,
    chunkRefs,
    uniquePayloads: asset.metadata.payloads.length,
    binaryBytes: asset.metadata.binaryBytes,
    uncompressedRgbaBytes: asset.metadata.uncompressedRgbaBytes,
    compressionRatio: asset.metadata.binaryBytes / asset.metadata.uncompressedRgbaBytes,
  }),
);

// Full authored domains at deliberately coarse test density. These are not product assets.
for (const { id, runtime } of createBranchingGroundMapFixture().stages) {
  const source = createGroundMapCompileSource(
    runtime.heightProfile.courseLength,
    runtime.groundProfile,
    runtime.roadView,
  );
  const metadata = await compileGroundMapFiles(
    fileURLToPath(new URL(`../../.test-assets/${id}-ground-map.bin`, import.meta.url)),
    source,
    { qL: 0.25, qS: 1 },
    2,
    32,
  );
  await writeFile(new URL(`../../.test-assets/${id}-ground-map.json`, import.meta.url), JSON.stringify(metadata));
}
