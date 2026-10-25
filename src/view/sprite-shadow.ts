import { selectSpriteLevel, type SpriteAsset, type SpriteFrame } from '../image/sprite.js';
import { levelScale } from './sprite.js';

/**
 * Where a picture lying on the ground lies in one frame: its anchor's depth and screen row, and the depths of the ground
 * it lies on, `[dNear, dFar]`: the terrain rows facing the camera on from its anchor, nearer to the first facing away
 * and farther to the first facing away (a crest). Its rows on and above its anchor's screen row lie on the farther of
 * that ground, those below on the nearer; a row with no such ground is not drawn.
 */
export interface GroundPlace {
  d: number;
  row: number;
  dNear: number;
  dFar: number;
}

/** A terrain row as a ground picture reads it: its screen row, depth and whether it faces away from the camera. */
interface GroundRow {
  readonly y: number;
  readonly d: number;
  readonly away: boolean;
}

/**
 * The ground a picture anchored at depth `d` on screen row `y` lies on (`GroundPlace`), among `terrain`'s rows far to
 * near.
 */
export function placeOnGround(terrain: readonly GroundRow[], d: number, y: number, out: GroundPlace): GroundPlace {
  out.d = out.dNear = out.dFar = d;
  out.row = Math.floor(y);
  // The first row nearer than the anchor, by halving: the rows' depths fall from far to near.
  let [lo, hi] = [0, terrain.length];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (terrain[mid]!.d < d) hi = mid;
    else lo = mid + 1;
  }
  for (let i = lo - 1; i >= 0 && !terrain[i]!.away; i--) out.dFar = terrain[i]!.d;
  for (let i = lo; i < terrain.length && !terrain[i]!.away; i++) out.dNear = terrain[i]!.d;
  return out;
}

/** Whether a ground picture placed at `place` lies on the terrain row at screen row `y` and depth `d`. */
export function liesOn(place: GroundPlace, y: number, d: number): boolean {
  if (d > place.dFar || d < place.dNear) return false;
  return y <= place.row ? d >= place.d : d <= place.d;
}

/**
 * A shadow placed in one frame: its level's frame, where its texel grid starts on screen and its screen pixels per
 * texel, and the ground it lies on.
 */
export interface PlacedShadow extends GroundPlace {
  frame: SpriteFrame;
  left: number;
  top: number;
  scale: number;
}

/**
 * Place the shadow of `asset` with its anchor at (`xAnchor`, `yAnchor`) at depth `d`, drawn at `pixelsPerMeter` as the
 * picture is, lying on the ground of `terrain` about it; false when the selected level has no shadow.
 */
export function placeShadow(
  asset: SpriteAsset,
  xAnchor: number,
  yAnchor: number,
  pixelsPerMeter: number,
  d: number,
  terrain: readonly GroundRow[],
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
  placeOnGround(terrain, d, yAnchor, out);
  return true;
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
 * pairs within `[0, width)`. A shadow lies only on the ground rows it lies on (`liesOn`); there its texel rows and runs
 * of opaque texels take the pixels `pixelSpan` gives them.
 */
export function shadowRowSpans(
  row: GroundRow,
  shadows: readonly PlacedShadow[],
  width: number,
  out: number[],
): number[] {
  out.length = 0;
  for (let i = 0; i < shadows.length; i++) {
    const shadow = shadows[i]!;
    if (!liesOn(shadow, row.y, row.d)) continue;
    const { frame, left, top, scale } = shadow;
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
