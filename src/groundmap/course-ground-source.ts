import { courseBandAt } from '../course/course-bands.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../graphics/sprite.js';
import type { CourseGroundSourceData, CoursePaint } from '../visual/course-presentation.js';

const repeat = (value: number, period: number) => ((value % period) + period) % period;

function color(source: SpriteLodDocument, x: number, y: number, palette = source.levels[0]!.paletteRgb555) {
  const index = source.levels[0]!.indices[y * source.width + x]!;
  return index === 0 ? null : palette[index - 1]!;
}

function samplePaint(paint: CoursePaint, s: number, l: number, sourceLateralOrigin: number) {
  const source = paint.asset.source,
    density = SPRITE_SOURCE_TEXELS_PER_METER;
  const phaseL = paint.phaseL - sourceLateralOrigin;
  const x = repeat(Math.floor((l - phaseL) * density), source.width),
    y = repeat(Math.floor((s - paint.phaseS) * density), source.height);
  const alternate = paint.alternate;
  const useB =
    alternate &&
    (repeat(Math.floor((s - paint.phaseS) / alternate.spanS), 2) +
      repeat(Math.floor((l - phaseL) / alternate.spanL), 2)) %
      2 !==
      0;
  return color(source, x, y, useB ? alternate.paletteRgb555 : undefined);
}

/** Offline/preview RGB555 point field over compiled immutable data; no completed-ground reads or filtering. */
export function createCourseGroundSource(data: CourseGroundSourceData) {
  if (!data || !data.partition || !Array.isArray(data.bands) || !Array.isArray(data.stamps))
    throw new TypeError('Ground source requires compiled composition data');
  const bindings = new Map(data.bands.map((binding) => [binding.band, binding]));
  const sampleInChart = (s: number, l: number, sourceLateralOrigin: number): number => {
    if (typeof s !== 'number' || typeof l !== 'number' || typeof sourceLateralOrigin !== 'number')
      throw new TypeError('Ground coordinates and origin must be numeric');
    if (
      !Number.isFinite(s) ||
      !Number.isFinite(l) ||
      !Number.isFinite(sourceLateralOrigin) ||
      s < 0 ||
      s > data.partition.length ||
      l < -data.left - sourceLateralOrigin ||
      l >= data.right - sourceLateralOrigin
    )
      throw new RangeError('Ground query must be inside its finite half-open strip');
    let result = data.baseRgb555;
    const band = courseBandAt(data.partition, s, l, sourceLateralOrigin);
    if (band) {
      const binding = bindings.get(band);
      if (!binding) throw new Error('Compiled Band has no appearance binding');
      let index = 0;
      while (index + 1 < binding.sections.length && binding.sections[index + 1]!.anchor.s <= s) index += 1;
      const paint = binding.sections[index]!.paint;
      if (paint) result = samplePaint(paint, s, l, sourceLateralOrigin) ?? result;
    }
    for (const stamp of data.stamps) {
      const source = stamp.asset.source;
      const x = Math.floor(
          l * SPRITE_SOURCE_TEXELS_PER_METER - (stamp.gridL - sourceLateralOrigin * SPRITE_SOURCE_TEXELS_PER_METER),
        ),
        y = Math.floor(s * SPRITE_SOURCE_TEXELS_PER_METER - stamp.gridS);
      if (x >= 0 && x < source.width && y >= 0 && y < source.height) result = color(source, x, y) ?? result;
    }
    return result;
  };
  return Object.freeze({
    domain: Object.freeze({ start: 0, end: data.partition.length, left: -data.left, right: data.right }),
    sample: (s: number, l: number) => sampleInChart(s, l, 0),
    sampleInChart,
  });
}
