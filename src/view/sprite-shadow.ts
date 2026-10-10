import { selectSpriteLevel, type SpriteAsset, type SpriteFrame } from '../image/sprite.js';
import { levelScale } from './sprite.js';

/**
 * A shadow placed in one frame: its level's frame, where its texel grid starts on screen and its screen pixels per
 * texel, and the stretch of road `[sStart, sEnd]` it lies on.
 */
export interface PlacedShadow {
  frame: SpriteFrame;
  left: number;
  top: number;
  scale: number;
  sStart: number;
  sEnd: number;
}

/**
 * Place the shadow of `asset` with its anchor at (`xAnchor`, `yAnchor`), the projection of the road under the base point
 * at station `s`, drawn at `pixelsPerMeter` as the picture is, and lying on the road within `reach` of `s`; false
 * when the selected level has no shadow.
 */
export function placeShadow(
  asset: SpriteAsset,
  xAnchor: number,
  yAnchor: number,
  pixelsPerMeter: number,
  s: number,
  reach: number,
  out: PlacedShadow,
): boolean {
  const levelIndex = selectSpriteLevel(asset, pixelsPerMeter);
  const frame = asset.levels[levelIndex]!.shadow;
  if (!frame) return false;
  const scale = levelScale(pixelsPerMeter, levelIndex);
  out.frame = frame;
  out.scale = scale;
  out.left = xAnchor - scale * (frame.anchorX + 0.5);
  out.top = yAnchor - scale * (frame.anchorY + 0.5);
  out.sStart = s - reach;
  out.sEnd = s + reach;
  return true;
}

/** One ground row: its screen row and its chainage footprint `[sNear, sNear + deltaS]`. */
interface ShadowRow {
  readonly y: number;
  readonly sNear: number;
  readonly deltaS: number;
}

/**
 * The screen span `[start, end)` an interval `[a, b)` of texels takes on one axis: the pixels whose centres it holds
 * when it is at least a pixel long, else the pixel holding its centre, so no texel vanishes at a distance.
 */
function pixelSpan(a: number, b: number, out: { start: number; end: number }) {
  if (b - a >= 1) {
    out.start = Math.ceil(a - 0.5);
    out.end = Math.ceil(b - 0.5);
  } else {
    out.start = Math.floor((a + b) / 2);
    out.end = out.start + 1;
  }
  return out;
}

const span = { start: 0, end: 0 };

/**
 * The pixels of one ground row that shadows darken, written to `out` as ascending, disjoint `[start, end)` pixel
 * pairs within `[0, width)`. A shadow lies only on the ground rows whose footprint meets its stretch of road; there its
 * texel rows and runs of opaque texels take the pixels `pixelSpan` gives them.
 */
export function shadowRowSpans(
  row: ShadowRow,
  shadows: readonly PlacedShadow[],
  width: number,
  out: number[],
): number[] {
  out.length = 0;
  const sFar = row.sNear + row.deltaS;
  for (let i = 0; i < shadows.length; i++) {
    const { frame, left, top, scale, sStart, sEnd } = shadows[i]!;
    if (row.sNear > sEnd || sFar < sStart) continue;
    // The texel rows near this screen row; each takes the rows of its own span.
    const first = Math.max(0, Math.floor((row.y - top) / scale) - 1),
      last = Math.min(frame.height - 1, Math.floor((row.y + 1 - top) / scale) + 1);
    for (let j = first; j <= last; j++) {
      pixelSpan(top + j * scale, top + (j + 1) * scale, span);
      if (row.y < span.start || row.y >= span.end) continue;
      const base = j * frame.width;
      for (let x = 0; x < frame.width;) {
        if (!frame.pattern.indexAt(base + x)) {
          x++;
          continue;
        }
        const runStart = x;
        while (x < frame.width && frame.pattern.indexAt(base + x)) x++;
        pixelSpan(left + runStart * scale, left + x * scale, span);
        const start = Math.max(0, span.start),
          end = Math.min(width, span.end);
        if (start < end) out.push(start, end);
      }
    }
  }
  return mergeSpans(out);
}

/** Sort `[start, end)` pairs by start and join the ones that overlap or touch, in place. */
function mergeSpans(spans: number[]): number[] {
  for (let i = 2; i < spans.length; i += 2) {
    const start = spans[i]!,
      end = spans[i + 1]!;
    let j = i;
    for (; j > 0 && spans[j - 2]! > start; j -= 2) {
      spans[j] = spans[j - 2]!;
      spans[j + 1] = spans[j - 1]!;
    }
    spans[j] = start;
    spans[j + 1] = end;
  }
  let count = 0;
  for (let i = 0; i < spans.length; i += 2) {
    if (count > 0 && spans[i]! <= spans[count - 1]!) spans[count - 1] = Math.max(spans[count - 1]!, spans[i + 1]!);
    else {
      spans[count++] = spans[i]!;
      spans[count++] = spans[i + 1]!;
    }
  }
  spans.length = count;
  return spans;
}
