import { createHash } from 'node:crypto';
import { compileCourseImageSources } from '../../dist/compiler/course-image-source.js';
import { compileSpriteLod } from '../../dist/graphics/sprite-lod-compiler.js';
import { readCourseDocument } from '../../dist/course/course-document.js';

/** Build-only image compilation; derived course references bind the exact delivered LOD bytes. */
export async function compileCourseImages(document, inputs) {
  const admitted = await compileCourseImageSources(document.assets, inputs);
  if (!admitted.ok) throw new Error(JSON.stringify(admitted.diagnostics));
  const sceneryIds = new Set(document.sceneryInstances.map((instance) => instance.assetId));
  const groundIds = new Set();
  for (const section of document.sections) {
    const presentation = section.presentation;
    if (!presentation) continue;
    for (const row of presentation.sceneryRows) sceneryIds.add(row.assetId);
    if (presentation.ground.kind !== 'resident') continue;
    for (const region of presentation.ground.regions)
      for (const slice of region.sections) if (slice.paint) groundIds.add(slice.paint.assetId);
    for (const stamp of presentation.ground.stamps) groundIds.add(stamp.assetId);
  }
  const original = new Map(inputs.map((input) => [input.sha256, input]));
  const products = new Map(),
    cache = new Map();
  const assets = admitted.value.map((asset) => {
    let input = original.get(asset.sha256);
    if (sceneryIds.has(asset.id)) {
      if (groundIds.has(asset.id))
        throw new RangeError('A ground master and a sprite pyramid require separate image identities');
      if (asset.source.format !== 'superoutride.sprite-lod') throw new RangeError('Scenery requires a sprite master');
      if (!cache.has(asset.sha256)) {
        const product = compileSpriteLod(asset.source);
        const bytes = Buffer.from(JSON.stringify(product) + '\n');
        cache.set(asset.sha256, { sha256: createHash('sha256').update(bytes).digest('hex'), bytes });
      }
      input = cache.get(asset.sha256);
    }
    products.set(input.sha256, input);
    return { id: asset.id, format: asset.format, version: asset.version, sha256: input.sha256 };
  });
  const derived = readCourseDocument({ ...document, assets });
  if (!derived.ok) throw new Error(JSON.stringify(derived.diagnostics));
  return { document: derived.value, images: [...products.values()] };
}
