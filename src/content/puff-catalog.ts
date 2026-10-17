import {
  admit,
  admitDomain,
  AdmissionError,
  DefinitionDomainError,
  deepFreeze,
  readArray,
  readDictionary,
  readDocument,
  readNumber,
  readRecord,
  readString,
  relativePointer,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import {
  readSpriteLodAsset,
  SPRITE_SOURCE_TEXELS_PER_METER,
  spriteLodLayout,
  type SpriteLodAsset,
} from '../image/sprite.js';
import type { ContentDelivery } from './content-delivery.js';
import { requireLoaded } from './content-load-error.js';
import { admitSingleDocument, type DocumentSource } from './document-catalog.js';

/** The single puff document's identifier: its file name and manifest ID. */
export const PUFFS_ID = 'default';
export const PUFFS_FORMAT = 'superoutride.puffs';
export const PUFFS_VERSION = 1;

/** How every puff of a kind moves, grows and ends ([Tire puffs](../../docs/tire-puffs.md)). */
export interface PuffMotion {
  /** The angle the tread turns past the contact patch before a puff leaves it, in degrees: [0, 90). */
  readonly releaseDegrees: number;
  /** The time constant of still air's hold on a puff, in seconds: positive. */
  readonly responseSeconds: number;
  /** The vertical speed a puff settles to, up positive, in m/s: finite. */
  readonly riseMps: number;
  /** A puff's diameter when it is thrown, in metres: positive. */
  readonly startDiameterMeters: number;
  /** How fast a puff's diameter grows, in m/s: at least 0. */
  readonly growthMps: number;
  /** A puff's life, in seconds: positive. */
  readonly lifeSeconds: number;
}

/** A kind of puff as its document writes it: its pictures by size, smallest first, each size's shapes by name. */
export interface PuffKindRecord extends PuffMotion {
  readonly pictures: readonly (readonly string[])[];
}

/** What one surface material throws: a kind and the palette its pictures take, and how many. */
export interface PuffSurfaceRecord {
  readonly kind: string;
  readonly palette: string;
  /** Metres a tire rolls on the surface per puff; null throws none for rolling. */
  readonly metersPerPuff: number | null;
  /** Joules of sliding work per puff; null throws none for sliding. */
  readonly joulesPerPuff: number | null;
}

/** The `superoutride.puffs` document: what the DEV export saves. */
export interface PuffDocument {
  readonly format: typeof PUFFS_FORMAT;
  readonly version: typeof PUFFS_VERSION;
  readonly kinds: Readonly<Record<string, PuffKindRecord>>;
  readonly surfaces: Readonly<Record<string, PuffSurfaceRecord>>;
}

/** One size of a kind's pictures: the diameter it shows (its pictures' width / 40) and its shapes. */
export interface PuffPictureSize {
  readonly diameterMeters: number;
  readonly shapes: readonly SpriteLodAsset[];
}

/** The admitted puffs: the document, its delivered SHA-256 and each kind's pictures by size, smallest first. */
export interface CompiledPuffs {
  readonly source: PuffDocument;
  readonly sha256: string;
  readonly pictures: Readonly<Record<string, readonly PuffPictureSize[]>>;
}

const MOTION_KEYS = [
  'releaseDegrees',
  'responseSeconds',
  'riseMps',
  'startDiameterMeters',
  'growthMps',
  'lifeSeconds',
] as const;

/** The one check of a kind's motion values, which admission and DEV share. */
export function checkPuffMotion(motion: PuffMotion): void {
  const { releaseDegrees, responseSeconds, riseMps, startDiameterMeters, growthMps, lifeSeconds } = motion;
  if (!(releaseDegrees >= 0 && releaseDegrees < 90))
    throw new DefinitionDomainError('releaseDegrees', 'releaseDegrees must lie in [0, 90)');
  for (const [field, value] of [
    ['responseSeconds', responseSeconds],
    ['startDiameterMeters', startDiameterMeters],
    ['lifeSeconds', lifeSeconds],
  ] as const)
    if (!(value > 0 && Number.isFinite(value)))
      throw new DefinitionDomainError(field, `${field} must be finite and > 0`);
  if (!Number.isFinite(riseMps)) throw new DefinitionDomainError('riseMps', 'riseMps must be finite');
  if (!(growthMps >= 0 && Number.isFinite(growthMps)))
    throw new DefinitionDomainError('growthMps', 'growthMps must be finite and >= 0');
}

/** The one check of a surface's amounts, which admission and DEV share: each positive and finite, or null. */
export function checkPuffAmounts(record: Pick<PuffSurfaceRecord, 'metersPerPuff' | 'joulesPerPuff'>): void {
  for (const field of ['metersPerPuff', 'joulesPerPuff'] as const) {
    const value = record[field];
    if (value !== null && !(value > 0 && Number.isFinite(value)))
      throw new DefinitionDomainError(field, `${field} must be finite and > 0, or null`);
  }
}

/** The picture names a puff document names, read leniently: only to find the images to admit with it. */
export function puffPictureNames(value: unknown): string[] {
  const names = new Set<string>();
  const kinds = (value as { kinds?: unknown } | null)?.kinds;
  if (kinds && typeof kinds === 'object')
    for (const kind of Object.values(kinds as Record<string, unknown>)) {
      const pictures = (kind as { pictures?: unknown } | null)?.pictures;
      if (Array.isArray(pictures))
        for (const size of pictures)
          if (Array.isArray(size)) for (const name of size) if (typeof name === 'string') names.add(name);
    }
  return [...names];
}

/** Admit a saved course image the puff document names, as its delivered or authored document `path`. */
export function admitPuffPicture(value: unknown, path: string): AdmissionResult<SpriteLodAsset> {
  return admit(path, () => readSpriteLodAsset(value));
}

/**
 * Admit the `superoutride.puffs` version 1 document against the material catalog's IDs and the admitted pictures it
 * names: exactly one record per material; each kind's sizes in increasing diameter, every shape of a size as wide as
 * the others and saved with every level; each surface's kind among the kinds and its palette in every picture of that
 * kind. `checkPuffMotion` and `checkPuffAmounts` alone validate the values.
 */
export function compilePuffDocument(
  value: unknown,
  path: string,
  sha256: string,
  materialIds: readonly string[],
  pictures: ReadonlyMap<string, SpriteLodAsset>,
): AdmissionResult<CompiledPuffs> {
  return admit(path, () => {
    const v = readDocument(value, ['format', 'version', 'kinds', 'surfaces'], PUFFS_FORMAT, PUFFS_VERSION);
    const sizes: Record<string, PuffPictureSize[]> = {};
    const kinds = readDictionary(v.kinds, '/kinds', (entry, at, name) => {
      const record = readRecord(entry, at, ['pictures', ...MOTION_KEYS]);
      const motion = Object.fromEntries(MOTION_KEYS.map((key) => [key, readNumber(record[key], `${at}/${key}`)]));
      admitDomain(
        () => checkPuffMotion(motion as unknown as PuffMotion),
        (field) => relativePointer(field, at),
      );
      const names = readArray(
        record.pictures,
        `${at}/pictures`,
        (size, sizeAt) => readArray(size, sizeAt, (shape, shapeAt) => readString(shape, shapeAt), { min: 1 }),
        { min: 1 },
      );
      sizes[name] = names.map((shapes, k) => {
        const resolved = shapes.map((shape, j) => {
          const at2 = `${at}/pictures/${k}/${j}`;
          const picture = pictures.get(shape);
          if (!picture) throw new AdmissionError('unresolved_reference', at2, `Unknown picture: ${shape}`);
          requireAdmission(
            picture.levels.length === spriteLodLayout(picture.width, picture.height).length,
            'invalid_value',
            at2,
            'A puff picture is saved with every level of its LOD',
          );
          requireAdmission(
            picture.width === pictures.get(shapes[0]!)!.width,
            'invalid_value',
            at2,
            'Every shape of a size is as wide as the others',
          );
          return picture;
        });
        return Object.freeze({
          diameterMeters: resolved[0]!.width / SPRITE_SOURCE_TEXELS_PER_METER,
          shapes: Object.freeze(resolved),
        });
      });
      sizes[name].forEach((size, k) =>
        requireAdmission(
          k === 0 || size.diameterMeters > sizes[name]![k - 1]!.diameterMeters,
          'invalid_value',
          `${at}/pictures/${k}`,
          'Sizes increase in diameter',
        ),
      );
      return { pictures: names, ...motion } as unknown as PuffKindRecord;
    });
    const surfaces = readDictionary(v.surfaces, '/surfaces', (entry, at) => {
      const record = readRecord(entry, at, ['kind', 'palette', 'metersPerPuff', 'joulesPerPuff']);
      const kind = readString(record.kind, `${at}/kind`);
      if (!Object.hasOwn(kinds, kind))
        throw new AdmissionError('unresolved_reference', `${at}/kind`, `Unknown kind: ${kind}`);
      const palette = readString(record.palette, `${at}/palette`);
      requireAdmission(
        sizes[kind]!.every((size) => size.shapes.every((shape) => Object.hasOwn(shape.palettes, palette))),
        'unresolved_reference',
        `${at}/palette`,
        `Not a palette of every ${kind} picture: ${palette}`,
      );
      const amount = (field: 'metersPerPuff' | 'joulesPerPuff') =>
        record[field] === null ? null : readNumber(record[field], `${at}/${field}`);
      const amounts = { metersPerPuff: amount('metersPerPuff'), joulesPerPuff: amount('joulesPerPuff') };
      admitDomain(
        () => checkPuffAmounts(amounts),
        (field) => relativePointer(field, at),
      );
      return { kind, palette, ...amounts };
    });
    for (const id of Object.keys(surfaces))
      requireAdmission(materialIds.includes(id), 'unresolved_reference', `/surfaces/${id}`, `Unknown material: ${id}`);
    for (const id of materialIds)
      requireAdmission(Object.hasOwn(surfaces, id), 'invalid_shape', '/surfaces', `Missing material: ${id}`);
    const source: PuffDocument = deepFreeze({ format: PUFFS_FORMAT, version: PUFFS_VERSION, kinds, surfaces });
    return Object.freeze({ source, sha256, pictures: Object.freeze(sizes) });
  });
}

/** Admit the puffs from their sources, from the build's files or delivery's manifest alike: exactly one, `default`. */
export function compilePuffs(
  sources: readonly DocumentSource[],
  materialIds: readonly string[],
  pictures: ReadonlyMap<string, SpriteLodAsset>,
): AdmissionResult<CompiledPuffs> {
  const single = admitSingleDocument(sources, PUFFS_ID, 'puff document');
  if (!single.ok) return single;
  return compilePuffDocument(single.value.value, single.value.path, single.value.sha256, materialIds, pictures);
}

/**
 * Transport verifies the saved bytes before admission; each composition loads the document and decodes the pictures it
 * names once, from their manifest image entries.
 */
export async function loadPuffs(content: ContentDelivery, materialIds: readonly string[]): Promise<CompiledPuffs> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'puffs'))
    sources.push({ id: file.id, path: file.path, value: await content.json('puffs', file.id), sha256: file.sha256 });
  const pictures = new Map<string, SpriteLodAsset>();
  for (const name of new Set(sources.flatMap((source) => puffPictureNames(source.value)))) {
    const value = await content.json('image', name);
    const { path } = content.manifest.files.find((file) => file.kind === 'image' && file.id === name)!;
    pictures.set(name, requireLoaded(admitPuffPicture(value, path)));
  }
  return requireLoaded(compilePuffs(sources, materialIds, pictures));
}
