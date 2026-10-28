import {
  readBoolean,
  readDictionary,
  readDocument,
  readEnum,
  readNumber,
  readRecord,
  readString,
} from '../../src/core/admission.js';

export const PUBLIC_TABLE_PATH = 'public-pictures/enduro-racer.json';
export const DITHERS = ['none', 'ordered', 'diffusion'] as const;

/** Public-only authoring settings; null inherits the current original. Anchors use source texel centres. */
export function readPublicPictureTable(value: unknown) {
  const doc = readDocument(value, ['format', 'version', 'dither', 'pictures'], 'superoutride.public-pictures', 1);
  const optionalNumber = (value: unknown, path: string, min = 0) =>
    value === null ? null : readNumber(value, path, { min });
  const pictures = readDictionary(doc.pictures, '/pictures', (value, path) => {
    const p = readRecord(value, path, [
      'name',
      'description',
      'height',
      'collisionWidth',
      'anchor',
      'anchorHeight',
      'shadow',
      'dither',
      'reason',
    ]);
    const anchor = p.anchor === null ? null : readRecord(p.anchor, `${path}/anchor`, ['x', 'y']);
    return Object.freeze({
      name: readString(p.name, `${path}/name`, { pattern: /^public-enduror-[0-9a-f]{5}$/ }),
      description: readString(p.description, `${path}/description`),
      height: p.height === null ? null : readNumber(p.height, `${path}/height`, { min: 0, exclusiveMin: true }),
      collisionWidth:
        p.collisionWidth === null
          ? null
          : readNumber(p.collisionWidth, `${path}/collisionWidth`, { min: 0, exclusiveMin: true }),
      anchor:
        anchor === null
          ? null
          : Object.freeze({ x: readNumber(anchor.x, `${path}/anchor/x`), y: readNumber(anchor.y, `${path}/anchor/y`) }),
      anchorHeight: optionalNumber(p.anchorHeight, `${path}/anchorHeight`),
      shadow: p.shadow === null ? null : readBoolean(p.shadow, `${path}/shadow`),
      dither: p.dither === null ? null : readEnum(p.dither, DITHERS, `${path}/dither`),
      reason: readString(p.reason, `${path}/reason`),
    });
  });
  const names = new Set<string>();
  for (const [name, picture] of Object.entries(pictures)) {
    if (!/^enduror-[0-9a-f]{5}$/.test(name) || names.has(picture.name))
      throw new RangeError('Public picture names must be unique canonical ENDURO RACER names');
    names.add(picture.name);
  }
  return Object.freeze({ dither: readEnum(doc.dither, DITHERS, '/dither'), pictures: Object.freeze(pictures) });
}
export type PublicPictureTable = ReturnType<typeof readPublicPictureTable>;
export type PublicPictureSettings = PublicPictureTable['pictures'][string];
