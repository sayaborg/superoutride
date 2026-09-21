import { createRenderWorkspace } from '../../dist/render/renderer.js';
import { createRenderSpaceCamera } from '../../dist/render/render-height-space.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { computeForwardVisibleInterval } from '../../dist/terrain/terrain-line.js';
import { rasterCoordinateToWorld } from '../../dist/core/raster-coordinate-reader.js';
import { createPlanarCoordinateSample } from '../../dist/core/planar-sample.js';
import { courseBoundaryAt } from '../../dist/course/course-bands.js';
import {
  LOGICAL_HEIGHT,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
} from '../../dist/core/presentation-scale.js';
import { courseTrialBands } from './band-ground-prototype.mjs';
import { compileResolvedBands, packResolvedSlabs } from './band-resolved-slabs.mjs';
import { compileBandFrame, compileBandRowPyramid } from './band-row-pyramid.mjs';
import { createResolvedSlabRaster } from './band-slab-raster.mjs';
import { createFilteredBandRaster } from './band-filtered-raster.mjs';
import { trialRowInterval } from './band-trial-scene.mjs';
import { loadBandTrialRenderer } from './band-trial-renderer.mjs';

function normalization(bands, source) {
  const points = new Map();
  for (const slab of source.slabs)
    for (const s of [slab.start, slab.end]) {
      const active = bands.filter((band) => band.start < slab.end && band.end > slab.start);
      const finite = active
        .flatMap((band) => [
          !band.openLeft && courseBoundaryAt(band.left, s),
          !band.openRight && courseBoundaryAt(band.right, s),
        ])
        .filter((v) => v !== false);
      let left = Math.min(...finite),
        right = Math.max(...finite);
      // A one-edge study still declares finite reference boundaries; no infinity or guessed spatial limit is inserted.
      if (!(right > left)) {
        const declared = active.flatMap((band) => [courseBoundaryAt(band.left, s), courseBoundaryAt(band.right, s)]);
        left = Math.min(...declared);
        right = Math.max(...declared);
      }
      const previous = points.get(s);
      points.set(s, {
        s,
        left: previous ? Math.min(previous.left, left) : left,
        right: previous ? Math.max(previous.right, right) : right,
      });
    }
  return compileBandFrame(
    [...points.values()].sort((a, b) => a.s - b.s),
    source.length,
  );
}

