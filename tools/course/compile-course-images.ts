import { expandCourseElements } from '../../src/course/course-repeat.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import type { CourseDocument } from '../../src/course/course-document.js';
import type { CourseAssetBytes } from '../../src/course/compiler/course-image-source.js';
import { createHash } from 'node:crypto';
import { compileCourseImageSources } from '../../src/course/compiler/course-image-source.js';
import { compileSpriteLod } from '../graphics/sprite-lod-compiler.js';

/** Build-only image compilation; derived course references bind the exact delivered LOD bytes. */
export async function compileCourseImages(document: CourseDocument, inputs: readonly CourseAssetBytes[]) {
  const admitted = await compileCourseImageSources(document.assets, inputs);
  if (!admitted.ok) throw new Error(JSON.stringify(admitted.diagnostics));
  const spriteIds = new Set<string>();
  for (const section of document.sections)
    expandCourseElements(
      section.sprites,
      '/sprites',
      COURSE_DOCUMENT_LIMITS.spritePlacements * (2 * COURSE_DOCUMENT_LIMITS.repeatDepth + 1),
      (sprite) => {
        spriteIds.add(sprite.image);
      },
    );
  const original = new Map(inputs.map((input) => [input.sha256, input]));
  const products = new Map<string, CourseAssetBytes>(),
    cache = new Map<string, CourseAssetBytes>();
  const assets = admitted.value.map((asset) => {
    let input = original.get(asset.sha256)!;
    if (spriteIds.has(asset.id)) {
      if (asset.source.format !== 'superoutride.sprite-lod') throw new RangeError('Sprites require a sprite master');
      if (!cache.has(asset.sha256)) {
        const product = compileSpriteLod(asset.source);
        const bytes = Buffer.from(JSON.stringify(product) + '\n');
        cache.set(asset.sha256, { sha256: createHash('sha256').update(bytes).digest('hex'), bytes });
      }
      input = cache.get(asset.sha256)!;
    }
    products.set(input.sha256, input);
    return Object.freeze({ id: asset.id, sha256: input.sha256 });
  });
  // Only asset digests change: the replacements are this tool's own products, so the admitted document stays admitted.
  const derived: CourseDocument = Object.freeze({ ...document, assets: Object.freeze(assets) });
  return { document: derived, images: [...products.values()] };
}
