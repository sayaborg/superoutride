import type { RasterGeometry } from '../core/raster-coordinate-reader.js';
import type { HeightProfileReader } from '../core/height-profile.js';
import { pseudoDepth, pseudoProject, type PseudoCamera, type PseudoProjection } from '../core/projection.js';
import { rasterCoordinateToWorld } from '../core/raster-coordinate-reader.js';
import type { SpriteAsset } from '../graphics/sprite.js';
import { transformPlanarPoint, type PlanarTransform } from '../core/planar-transform.js';
import { wrapAngle } from '../core/math.js';

export interface CourseSpriteAuthoring {
  name: string;
  s: number;
  l: number;
  groundOffset?: number;
  y?: number;
  asset: SpriteAsset;
}

export interface CourseSprite {
  name: string;
  x: number;
  y: number;
  z: number;
  sRender: number;
  asset: SpriteAsset;
}

export interface VisibleCourseSprite extends CourseSprite {
  d: number;
  projection: PseudoProjection;
}

/** Ordinary observed reader; neither topology nor a source graph enters the renderer. */
interface CourseSpriteReader {
  visible(camera: PseudoCamera, dStart: number, dEnd: number): readonly VisibleCourseSprite[];
}
export type CourseSpriteSource = readonly CourseSprite[] | CourseSpriteReader;

export function compileCourseSprite(
  guide: RasterGeometry,
  height: HeightProfileReader,
  source: CourseSpriteAuthoring,
): CourseSprite {
  const plan = rasterCoordinateToWorld(guide.raster, source.s, source.l);
  const y = source.y ?? height.sampleRender(source.s).y + (source.groundOffset ?? 0);
  return {
    name: source.name,
    x: plan.x,
    y,
    z: plan.z,
    sRender: plan.s,
    asset: source.asset,
  };
}

export function collectVisibleCourseSprites(
  sprites: CourseSpriteSource,
  camera: PseudoCamera,
  dStart: number,
  dEnd: number,
): readonly VisibleCourseSprite[] {
  if ('visible' in sprites) return sprites.visible(camera, dStart, dEnd);
  const visible: VisibleCourseSprite[] = [];
  for (const sprite of sprites) {
    const d = pseudoDepth(sprite.sRender, camera.s);
    if (d < dStart || d > dEnd) continue;
    const projection = pseudoProject({ x: sprite.x, y: sprite.y, z: sprite.z, s: sprite.sRender }, camera);
    visible.push({ ...sprite, d, projection });
  }
  visible.sort((a, b) => b.d - a.d);
  return visible;
}

const cameraFields = ['x', 'y', 'z', 'yaw', 'pitch', 's', 'focalLength', 'centerX', 'centerY'] as const;

function observe(camera: PseudoCamera, dStart: number, dEnd: number, sprites: readonly VisibleCourseSprite[]) {
  const values = Object.freeze(
    sprites.map((sprite) => {
      if (
        ![sprite.x, sprite.y, sprite.z, sprite.sRender, ...Object.values(sprite.projection)].every(Number.isFinite) ||
        sprite.sRender <= camera.s
      )
        throw new RangeError('Sprite observation must retain finite forward positions and projection');
      return Object.freeze(sprite);
    }),
  );
  return Object.freeze({
    camera,
    dStart,
    dEnd,
    sprites: values,
    visible(query: PseudoCamera, start: number, end: number) {
      if (
        !query ||
        cameraFields.some((key) => typeof query[key] !== 'number') ||
        typeof start !== 'number' ||
        typeof end !== 'number'
      )
        throw new TypeError('Sprite observation needs a numeric camera');
      if (start !== dStart || end !== dEnd || cameraFields.some((key) => query[key] !== camera[key]))
        throw new RangeError('Sprite observation does not cover a different physical camera or depth interval');
      return values;
    },
  });
}

/** Snapshot screen observations once. Decoded image workspaces are borrowed read-only, not copied per view. */
export function createCourseSpriteObservation(
  sprites: readonly CourseSprite[],
  camera: PseudoCamera,
  dStart: number,
  dEnd: number,
) {
  if (
    !Array.isArray(sprites) ||
    !camera ||
    cameraFields.some((key) => typeof camera[key] !== 'number') ||
    typeof dStart !== 'number' ||
    typeof dEnd !== 'number'
  )
    throw new TypeError('Sprite observation requires an array, numeric camera and depth interval');
  if (
    ![...cameraFields.map((key) => camera[key]), dStart, dEnd].every(Number.isFinite) ||
    camera.focalLength <= 0 ||
    dStart <= 0 ||
    dEnd < dStart
  )
    throw new RangeError('Sprite observation needs a finite forward depth interval and camera');
  for (const sprite of sprites) {
    if (!sprite || !sprite.asset || [sprite.x, sprite.y, sprite.z, sprite.sRender].some((v) => typeof v !== 'number'))
      throw new TypeError('Sprite observations require compiled sprite positions and assets');
    if (![sprite.x, sprite.y, sprite.z, sprite.sRender].every(Number.isFinite))
      throw new RangeError('Sprite observation positions must be finite');
  }
  const ownedCamera: PseudoCamera = Object.freeze({
    x: camera.x,
    y: camera.y,
    z: camera.z,
    yaw: camera.yaw,
    pitch: camera.pitch,
    s: camera.s,
    focalLength: camera.focalLength,
    centerX: camera.centerX,
    centerY: camera.centerY,
  });
  return observe(
    ownedCamera,
    dStart,
    dEnd,
    collectVisibleCourseSprites(sprites, ownedCamera, dStart, dEnd).map((sprite) => ({
      ...sprite,
      projection: Object.freeze(sprite.projection),
    })),
  );
}

/** A pure basis/ruler change preserves depth and screen projection; it is not another physical observation. */
export function reframeCourseSpriteObservation(
  observation: ReturnType<typeof createCourseSpriteObservation>,
  transform: PlanarTransform,
  sourceAnchorS: number,
  destinationAnchorS: number,
) {
  if (
    !observation ||
    !observation.camera ||
    !Array.isArray(observation.sprites) ||
    !transform ||
    !transform.translation ||
    [transform.cosine, transform.sine, transform.translation.x, transform.translation.z].some(
      (value) => typeof value !== 'number',
    ) ||
    typeof sourceAnchorS !== 'number' ||
    typeof destinationAnchorS !== 'number'
  )
    throw new TypeError('Reframing requires a sprite observation and numeric ruler anchors');
  if (![sourceAnchorS, destinationAnchorS].every(Number.isFinite)) throw new RangeError('Ruler anchors must be finite');
  if (![transform.cosine, transform.sine, transform.translation.x, transform.translation.z].every(Number.isFinite))
    throw new RangeError('Compiled frame transform must be finite');
  const s = (value: number) => {
    const result = destinationAnchorS + (value - sourceAnchorS);
    if (!Number.isFinite(result)) throw new RangeError('Reframed sprite chainage must remain representable');
    return result;
  };
  const camera = Object.freeze({
    ...observation.camera,
    ...transformPlanarPoint(transform, observation.camera),
    yaw: wrapAngle(observation.camera.yaw + Math.atan2(transform.sine, transform.cosine)),
    s: s(observation.camera.s),
  });
  if (!cameraFields.every((key) => Number.isFinite(camera[key])))
    throw new RangeError('Reframed camera must remain representable');
  return observe(
    camera,
    observation.dStart,
    observation.dEnd,
    observation.sprites.map((sprite) =>
      Object.freeze({
        ...sprite,
        ...transformPlanarPoint(transform, sprite),
        sRender: s(sprite.sRender),
      }),
    ),
  );
}
