import { mkdir, writeFile } from 'node:fs/promises';

import { compileBakedGroundMapAsset } from '../dist/compiler/ground-map-asset-compiler.js';
import { deriveGroundMapDensity } from '../dist/compiler/ground-map-lod.js';
import { deriveGroundMapTargetEnvelope } from '../dist/compiler/ground-map-target-envelope.js';
import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';

const cameraHeight = 2.469902425419539;
const pitch = 8 * Math.PI / 180;
const dMin = 2.5;
const dMax = 150;
const guide = createM2StadiumGuide();
const compiledSurfaces = compileSurfaceRegions(
  guide.length,
  createM5DebugSurfaceRegionAuthoring(guide.length),
);
const groundProfile = {
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  shoulderWidth: 1,
  junction: M6_13_JUNCTION,
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
const asset = await compileBakedGroundMapAsset(
  guide.length,
  groundProfile,
  density,
  target.kMax,
  32,
);

await mkdir(new URL('../dist/assets/', import.meta.url), { recursive: true });
await Promise.all([
  writeFile(new URL('../dist/assets/m5-ground-map.json', import.meta.url), `${JSON.stringify(asset.metadata, null, 2)}\n`),
  writeFile(new URL('../dist/assets/m5-ground-map.bin', import.meta.url), asset.bytes),
]);

const chunkRefs = asset.metadata.levels.reduce((sum, level) => sum + level.chunks.length, 0);
console.log('M6.13 BAKED GROUND MAP', JSON.stringify({
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
}));
