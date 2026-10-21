import type { CoursePosition, SectionDocument, SpriteDocument } from '../course-document.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import type { CourseObject } from '../course-objects.js';
import type { ProfileReader } from '../geometry/profile.js';
import { expandCourseElements, expansionWork, shiftedCoursePosition } from '../course-repeat.js';
import { resolveCourseLateral } from './course-lateral.js';
import type { CourseLines } from '../course-lanes.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../image/sprite.js';
import type { CompiledCourseImageSource } from './course-image-source.js';

/**
 * One expanded sprite placement of a Section: its authored record, its document path, its resolved position and
 * lateral, and its image, a course image or a view set. Its index among the Section's placements is the sprite identity
 * race and appearance share.
 */
export interface CourseSpritePlacement {
  readonly source: SpriteDocument;
  readonly path: string;
  readonly at: CompiledCoursePosition;
  readonly l: number;
  readonly image: CompiledCourseImageSource & { readonly kind: 'sprite' | 'views' };
}

/**
 * The Section's sprites expanded once, in document order, within `spritePlacements`: the one list of placements, with
 * their identities and positions, that the object and appearance compilers read.
 */
export function compileCourseSpritePlacements(
  section: SectionDocument,
  length: number,
  lines: CourseLines,
  assets: ReadonlyMap<string, CompiledCourseImageSource>,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  path: string,
): readonly CourseSpritePlacement[] {
  const placements: CourseSpritePlacement[] = [];
  expandCourseElements(
    section.sprites,
    `${path}/sprites`,
    expansionWork(COURSE_DOCUMENT_LIMITS.spritePlacements * (2 * COURSE_DOCUMENT_LIMITS.repeatDepth + 1)),
    (source, offset, at) => {
      requireCourse(
        placements.length < COURSE_DOCUMENT_LIMITS.spritePlacements,
        at,
        'Expanded sprite placement limit exceeded',
        'resource_limit',
      );
      const image = assets.get(source.image);
      if (!image) throw new CourseInputError('unresolved_reference', `${at}/image`, 'Unknown course asset');
      if (image.kind !== 'sprite' && image.kind !== 'views')
        throw new CourseInputError('invalid_image_role', `${at}/image`, 'Sprites require sprite patterns');
      const position = shiftedCoursePosition(resolve, offset, length)(source.at, `${at}/at`);
      placements.push(
        Object.freeze({
          source,
          path: at,
          at: position,
          l: resolveCourseLateral(source.lateral, position.s, lines, `${at}/lateral`),
          image,
        }),
      );
    },
  );
  return Object.freeze(placements);
}

/**
 * The Section's solid sprites as objects, one per placement with a body: its width, no wider than the image's world
 * width, from the road height plus `groundOffset` up the image's world height, and, for a movable body, its mass and
 * launch elevation. The image's size is read here once; a state-selected sign cannot be solid, nor a board with views,
 * whose picture, and so whose size, changes with the view, nor a board extending sideways, which is for looks alone. Each object keeps its placement's index, the sprite
 * identity.
 */
export function compileCourseSpriteObjects(
  placements: readonly CourseSpritePlacement[],
  height: ProfileReader,
): CourseObject[] {
  const objects: CourseObject[] = [];
  placements.forEach(({ source, path, at, l, image }, sprite) => {
    const body = source.body;
    if (body === null) return;
    if (image.kind !== 'sprite')
      throw new CourseInputError('invalid_placement', `${path}/body`, 'A board with views cannot be solid');
    requireCourse(
      image.image.extend === undefined,
      `${path}/body`,
      'A board extending sideways cannot be solid',
      'invalid_placement',
    );
    requireCourse(
      source.unselectedLink === null,
      `${path}/body`,
      'A state-selected sign cannot be solid',
      'invalid_placement',
    );
    requireCourse(
      body.width <= image.image.worldWidthMeters,
      `${path}/body/width`,
      'A solid width cannot exceed its image width',
      'invalid_placement',
    );
    const bottom = height.sample(at.s) + source.groundOffset;
    objects.push(
      Object.freeze({
        s: at.s,
        l,
        width: body.width,
        bottom,
        top: bottom + image.image.height / SPRITE_SOURCE_TEXELS_PER_METER,
        sprite,
        movable: body.movable
          ? Object.freeze({ mass: body.movable.mass, launchRadians: (body.movable.launchDegrees * Math.PI) / 180 })
          : null,
      }),
    );
  });
  return objects;
}
