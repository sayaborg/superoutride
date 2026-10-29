import { PNG } from 'pngjs';
import {
  readArray,
  readDocument,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
} from '../../src/core/admission.js';
import { contentDigest, SHA256_TEXT } from '../../src/core/content-digest.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import type { ContentStore } from '../authoring/content-store.js';
import { decodeSpritePng } from '../graphics/sprite-png.js';
import type { SpriteRaster } from '../graphics/sprite-layers.js';

export const GENERATION_DIRECTORY = 'public-picture-sources';
export const GENERATION_PROMPT =
  'Redraw this exact 1980s arcade sprite as a finely detailed high-resolution painted game asset. Preserve the silhouette, shape, proportions, colors, light direction, and all existing parts. Add detail inside the existing shape, not new objects. Do not add a background, ground plane, or cast shadow. Redraw lettering too. Keep the whole object visible, on transparent background. Smooth high-resolution detail, not pixel art.';

export function generationPrompt(description: string) {
  return `${GENERATION_PROMPT}\nObject: ${description}\n`;
}

/** Encoding is shared by the gallery and generation preparation, with nearest-neighbour enlargement only. */
export function picturePng(frame: SpriteRaster, palette: readonly number[], enlargement = 1): Uint8Array<ArrayBuffer> {
  const png = new PNG({ width: frame.width * enlargement, height: frame.height * enlargement });
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      const slot = frame.indices[Math.floor(y / enlargement) * frame.width + Math.floor(x / enlargement)]!;
      const { r, g, b } = unpackRgba(rgb555ToRgba(palette[slot] ?? 0));
      png.data.set([r, g, b, slot ? 255 : 0], (y * png.width + x) * 4);
    }
  return new Uint8Array(PNG.sync.write(png));
}

export function bodyDigest(frame: SpriteRaster, palette: readonly number[]) {
  return contentDigest(new TextEncoder().encode(JSON.stringify({ frame, palette })));
}

export function readGenerationRecord(value: unknown) {
  const doc = readDocument(
    value,
    ['format', 'version', 'picture', 'complete', 'attempts'],
    'superoutride.public-picture-generation',
    1,
  );
  if (doc.complete !== true) throw new RangeError('Only completed generation inputs may be built');
  const nullable = (v: unknown, p: string) => (v === null ? null : readString(v, p));
  const attempts = readArray(doc.attempts, '/attempts', (v, p) => {
    const a = readRecord(v, p, [
      'attempt',
      'savedAt',
      'prompt',
      'inputDigest',
      'bodyDigest',
      'generatedDigest',
      'model',
      'modelVersion',
      'reportedUsage',
      'calls',
    ]);
    requireAdmission(
      typeof a.prompt === 'string' && !!a.prompt.trim(),
      'invalid_shape',
      `${p}/prompt`,
      'Expected a nonempty prompt',
    );
    return Object.freeze({
      attempt: readNumber(a.attempt, `${p}/attempt`, { integer: true, min: 1, max: 3 }),
      savedAt: readString(a.savedAt, `${p}/savedAt`, { pattern: /^\d{4}-\d{2}-\d{2}T.*Z$/ }),
      prompt: a.prompt as string,
      inputDigest: readString(a.inputDigest, `${p}/inputDigest`, SHA256_TEXT),
      bodyDigest: readString(a.bodyDigest, `${p}/bodyDigest`, SHA256_TEXT),
      generatedDigest: readString(a.generatedDigest, `${p}/generatedDigest`, SHA256_TEXT),
      model: nullable(a.model, `${p}/model`),
      modelVersion: nullable(a.modelVersion, `${p}/modelVersion`),
      reportedUsage: nullable(a.reportedUsage, `${p}/reportedUsage`),
      calls: readNumber(a.calls, `${p}/calls`, { integer: true, min: 1, max: 1 }),
    });
  });
  if (!attempts.length || attempts.length > 3 || attempts.some((a, i) => a.attempt !== i + 1))
    throw new RangeError('Generation attempts must be consecutive, at most three');
  return Object.freeze({
    format: 'superoutride.public-picture-generation' as const,
    version: 1 as const,
    picture: readString(doc.picture, '/picture', { pattern: /^enduror-[0-9a-f]{5}$/ }),
    complete: true as const,
    attempts: Object.freeze(attempts),
  });
}

/** The completion record is the authority; interrupted PNG writes alone are not completed inputs. */
export async function readGeneratedSource(store: ContentStore, name: string) {
  const record = readGenerationRecord(
    JSON.parse(new TextDecoder().decode(await store.read(`${GENERATION_DIRECTORY}/${name}.json`))),
  );
  if (record.picture !== name) throw new RangeError('Generation record names another picture');
  const bytes = await store.read(`${GENERATION_DIRECTORY}/${name}.png`);
  if ((await contentDigest(bytes)) !== record.attempts.at(-1)!.generatedDigest)
    throw new RangeError('Generated image digest differs from its completion record');
  return { record, image: await decodeSpritePng(bytes, PNG) };
}
