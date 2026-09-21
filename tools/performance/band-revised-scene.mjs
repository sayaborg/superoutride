import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRenderWorkspace } from '../../dist/render/renderer.js';
import { createRenderSpaceCamera } from '../../dist/render/render-height-space.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { computeForwardVisibleInterval } from '../../dist/terrain/terrain-line.js';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  CURRENT_FOCAL_LENGTH_PIXELS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
} from '../../dist/core/presentation-scale.js';
import { rasterCoordinateToWorld } from '../../dist/core/raster-coordinate-reader.js';
import { CURRENT_CAMERA_HEIGHT_METERS } from '../../dist/camera/current-camera-profile.js';
import { createPlanarCoordinateSample } from '../../dist/core/planar-sample.js';
import { imageLodExponent } from '../../dist/graphics/image-filter.js';
import { pseudoProject } from '../../dist/core/projection.js';
import { courseTrialBands } from './band-ground-prototype.mjs';
import { compileResolvedBands, packResolvedSlabs } from './band-resolved-slabs.mjs';
import {
  BAND_ROW_BASE_WIDTH_METERS,
  compileBandNormalization,
  compileNormalizedBandRows,
  packNormalizedBandRows,
} from './band-normalized-rows.mjs';
import { createResolvedSlabRaster } from './band-slab-raster.mjs';
import { createNormalizedRowRaster } from './band-filtered-raster.mjs';
import { trialRowInterval } from './band-trial-scene.mjs';
import { loadWholePlaneTrialRenderer } from './band-renderer-probe.mjs';

/** Static source/ownership products; no occurrence state and no generated products are committed. */
function compileSources(course, paint) {
  const allPyramids = [],
    reports = [];
  const bySection = new Map();
  for (const section of course.sections) {
    const bands = paint ? paint(section) : courseTrialBands(section, true);
    const source = compileResolvedBands(bands, section.raster.length);
    const normalization = compileBandNormalization(bands, source);
    const starts = new Set([0]);
    for (const candidate of course.sections)
      for (const link of candidate.outgoing)
        if (link.destination.section === section) starts.add(link.destination.anchor.s);
    // Every possible ownership boundary is static compiled Link data, never a moving view range.
    const ends = new Set([section.raster.length, ...section.outgoing.map((link) => link.source.anchor.s)]);
    const pyramids = new Map(),
      ranges = [];
    for (const start of starts)
      for (const end of ends) {
        if (!(end > start)) continue;
        const pyramid = compileNormalizedBandRows(source, normalization, {
          start,
          end,
          maximumFootprint: CURRENT_RENDER_FAR_DEPTH_METERS - CURRENT_RENDER_NEAR_DEPTH_METERS,
          focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
          cameraHeight: CURRENT_CAMERA_HEIGHT_METERS,
        });
        const packed = packNormalizedBandRows(pyramid);
        pyramids.set(`${start}:${end}`, pyramid);
        allPyramids.push(pyramid);
        ranges.push({
          start,
          end,
          headerBytes: packed.headerBytes,
          frameBytes: packed.frameBytes,
          levelBytes: packed.levelBytes,
          dictionaryBytes: packed.dictionaryBytes,
          directoryBytes: packed.directoryBytes,
          totalBytes: packed.bytes.byteLength,
          levels: pyramid.levels.map((level) => ({
            width: level.width,
            spacing: level.spacing,
            rowLength: level.rowLength,
            structuralBound: Math.ceil(pyramid.maximumWidth / level.spacing) + 2,
            buckets: level.ids.length,
            uniqueRows: new Set(level.ids).size,
          })),
        });
      }
    const near = packResolvedSlabs(source);
    bySection.set(section, { source, pyramids });
    reports.push({
      id: section.id,
      maximumIntervals: source.maximumIntervals,
      distributionMetres: source.distributionMetres,
      near: {
        dictionaryBytes: near.dictionaryBytes,
        directoryBytes: near.directoryBytes,
        headerBytes: near.headerBytes,
        totalBytes: near.bytes.byteLength,
      },
      ranges,
    });
  }
  return { bySection, allPyramids, reports };
}

