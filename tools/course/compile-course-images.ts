import { expandCourseElements } from '../../src/course/course-repeat.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import type { CourseDocument } from '../../src/course/course-document.js';
import type { CourseAssetBytes } from '../../src/course/compiler/course-image-source.js';
import { createHash } from 'node:crypto';
import { readCourseImageSources } from '../../src/course/compiler/course-image-source.js';
import { compileSpriteLod } from '../graphics/sprite-lod-compiler.js';
import { requireLoaded } from '../../src/content/content-load-error.js';

/**
 * Build-only image compilation; derived course references bind the exact delivered LOD bytes.
 * Only sprite masters are admitted here, each once; every other input passes through unchanged and
 * is admitted once with the delivered document.
 */
export async function compileCourseImages(document: CourseDocument, inputs: readonly CourseAssetBytes[]) {
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
  const spriteReferences = document.assets.filter((asset) => spriteIds.has(asset.id));
  const spriteDigests = new Set(spriteReferences.map((asset) => asset.sha256));
  const masters = requireLoaded(
    await readCourseImageSources(
      spriteReferences,
      inputs.filter((input) => spriteDigests.has(input.sha256)),
    ),
  );
  const lods = new Map<string, CourseAssetBytes>();
  for (const master of masters) {
    if (master.kind !== 'sprite') throw new RangeError('Sprites require a sprite master');
    if (lods.has(master.sha256)) continue;
    const bytes = Buffer.from(JSON.stringify(compileSpriteLod(master.document, [[]], master.image)) + '\n');
    lods.set(master.sha256, { sha256: createHash('sha256').update(bytes).digest('hex'), bytes });
  }
  const original = new Map(inputs.map((input) => [input.sha256, input]));
  const products = new Map<string, CourseAssetBytes>();
  const assets = document.assets.map((asset) => {
    const input = spriteIds.has(asset.id) ? lods.get(asset.sha256) : original.get(asset.sha256);
    if (input) products.set(input.sha256, input);
    return Object.freeze({ id: asset.id, sha256: input?.sha256 ?? asset.sha256 });
  });
  // Unreferenced inputs pass through so the delivered document's admission reports them.
  for (const input of inputs)
    if (!products.has(input.sha256) && !spriteDigests.has(input.sha256)) products.set(input.sha256, input);
  // Only asset digests change: the replacements are this tool's own products, so the admitted document stays admitted.
  const derived: CourseDocument = Object.freeze({ ...document, assets: Object.freeze(assets) });
  return { document: derived, images: [...products.values()] };
}
