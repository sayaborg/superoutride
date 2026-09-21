import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { createRevisedBandTrialScene } from './band-revised-scene.mjs';

const boundary = (a, b, left, right = left) => ({
  knots: [
    { anchor: { s: a }, l: left },
    { anchor: { s: b }, l: right },
  ],
});

/** Synthetic paint on real compiled scene geometry, rendered after all measurement. Never saved as course content. */
export async function renderBandEvidenceStill(scene, course, assets, target, vehicle, camera, others) {
  const view = createCourseGeometryView(scene.history, 'retained');
  if (!view.ok) throw new Error(`Evidence view failed: ${view.reason}`);
  const extra = new Map(),
    placements = [];
  for (const [kind, distance] of [
    ['arrow', 60],
    ['cliff', 125],
  ]) {
    const s = camera.s + distance;
    const span = view.value.spans.find((value) => s >= value.frameStart && s < value.frameEnd);
    if (!span) continue;
    const station = span.sourceChainageInFrame(s),
      center = span.sourceLateralOrigin - (kind === 'arrow' ? 3 : 0);
    const start = Math.max(span.sourceRange.start, station - (kind === 'cliff' ? 60 : 12)),
      end = Math.min(span.sourceRange.end, station + (kind === 'cliff' ? 60 : 12));
    if (!(end > start)) continue;
    const section = span.occurrence.section,
      bands = extra.get(section) ?? [];
    if (kind === 'arrow') {
      const mid = start + (end - start) / 2;
      bands.push({
        start,
        end: mid,
        left: boundary(start, mid, center - 0.7),
        right: boundary(start, mid, center + 0.7),
        color: 32767,
      });
      bands.push({
        start: mid,
        end,
        left: boundary(mid, end, center - 3, center),
        right: boundary(mid, end, center + 3, center),
        color: 32767,
      });
    } else
      bands.push({
        start,
        end,
        left: boundary(start, end, center + 1.5),
        right: boundary(start, end, center + 24),
        color: null,
        openRight: true,
      });
    extra.set(section, bands);
    placements.push({ kind, distance, section: section.id, start, end, center });
  }
  if (placements.length !== 2) throw new Error('Evidence camera has insufficient owned lookahead for arrow and cliff');
  const trial = await createRevisedBandTrialScene(scene, course, assets, extra);
  trial.render(target, vehicle, camera, 'car', others);
  return {
    scope: 'Synthetic arrow and cliff on current real-course geometry; not authored product content',
    placements,
  };
}
