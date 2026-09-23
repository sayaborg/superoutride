import type { CourseDocument } from '../../src/course/course-document.js';
import type { CourseAssetBytes } from '../../src/course/compiler/course-image-source.js';
import { createHash } from 'node:crypto';
import { compileCourseImageSources } from '../../src/course/compiler/course-image-source.js';
import { compileSpriteLod } from '../../src/image/sprite-lod-compiler.js';
import { readCourseDocument } from '../../src/course/course-document.js';

/** Build-only image compilation; derived course references bind the exact delivered LOD bytes. */
export async function compileCourseImages(document: CourseDocument, inputs: readonly CourseAssetBytes[]) {
  const admitted = await compileCourseImageSources(document.assets, inputs);
  if (!admitted.ok) throw new Error(JSON.stringify(admitted.diagnostics));
  const sceneryIds = new Set(document.sceneryInstances.map((instance) => instance.assetId));
  for (const section of document.sections) {
    const presentation = section.presentation;
    if (!presentation) continue;
    for (const row of presentation.sceneryRows) sceneryIds.add(row.assetId);
  }
  const original = new Map(inputs.map((input) => [input.sha256, input]));
  const products = new Map<string, CourseAssetBytes>(),
    cache = new Map<string, CourseAssetBytes>();
  const assets = admitted.value.map((asset) => {
    let input = original.get(asset.sha256)!;
    if (sceneryIds.has(asset.id)) {
      if (asset.source.format !== 'superoutride.sprite-lod') throw new RangeError('Scenery requires a sprite master');
      if (!cache.has(asset.sha256)) {
        const product = compileSpriteLod(asset.source);
        const bytes = Buffer.from(JSON.stringify(product) + '\n');
        cache.set(asset.sha256, { sha256: createHash('sha256').update(bytes).digest('hex'), bytes });
      }
      input = cache.get(asset.sha256)!;
    }
    products.set(input.sha256, input);
    return { id: asset.id, format: asset.format, version: asset.version, sha256: input.sha256 };
  });
  const derived = readCourseDocument({ ...document, assets });
  if (!derived.ok) throw new Error(JSON.stringify(derived.diagnostics));
  return { document: derived.value, images: [...products.values()] };
}