/** Whole-plane offline ground substitution through the ordinary renderer's isolated ground-row hook. */
export async function createRevisedBandScene(scene, course, assets, paint) {
  const {
    renderer: { renderDriving },
  } = await loadWholePlaneTrialRenderer();
  const { bySection, allPyramids, reports } = compileSources(course, paint);
  const near = createResolvedSlabRaster(LOGICAL_WIDTH),
    far = createNormalizedRowRaster(LOGICAL_WIDTH, allPyramids);
  const workspace = createRenderWorkspace(),
    worldSprites = [];
  const interval = { start: 0, end: 0 },
    heightScratch = { y: 0, grade: 0, segmentIndex: 0, sStart: 0, sEnd: 0 };
  const point = createPlanarCoordinateSample(),
    anchor = { x: 0, y: 0, z: 0, s: 0 };
  const projected = { x: 0, y: 0, scale: 0, depth: 0, cameraRightDistance: 0 };
  let geometry,
    renderCamera,
    terrainProfile,
    visible,
    spans,
    lastView,
    lastClosed,
    staticCount = 0,
    capture = false,
    rows = [];
  function project(s, l) {
    rasterCoordinateToWorld(geometry.raster, s, l, point);
    anchor.x = point.x;
    anchor.z = point.z;
    anchor.s = s;
    return pseudoProject(anchor, renderCamera, projected).x;
  }
  const projection = {
    prepare(start, end, out) {
      out.x0 = project(start, 0);
      out.scale0 = project(start, 1) - out.x0;
      out.x1 = project(end, 0);
      out.scale1 = project(end, 1) - out.x1;
      if (!(out.scale0 > 0 && out.scale1 > 0)) throw new RangeError('Near row endpoints must face the viewer');
    },
  };
  const ground = {
    kind: 'baked',
    kMax: allPyramids[0].levels.length - 1,
    drawRow(target, line, profile, out) {
      out.outputPixels = 0;
      out.groundMapLevel = 0;
      const stepL = (profile.groundLeft + profile.groundRight) / (line.xGroundR - line.xGroundL);
      if (!(stepL > 0) || !visible) return out;
      trialRowInterval(line, renderCamera, workspace.terrain, terrainProfile.height, visible, interval, heightScratch);
      const delta = interval.end - interval.start;
      if (!(delta > 0)) return out;
      const lateral = -profile.groundLeft + (0.5 - line.xGroundL) * stepL;
      const trace = capture
        ? {
            y: line.y,
            distance: line.d,
            deltaS: delta,
            start: interval.start,
            end: interval.end,
            method: delta < BAND_ROW_BASE_WIDTH_METERS ? 'near' : 'far',
          }
        : null;
      const begin = capture ? performance.now() : 0;
      if (delta < BAND_ROW_BASE_WIDTH_METERS) {
        near.sample(
          target.pixels,
          line.y * target.width,
          target.width,
          interval.start,
          interval.end,
          lateral,
          stepL,
          spans,
          trace,
          projection,
        );
        if (trace) trace.sections = trace.slabs ? 1 : 0;
      } else {
        far.sample(
          target.pixels,
          line.y * target.width,
          target.width,
          interval.start,
          interval.end,
          line.s,
          lateral,
          stepL,
          spans,
          trace,
        );
        out.groundMapLevel = Math.min(ground.kMax, Math.floor(imageLodExponent(delta / BAND_ROW_BASE_WIDTH_METERS)));
      }
      if (trace) {
        trace.instrumentedMilliseconds = performance.now() - begin;
        rows.push(trace);
      }
      out.outputPixels = target.width;
      return out;
    },
  };
  return {
    render(target, vehicle, camera, playerKind, others) {
      const view = scene.session.view,
        closed = scene.session.closedCarriageways;
      const { world, presentation } = view;
      geometry = view.geometry;
      if (view !== lastView || closed !== lastClosed) {
        const mapped = createCourseGeometryView(scene.history, 'retained');
        if (!mapped.ok) throw new Error(`Trial view failed: ${mapped.reason}`);
        spans = mapped.value.spans.map((span) => {
          const compiled = bySection.get(span.occurrence.section);
          const pyramid = compiled.pyramids.get(`${span.sourceOwnership.start}:${span.sourceOwnership.end}`);
          if (!pyramid)
            throw new Error(
              `Missing static source ownership ${span.sourceOwnership.start}:${span.sourceOwnership.end} for ${span.occurrence.section.id}`,
            );
          return { ...span, source: compiled.source, pyramid };
        });
        worldSprites.length = 0;
        worldSprites.push(...presentation.worldSprites);
        for (const placement of presentation.conditionalSprites)
          if (closed.includes(placement.unselected)) worldSprites.push(placement.sprite);
        staticCount = worldSprites.length;
        terrainProfile = {
          screenHeight: LOGICAL_HEIGHT,
          dMin: CURRENT_RENDER_NEAR_DEPTH_METERS,
          dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
          ...presentation.groundProfile,
          height: world.height,
          visual: presentation.visual,
        };
        lastView = view;
        lastClosed = closed;
      }
      worldSprites.length = staticCount;
      if (others) worldSprites.push(...others);
      renderCamera = createRenderSpaceCamera(world.height, camera);
      visible = computeForwardVisibleInterval(
        geometry,
        renderCamera.yaw,
        renderCamera.s,
        terrainProfile.dMin,
        terrainProfile.dMax,
      );
      if (capture) rows = [];
      return renderDriving(
        target,
        {
          background: presentation.backgroundAt(camera.s),
          guide: geometry,
          camera,
          vehicle,
          terrainProfile,
          groundProfile: presentation.groundProfile,
          worldSprites,
          assets,
          playerKind,
        },
        { ground, workspace },
      );
    },
    captureRows(value) {
      capture = value;
    },
    async writeProducts(directory) {
      await mkdir(directory, { recursive: true });
      const files = [];
      let index = 0;
      for (const [section, compiled] of bySection) {
        const products = [{ name: `${index}-near.bin`, packed: packResolvedSlabs(compiled.source) }];
        let rangeIndex = 0;
        for (const pyramid of compiled.pyramids.values())
          products.push({ name: `${index}-far-${rangeIndex++}.bin`, packed: packNormalizedBandRows(pyramid) });
        for (const { name, packed } of products) {
          await writeFile(`${directory}/${name}`, packed.bytes);
          files.push({
            name,
            section: section.id,
            bytes: packed.bytes.byteLength,
            sha256: createHash('sha256').update(packed.bytes).digest('hex'),
          });
        }
        index++;
      }
      await writeFile(`${directory}/manifest.json`, JSON.stringify(files, null, 2));
    },
    report() {
      return {
        wholePlane: true,
        decodedLinearBytes: allPyramids.reduce(
          (sum, p) => sum + p.dictionary.reduce((n, row) => n + row.colors.length * 4 * 8, 0),
          0,
        ),
        usesGroundBase: false,
        maximumIntervals: Math.max(...reports.map((s) => s.maximumIntervals)),
        nearBytes: reports.reduce((sum, s) => sum + s.near.totalBytes, 0),
        farBytes: reports.reduce((sum, s) => sum + s.ranges.reduce((n, r) => n + r.totalBytes, 0), 0),
        sections: reports,
        rows,
      };
    },
  };
}
