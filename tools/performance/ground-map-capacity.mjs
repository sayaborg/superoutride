import { createGroundMapCompileSource } from '../../dist/groundmap/ground-map-compile-source.js';
/** Host-only capacity diagnostic. Does not change compiler, renderer or product asset delivery. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { compileGroundMapFiles } from '../build/ground-map-files.mjs';
import { BakedGroundMapAsset } from '../../dist/groundmap/baked-ground-map.js';
import { deriveGroundMapDensity } from '../../dist/groundmap/ground-map-lod.js';
import { deriveGroundMapTargetEnvelope } from '../../dist/groundmap/ground-map-target-envelope.js';
import { downsampleGroundMap2x4 } from '../../dist/groundmap/ground-map-prefilter.js';
import { createGroundMapLevelEncoder } from '../../dist/groundmap/ground-map-encoding.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { createStadiumGuide } from '../../dist/dev/fixtures/raster-courses.js';
import { createStadiumEnvironment } from '../../dist/dev/fixtures/stadium-environment.js';
import { STADIUM_JUNCTION, STADIUM_ROAD_CROSS_SECTION } from '../../dist/dev/courses/stadium/junction.js';
import { CENTER_DASH_MARKINGS } from '../../dist/dev/courses/road-markings.js';
import { createTsukubaGroundProfile, createTsukubaCourse2000Lap } from '../../dist/dev/courses/tsukuba-circuit.js';
import { createLinearHighwayRuntime } from '../../dist/dev/courses/linear-highway.js';
import {
  createDefaultBranchingParent,
  BRANCHING_DEFAULT_BRANCHING_FORK,
} from '../../dist/dev/courses/branching-highway.js';
import { createDeclarativeForkGrowthPlan } from '../../dist/dev/courses/fork-growth-plan.js';
import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';
import { createFarBackground } from '../../dist/visual/far-background.js';
import { sampleGroundMap } from '../../dist/groundmap/ground-map.js';
import { sampleStageGroundMapAtLevel } from '../../dist/groundmap/stage-ground-map-view.js';
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

const density = deriveGroundMapDensity({
  d0: CURRENT_CAMERA_DISTANCE_METERS,
  focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
  cameraHeight: CURRENT_CAMERA_HEIGHT_METERS,
  pitchRadians: CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
});
const target = deriveGroundMapTargetEnvelope({
  dMin: CURRENT_RENDER_NEAR_DEPTH_METERS,
  dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
  qS: density.qS,
  thinSpanScreenRows: 1,
});
const snapshot = () => ({ ...process.memoryUsage(), peakRssBytes: process.resourceUsage().maxRSS * 1024 });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const names = ['stadium', 'tsukuba', 'highway', 'branching-parent'];

function source(name) {
  if (name === 'stadium') {
    const length = createStadiumGuide().length;
    return {
      length,
      profile: {
        groundLeft: 12,
        groundRight: 12,
        road: STADIUM_ROAD_CROSS_SECTION,
        roadMarkings: CENTER_DASH_MARKINGS,
        junctionMarkings: CENTER_DASH_MARKINGS,
        junction: STADIUM_JUNCTION,
        logical: createStadiumEnvironment(length).groundMap,
      },
    };
  }
  if (name === 'tsukuba')
    return { length: createTsukubaCourse2000Lap().raster.length, profile: createTsukubaGroundProfile() };
  const runtime = name === 'highway' ? createLinearHighwayRuntime() : createDefaultBranchingParent();
  return { length: runtime.guide.length, profile: runtime.groundProfile };
}

async function bake(name, directory) {
  const { length, profile } = source(name);
  global.gc();
  const before = snapshot();
  const started = performance.now();
  const m = await compileGroundMapFiles(
    join(directory, name + '.bin'),
    createGroundMapCompileSource(length, profile),
    density,
    target.kMax,
    32,
  );
  const milliseconds = performance.now() - started;
  const afterCompile = snapshot(); // Includes spool I/O; before full output readback/compression.
  const metadata = JSON.stringify(m);
  const bytes = await readFile(join(directory, name + '.bin'));
  const unsharedEncodedBytes = m.levels.reduce(
    (n, l) => n + l.lateralTexels * l.chainageTexels * (l.format === 'palette8' ? 1 : 2),
    0,
  );
  assert.ok(m.binaryBytes <= unsharedEncodedBytes);
  assert.equal(m.binaryBytes, bytes.byteLength);
  const binaryGzipBytes = gzipSync(bytes, { level: 9 }).byteLength;
  const metadataGzipBytes = gzipSync(metadata, { level: 9 }).byteLength;
  await writeFile(join(directory, name + '.json'), metadata);
  return {
    name,
    length,
    width: profile.groundLeft + profile.groundRight,
    milliseconds,
    before,
    afterCompile,
    proceduralGrassFallback: !profile.logical,
    binaryBytes: m.binaryBytes,
    metadataBytes: Buffer.byteLength(metadata),
    binaryGzipBytes,
    metadataGzipBytes,
    gzipBytes: binaryGzipBytes + metadataGzipBytes,
    sha256: digest(bytes),
    unsharedEncodedBytes,
    dedupSavedFraction: 1 - m.binaryBytes / unsharedEncodedBytes,
    rgbaPyramidBytes: m.uncompressedRgbaBytes,
    alignmentTexelRatio:
      (m.levels[0].lateralTexels * m.levels[0].chainageTexels) /
      (Math.ceil((profile.groundLeft + profile.groundRight) / density.qL) * Math.ceil(length / density.qS)),
    chunkRefs: m.levels.reduce((n, l) => n + l.chunks.length, 0),
    uniquePayloads: m.payloads.length,
    levels: m.levels.map(({ level, lateralTexels, chainageTexels, format }) => ({
      level,
      lateralTexels,
      chainageTexels,
      format,
    })),
  };
}

async function readAsset(name, directory) {
  global.gc();
  const before = snapshot();
  let bytes = await readFile(join(directory, name + '.bin'));
  let metadata = JSON.parse(await readFile(join(directory, name + '.json'), 'utf8'));
  const binaryBytes = bytes.byteLength;
  global.gc();
  const loaded = snapshot();
  const started = performance.now();
  const reader = new BakedGroundMapAsset(metadata, bytes);
  const constructionMilliseconds = performance.now() - started;
  global.gc();
  const inputAndReader = snapshot();
  bytes = null;
  metadata = null;
  // Leave the readFile await continuation before observing collectible input buffers.
  await new Promise((resolveTurn) => setImmediate(resolveTurn));
  global.gc();
  const readerOnly = snapshot();
  let checksum = 0;
  for (let level = 0; level <= reader.kMax; level++) {
    checksum = (checksum ^ reader.sampleAtLevel(reader.metadata.courseLength * 0.5, 0, level)) >>> 0;
  }
  return {
    before,
    loaded,
    inputAndReader,
    readerOnly,
    constructionMilliseconds,
    checksum,
    binaryBytes,
    retainedPackedBufferBytes: binaryBytes,
    inputPlusReaderBufferBytes: 2 * binaryBytes,
    note: 'Host process observations; GC/RSS are not smartphone measurements. No full RGBA expansion.',
  };
}

function patternStress() {
  return ['tile16', 'rgb555-noise'].map((kind) => {
    const pixels = new Uint32Array(1024 * 4096);
    let seed = 0x12345678;
    for (let i = 0; i < pixels.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const code = kind === 'tile16' ? ((i % 1024) % 16) * 2114 : seed >>> 17;
      pixels[i] = rgb555ToRgba(code);
    }
    const pyramid = [{ lateralTexels: 1024, chainageTexels: 4096, pixels }];
    for (let k = 1; k <= 6; k++) pyramid.push(downsampleGroundMap2x4(pyramid.at(-1)));
    const levels = pyramid.map((level, index) => {
      const encoder = createGroundMapLevelEncoder(level, index === 0 ? undefined : null);
      const bytes = encoder.encodeRows(0, level.chainageTexels);
      return {
        format: encoder.format,
        bytes: bytes.byteLength,
        gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
        sha256: digest(bytes),
      };
    });
    assert.equal(levels[0].format, kind === 'tile16' ? 'palette8' : 'rgb555le');
    return {
      kind,
      levels,
      encodedBytes: levels.reduce((n, l) => n + l.bytes, 0),
      gzipBytes: levels.reduce((n, l) => n + l.gzipBytes, 0),
      note: 'Synthetic prefilter/encoding stress, not a course bake, dedup measurement or future texture prediction.',
    };
  });
}

function stageInventory() {
  const parent = createDefaultBranchingParent();
  const background = createFarBackground();
  const plan = createDeclarativeForkGrowthPlan(
    parent.guide,
    {
      ...parent,
      selectFarBackground: () => background,
      worldSprites: [],
    },
    createSpriteAssets(),
    BRANCHING_DEFAULT_BRANCHING_FORK,
  );
  const stages = plan.authoring.stages.map(({ id, runtime }) => {
    const { roadView: view, groundProfile: profile } = runtime;
    const length = runtime.heightProfile.courseLength;
    let sampledDifferences = 0;
    let samples = 0;
    if (view) {
      for (let row = 0; row < 32; row++)
        for (let col = 0; col < 33; col++) {
          const s = (length * (row + 0.5)) / 32;
          const l = -view.groundLeft + ((view.groundLeft + view.groundRight) * (col + 0.5)) / 33;
          const actual = sampleStageGroundMapAtLevel(s, l, 0, view, profile);
          const sourceColor = sampleGroundMap(s, l + view.sourceLateralOrigin, profile);
          samples++;
          if (actual !== sourceColor) sampledDifferences++;
        }
    }
    return {
      id,
      packageId: runtime.packageId,
      length,
      view,
      chainageOffsetS: profile.chainageOffsetS ?? 0,
      stageJunction: !!profile.stageJunction,
      samples,
      sampledDifferences,
    };
  });
  return {
    stages,
    transitions: plan.authoring.transitions.map(({ fromStageId, toStageId, handoff }) => ({
      fromStageId,
      toStageId,
      sourceSeamS: handoff.sourceSeamS,
      targetSeamS: handoff.targetSeamS,
    })),
    note: 'Grid differences identify missing stage paint in source-only baking; zero differences are not equivalence proof. No child stage is falsely reported as a complete baked asset.',
  };
}

function worker(mode, name, directory) {
  return new Promise((resolveResult, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ['--worker', mode, name, directory], {
      execArgv: ['--expose-gc'],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    let result;
    child.on('message', (message) => {
      result = message;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0 || !result) reject(new Error(`${mode} ${name} worker failed: ${code}`));
      else resolveResult(result);
    });
  });
}

async function main() {
  if (process.argv[2] === '--inventory') {
    console.log(JSON.stringify(stageInventory(), null, 2));
    return;
  }
  if (process.argv[2] === '--worker') {
    const [, , , mode, name, directory] = process.argv;
    const result = mode === 'bake' ? await bake(name, directory) : await readAsset(name, directory);
    process.send(result);
    return;
  }
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node tools/performance/ground-map-capacity.mjs /path/to/report.json');
  const directory = await mkdtemp(join(tmpdir(), 'outride-ground-capacity-'));
  try {
    const courses = [];
    for (const name of names) {
      console.error('Measuring', name);
      const compiled = await worker('bake', name, directory);
      const reader = await worker('reader', name, directory);
      courses.push({ ...compiled, reader });
      await writeFile(resolve(output), JSON.stringify({ complete: false, courses }, null, 2) + '\n');
    }
    const report = {
      complete: true,
      node: process.version,
      platform: process.platform,
      density,
      target,
      gzip: 'level 9, metadata and binary separately; hypothetical HTTP payload, not observed Pages delivery',
      courses,
      patterns: patternStress(),
      branching: stageInventory(),
    };
    await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n');
    console.error('Saved', resolve(output));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
await main();