/** Whole-plane experimental renderer. Compilation and finite ownership variants finish before measurement. */
export async function createRevisedBandTrialScene(scene, course, assets, extraBands) {
  const renderDriving = await loadBandTrialRenderer();
  const sources = course.sections.map((section) => {
    const bands = [...courseTrialBands(section, true), ...(extraBands?.get(section) ?? [])];
    const source = compileResolvedBands(bands, section.raster.length),
      frame = normalization(bands, source);
    const starts = new Set([0]),
      ends = new Set([section.raster.length]);
    for (const owner of course.sections)
      for (const link of owner.outgoing) {
        if (link.destination.section === section) starts.add(link.destination.anchor.s);
        if (link.source.section === section) ends.add(link.source.anchor.s);
      }
    const pyramids = [];
    for (const start of starts)
      for (const end of ends)
        if (end > start) {
          pyramids.push(
            compileBandRowPyramid(source, frame, {
              rangeStart: start,
              rangeEnd: end,
              maximumFootprint: CURRENT_RENDER_FAR_DEPTH_METERS - CURRENT_RENDER_NEAR_DEPTH_METERS,
              focalLength: 200,
              cameraHeight: 2.85,
            }),
          );
        }
    return { section, source, bands, frame, pyramids, near: packResolvedSlabs(source) };
  });
  const bySection = new Map(sources.map((source) => [source.section, source]));
  const near = createResolvedSlabRaster(320),
    far = createFilteredBandRaster(320),
    workspace = createRenderWorkspace();
  const interval = { start: 0, end: 0 },
    heightScratch = { y: 0, grade: 0, segmentIndex: 0, sStart: 0, sEnd: 0 };
  const point0 = createPlanarCoordinateSample(),
    point1 = createPlanarCoordinateSample();
  const projection = {
    at(s, out) {
      rasterCoordinateToWorld(geometry.raster, s, 0, point0);
      rasterCoordinateToWorld(geometry.raster, s, 1, point1);
      const scale = renderCamera.focalLength / (s - renderCamera.s),
        cos = Math.cos(renderCamera.yaw),
        sin = Math.sin(renderCamera.yaw);
      out.offset =
        renderCamera.centerX + scale * ((point0.x - renderCamera.x) * cos - (point0.z - renderCamera.z) * sin);
      out.scale = scale * ((point1.x - point0.x) * cos - (point1.z - point0.z) * sin);
      return out;
    },
  };
  const worldSprites = [];
  let lastView, lastClosed, terrainProfile, spans, renderCamera, visible, geometry;
  let staticCount = 0,
    capture = false,
    rows = [];
  const ground = {
    kind: 'baked',
    kMax: sources[0].pyramids[0].levels.length - 1,
    drawLine(target, line, profile, out) {
      trialRowInterval(line, renderCamera, workspace.terrain, terrainProfile.height, visible, interval, heightScratch);
      const deltaS = interval.end - interval.start,
        dx = line.xGroundR - line.xGroundL;
      out.outputPixels = 0;
      out.groundMapLevel = 0;
      if (!(deltaS > 0) || !(dx > 0)) return out;
      const step = (profile.groundLeft + profile.groundRight) / dx;
      const lateral = -profile.groundLeft + (0.5 - line.xGroundL) * step;
      const trace = capture
        ? { y: line.y, distance: line.d, deltaS, start: interval.start, end: interval.end, sections: 0 }
        : null;
      const begin = capture ? performance.now() : 0;
      if (deltaS < 1.6) {
        near.sample(
          target.pixels,
          line.y * target.width,
          target.width,
          interval.start,
          interval.end,
          lateral,
          step,
          spans,
          trace,
          projection,
        );
        if (trace)
          trace.sections = spans.filter(
            (span) => span.frameStart < interval.end && span.frameEnd > interval.start,
          ).length;
      } else {
        far.sample(
          target.pixels,
          line.y * target.width,
          target.width,
          interval.start,
          interval.end,
          line.s,
          lateral,
          step,
          spans,
          trace,
        );
        out.groundMapLevel = Math.min(ground.kMax, Math.floor(Math.log2(deltaS / 1.6)));
      }
      if (trace) {
        trace.microseconds = (performance.now() - begin) * 1000;
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
        if (!mapped.ok) throw new Error(`Revised trial view failed: ${mapped.reason}`);
        spans = mapped.value.spans.map((span) => {
          const source = bySection.get(span.occurrence.section);
          const pyramid = source.pyramids.find(
            (p) => p.rangeStart === span.sourceRange.start && p.rangeEnd === span.sourceRange.end,
          );
          if (!pyramid) throw new Error('No compiled row domain for canonical owned Section range');
          return { ...span, source: source.source, pyramid };
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
    report() {
      return {
        wholePlane: true,
        rows,
        sections: sources.map(({ section, source, near, pyramids }) => ({
          id: section.id,
          maximumIntervals: source.maximumIntervals,
          distributionMetres: source.distributionMetres,
          near: {
            dictionaryBytes: near.dictionaryBytes,
            directoryBytes: near.directoryBytes,
            headerBytes: near.headerBytes,
            packedBytes: near.bytes.byteLength,
          },
          far: pyramids.map((p) => ({
            rangeStart: p.rangeStart,
            rangeEnd: p.rangeEnd,
            dictionaryRows: p.dictionary.length,
            dictionaryBytes: p.dictionaryBytes,
            directoryBytes: p.directoryBytes,
            frameBytes: p.frameBytes,
            headerBytes: p.headerBytes,
            packedBytes: p.packedBytes,
            retainedSampleBytes: p.retainedSampleBytes,
            levels: p.levels.map((l) => ({
              width: l.width,
              lateralSpacing: l.lateralSpacing,
              rowLength: l.rowLength,
              structuralMaximum: Math.max(1, Math.ceil(p.frame.maximumWidth / l.lateralSpacing)),
              buckets: l.bucketCount,
            })),
          })),
        })),
      };
    },
    packed() {
      return sources.map(({ section, near, pyramids }) => ({
        id: section.id,
        near: near.bytes,
        far: pyramids.map((p) => p.pack()),
      }));
    },
  };
}
