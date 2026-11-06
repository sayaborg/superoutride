/**
 * A passage ([Things of several pieces](../../../docs/original-road-data.md#things-of-several-pieces)): one picture a
 * vehicle passes through, laid again at equal steps along a stretch, so fine that the eye at the player's height sees
 * nothing through them (K, 2026-11-06), as an original's tunnel or bridge it draws as one face.
 */
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { RENDER_NEAR_DEPTH_METERS } from '../../../src/view/camera.js';
import { contractUnmet } from './conversion-errors.js';

/** A picture: its pixels row by row, 0 clear. */
export interface PassagePicture {
  readonly width: number;
  readonly height: number;
  readonly pixels: ArrayLike<number>;
}

/**
 * The steps of a passage `span` metres long of `picture`, its base point `x` pixels from its left and `base` above its
 * bottom edge, a pixel `up` metres high, its opening `half` pixels either side of its base point (where its walls let a
 * vehicle pass): in each of the opening's columns, its edge's height above the eye (`g`, its first colored row up from
 * the ground less the camera's height above the road), the colored rows above that edge (`t`, metres) and the nearest
 * depth at which the edge is on the screen (`D`: the near plane's, or where the edge meets the screen's top, g × f ÷ the
 * horizon's row); a step at most t × D ÷ g, so that the edge of one picture is hidden by the next's before the eye could
 * see between them (an edge at or below the eye hides what lies past it); the passage's steps the fewest of equal length at most the least of them. A board is drawn at its
 * base point's depth, so the vehicle's heading and lateral do not enter. With the column that sets it.
 */
export function passageSteps(
  picture: PassagePicture,
  point: { readonly x: number; readonly base: number; readonly half: number },
  up: number,
  span: number,
) {
  const { width, height, pixels } = picture;
  const { base } = point;
  const at = (x: number, rowFromBottom: number) => pixels[(height - 1 - rowFromBottom) * width + x] !== 0;
  const [first, last] = [Math.ceil(point.x - point.half - 0.5), Math.floor(point.x + point.half - 0.5)];
  if (first < 0 || last >= width) throw contractUnmet("A passage's opening is wider than its picture");
  let least: { d: number; g: number; t: number; D: number; column: number } | undefined;
  for (let x = first; x <= last; x++) {
    let edge = 0;
    while (edge < height && !at(x, edge)) edge++;
    if (edge === height) throw contractUnmet(`A passage's picture shows nothing over its opening's column ${x}`);
    let thick = edge;
    while (thick < height && at(x, thick)) thick++;
    const g = (edge - base) * up - CAMERA_DEFINITION.height;
    // An edge at or below the eye hides what lies past it: the nearer picture covers every ray up to its top.
    if (g <= 0) continue;
    const t = (thick - edge) * up;
    const D = Math.max(RENDER_NEAR_DEPTH_METERS, (g * CAMERA_DEFINITION.focalLength) / CAMERA_DEFINITION.horizonRow);
    const d = (t * D) / g;
    if (!least || d < least.d) least = { d, g, t, D, column: x };
  }
  if (!least) throw contractUnmet("A passage's opening's edge is nowhere above the eye");
  const steps = Math.ceil(span / least.d);
  return { ...least, steps, step: span / steps, boards: steps + 1 };
}
