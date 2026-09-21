import { renderDriving, createRenderWorkspace } from '../../dist/render/renderer.js';
import { createRenderSpaceCamera } from '../../dist/render/render-height-space.js';
import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { computeForwardVisibleInterval } from '../../dist/terrain/terrain-line.js';
import {
  LOGICAL_HEIGHT,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
} from '../../dist/core/presentation-scale.js';
import { compileBandTrial, courseTrialBands } from './band-ground-prototype.mjs';
import { compileCrossSectionPyramids } from './band-cross-section.mjs';
import { createBandRowRaster } from './band-row-raster.mjs';

function boundaryDepth(row, a, b, visible) {
  const value = b / (row - a);
  return value > 0 && Number.isFinite(value) ? Math.min(visible.dEnd, Math.max(visible.dStart, value)) : visible.dEnd;
}

/** Read actual row endpoints, not s +/- deltaS/2 (perspective is nonlinear in s). */
export function trialRowInterval(line, camera, terrain, height, visible, out, heightScratch) {
  const grade = height.sampleRender(line.s, heightScratch).grade;
  const cosine = Math.cos(camera.pitch);
  const a = camera.centerY - camera.focalLength * Math.sin(camera.pitch) - camera.focalLength * grade * cosine;
  const b = -camera.focalLength * (line.renderHeight - grade * line.d - camera.y) * cosine;
  const first = boundaryDepth(line.y, a, b, visible);
  const last = boundaryDepth(line.y + 1, a, b, visible);
  out.start = camera.s + Math.min(first, last);
  out.end = camera.s + Math.max(first, last);
  if (line.sourceFootprint.collapsed && line.sourceFootprint.deltaSCollapse >= line.sourceFootprint.deltaS) {
    const boundaries = terrain.boundaries;
    let index = 0;
    while (index + 1 < boundaries.length && boundaries[index + 1] <= line.s) index++;
    out.start = boundaries[index];
    out.end = boundaries[index + 1];
  }
  return out;
}

/** Offline adapter only. The ordinary renderer still owns camera, terrain, Painter and sprites.
 * Its outside-strip GroundBase remains unchanged: this is not a whole-plane replacement certificate.
 */
export function createBandTrialScene(scene, course, filtered) {
  const sources = course.sections.map((section) => ({
    section,
    id: section.id,
    length: section.raster.length,
    ...compileBandTrial(courseTrialBands(section)),
  }));
  const pyramid = compileCrossSectionPyramids(sources, {
    minimumWidth: 1.6,
    maximumFootprint: CURRENT_RENDER_FAR_DEPTH_METERS - CURRENT_RENDER_NEAR_DEPTH_METERS,
  });
  const bySection = new Map(
    sources.map((source, index) => [source.section, { ...source, pyramid: pyramid.sections[index] }]),
  );
  const raster = createBandRowRaster(320, pyramid, filtered);
  const workspace = createRenderWorkspace();
  const assets = createSpriteAssets();
  const worldSprites = [];
  const interval = { start: 0, end: 0 };
  const heightScratch = { y: 0, grade: 0, segmentIndex: 0, sStart: 0, sEnd: 0 };
  let lastView;
  let lastClosed;
  let terrainProfile;
  let spans;
  let staticCount = 0;
  let rowIndex = 0;
  let currentLine;
  let renderCamera;
  let visible;
  let capture = false;
  let rows = [];
  let trace;
  const ground = {
    kind: 'baked',
    kMax: pyramid.sections[0].levels.length - 1,
    selectLevel(deltaS) {
      currentLine = workspace.terrain.lines[rowIndex++];
      trialRowInterval(
        currentLine,
        renderCamera,
        workspace.terrain,
        terrainProfile.height,
        visible,
        interval,
        heightScratch,
      );
      trace = capture
        ? { y: currentLine.y, distance: currentLine.d, deltaS, start: interval.start, end: interval.end }
        : null;
      if (trace) rows.push(trace);
      return 0;
    },
    sampleSpan(pixels, offset, count, s, lateral, stepL) {
      if (s !== currentLine.s) throw new Error('Terrain row and sample order diverged');
      if (interval.end > interval.start)
        raster.sample(pixels, offset, count, interval.start, interval.end, lateral, stepL, spans, trace);
    },
  };
  return {
    render(target, vehicle, camera, playerKind, others = []) {
      const view = scene.session.view;
      const closed = scene.session.closedCarriageways;
      const { world, geometry, presentation } = view;
      if (view !== lastView || closed !== lastClosed) {
        const mapped = createCourseGeometryView(scene.history, 'retained');
        if (!mapped.ok) throw new Error(`Trial view failed: ${mapped.reason}`);
        spans = mapped.value.spans.map((span) => ({ ...span, source: bySection.get(span.occurrence.section) }));
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
      worldSprites.push(...others);
      renderCamera = createRenderSpaceCamera(world.height, camera);
      visible = computeForwardVisibleInterval(
        geometry,
        renderCamera.yaw,
        renderCamera.s,
        terrainProfile.dMin,
        terrainProfile.dMax,
      );
      rowIndex = 0;
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
        dictionaryBytes: pyramid.dictionaryBytes,
        directoryBytes: pyramid.directoryBytes,
        maximumIntervals: pyramid.maximumIntervals,
        sections: sources.map((source, index) => ({
          id: source.id,
          bandCount: source.bandCount,
          maximumActive: source.maximumActive,
          distributionMetres: source.distributionMetres,
          levels: pyramid.sections[index].levels.map(({ indices, ...level }) => ({
            ...level,
            buckets: indices.length,
          })),
        })),
        rows,
      };
    },
  };
}
