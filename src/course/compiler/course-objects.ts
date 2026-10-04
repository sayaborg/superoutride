import type { CoursePosition, SectionDocument } from '../course-document.js';
import type { CompiledBoundary } from '../course-boundaries.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import type { CourseObject } from '../course-objects.js';
import type { ProfileReader } from '../geometry/profile.js';
import { expandCourseElements, shiftedCoursePosition } from '../course-repeat.js';
import { resolveCourseLateral } from './course-lateral.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../image/sprite.js';
import type { CompiledCourseImageSource } from './course-image-source.js';

/**
 * The Section's solid sprites as objects, one per expanded placement with a body: its width, no wider than the image's
 * world width, from the road height plus `groundOffset` up the image's world height, and, for a movable body, its mass
 * and launch elevation. The image's size is read here once; a state-selected sign cannot be solid. Each object keeps
 * its placement's index among the expanded sprites, the identity appearance and race share.
 */
export function compileCourseSpriteObjects(
  section: SectionDocument,
  length: number,
  boundaries: ReadonlyMap<string, CompiledBoundary>,
  assets: ReadonlyMap<string, CompiledCourseImageSource>,
  height: ProfileReader,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  path: string,
): CourseObject[] {
  const objects: CourseObject[] = [];
  let sprite = -1;
  expandCourseElements(
    section.sprites,
    `${path}/sprites`,
    COURSE_DOCUMENT_LIMITS.spritePlacements * (2 * COURSE_DOCUMENT_LIMITS.repeatDepth + 1),
    (placement, offset, at) => {
      sprite += 1;
      const body = placement.body;
      if (body === null) return;
      requireCourse(
        placement.unselectedCarriagewayId === null,
        `${at}/body`,
        'A state-selected sign cannot be solid',
        'invalid_placement',
      );
      const asset = assets.get(placement.image);
      if (!asset || asset.kind !== 'sprite')
        throw new CourseInputError('unresolved_reference', `${at}/image`, 'Unknown sprite image');
      requireCourse(
        body.width <= asset.image.worldWidthMeters,
        `${at}/body/width`,
        'A solid width cannot exceed its image width',
        'invalid_placement',
      );
      const s = shiftedCoursePosition(resolve, offset, length)(placement.at, `${at}/at`).s;
      const bottom = height.sample(s) + placement.groundOffset;
      objects.push(
        Object.freeze({
          s,
          l: resolveCourseLateral(placement.lateral, s, boundaries, `${at}/lateral`),
          width: body.width,
          bottom,
          top: bottom + asset.image.height / SPRITE_SOURCE_TEXELS_PER_METER,
          sprite,
          movable: body.movable
            ? Object.freeze({ mass: body.movable.mass, launchRadians: (body.movable.launchDegrees * Math.PI) / 180 })
            : null,
        }),
      );
    },
  );
  return objects;
}
