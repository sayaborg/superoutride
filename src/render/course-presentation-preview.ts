import type { HeightProfileReader } from '../core/height-profile.js';
import type { RasterGeometry } from '../core/raster-coordinate-reader.js';
import { createCourseGroundSource } from '../groundmap/course-ground-source.js';
import { rgb555ToRgba } from '../graphics/rgb555.js';
import { readSpriteLodAsset, type SpriteLodDocument } from '../graphics/sprite.js';
import { SoftwareSurface } from '../graphics/software-surface.js';
import type { CoursePresentation } from '../visual/course-presentation.js';
import { VisualProfile } from '../visual/visual-profile.js';
import { compileCourseSprite } from './course-sprite.js';

/** Offline level-zero presentation from ordinary saved facets; image workspaces are shared per preview. */
export function createCoursePresentationPreview() {
  // Decoded preview workspaces are borrowed read-only. Canonical saved sources remain immutable.
  const images = new Map<SpriteLodDocument, ReturnType<typeof readSpriteLodAsset>>();
  const backgroundSurfaces = new Map<SpriteLodDocument, SoftwareSurface>();
  const image = (source: SpriteLodDocument) => {
    let decoded = images.get(source);
    if (!decoded) {
      decoded = readSpriteLodAsset(source);
      images.set(source, decoded);
    }
    return decoded;
  };
  const createSource = (p: CoursePresentation, geometry: RasterGeometry, height: HeightProfileReader) => {
    if (!p || !p.ground || !Array.isArray(p.environments) || !Array.isArray(p.scenery) || !geometry?.raster || !height)
      throw new TypeError('Presentation preview requires compiled content, Raster and height readers');
    if (p.ground.partition.length !== geometry.length || height.courseLength !== geometry.length)
      throw new RangeError('Presentation preview facets must share their source ruler');
    const ground = createCourseGroundSource(p.ground);
    const base = (color: number | null) =>
      color === null ? ({ kind: 'transparent' } as const) : ({ kind: 'color', color: rgb555ToRgba(color) } as const);
    return Object.freeze({
      ground: Object.freeze({
        domain: ground.domain,
        sample(s: number, l: number) {
          return rgb555ToRgba(ground.sample(s, l));
        },
        sampleInChart(s: number, l: number, sourceLateralOrigin: number) {
          return rgb555ToRgba(ground.sampleInChart(s, l, sourceLateralOrigin));
        },
      }),
      visual: new VisualProfile(
        geometry.length,
        p.environments.map((e) => ({
          sStart: e.anchor.s,
          name: e.name,
          groundBaseLeft: base(e.groundBaseLeft),
          groundBaseRight: base(e.groundBaseRight),
        })),
      ),
      backgrounds: Object.freeze(
        p.environments.map((e) => {
          const source = e.background.asset.source;
          let surface = backgroundSurfaces.get(source);
          if (!surface) {
            const decoded = image(source);
            surface = new SoftwareSurface(decoded.width, decoded.height);
            surface.pixels.set(decoded.levels[0]!.pixels);
            backgroundSurfaces.set(source, surface);
          }
          return Object.freeze({
            surface,
            sourceHorizonY: e.background.horizonY,
            pixelsPerRadian: e.background.pixelsPerRadian,
            yawOriginRadians: e.background.yawOriginRadians,
          });
        }),
      ),
      sprites: Object.freeze(
        p.scenery.map((placement) =>
          Object.freeze({
            l: placement.l,
            unselected: placement.unselected,
            sprite: Object.freeze(
              compileCourseSprite(geometry, height, {
                name: placement.instance.id,
                s: placement.anchor.s,
                l: placement.l,
                groundOffset: placement.groundOffset,
                asset: image(placement.instance.asset.source),
              }),
            ),
          }),
        ),
      ),
    });
  };
  return Object.freeze({ createSource });
}
