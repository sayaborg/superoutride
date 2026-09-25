import type { ContentDelivery } from '../core/content-manifest.js';

export const TIRE_EFFECT_KINDS = Object.freeze([
  'NONE',
  'SMOKE',
  'DUST',
  'GRASS',
  'WATER_SPRAY',
  'SNOW',
  'MUD',
] as const);
export type TireEffectKind = (typeof TIRE_EFFECT_KINDS)[number];

export interface SurfaceMaterial {
  readonly id: string;
  readonly gripFactor: number;
  readonly rollingResistance: number;
  readonly tireEffect: TireEffectKind;
}

export interface SurfaceMaterialDocument {
  readonly format: 'superoutride.surface-materials';
  readonly version: 1;
  readonly id: string;
  readonly materials: readonly SurfaceMaterial[];
}

export interface SurfaceMaterialCatalog {
  readonly source: SurfaceMaterialDocument;
  readonly ids: readonly string[];
  get(id: string): SurfaceMaterial | undefined;
}

export interface SurfaceMaterialDiagnostic {
  readonly kind: 'input';
  readonly code: 'invalid_shape' | 'invalid_value' | 'unsupported_version' | 'duplicate_id';
  readonly document: string;
  readonly path: string;
  readonly message: string;
}

export type SurfaceMaterialResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly SurfaceMaterialDiagnostic[] };

class InputError extends Error {
  constructor(
    readonly code: SurfaceMaterialDiagnostic['code'],
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new InputError('invalid_shape', path, 'Expected an object');
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of Object.keys(value))
    if (!keys.includes(key)) throw new InputError('invalid_shape', `${path}/${key}`, 'Unknown field');
  for (const key of keys)
    if (!Object.hasOwn(value, key)) throw new InputError('invalid_shape', `${path}/${key}`, 'Missing required field');
}

function id(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new InputError('invalid_shape', path, 'Expected a string');
  if (!value || value.trim() !== value || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new InputError('invalid_value', path, 'Expected a nonempty stable ID using A-Z, a-z, 0-9, _ or -');
  return value;
}

function nonnegative(value: unknown, path: string): number {
  if (typeof value !== 'number') throw new InputError('invalid_shape', path, 'Expected a number');
  if (!Number.isFinite(value) || value < 0)
    throw new InputError('invalid_value', path, 'Expected a finite nonnegative number');
  return Object.is(value, -0) ? 0 : value;
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function compileSurfaceMaterialDocument(
  value: unknown,
  document: string,
): SurfaceMaterialResult<SurfaceMaterialCatalog> {
  try {
    const root = object(value, '');
    fields(root, ['format', 'version', 'id', 'materials'], '');
    if (root.format !== 'superoutride.surface-materials' || root.version !== 1)
      throw new InputError(
        'unsupported_version',
        root.format !== 'superoutride.surface-materials' ? '/format' : '/version',
        'Expected superoutride.surface-materials version 1',
      );
    const documentId = id(root.id, '/id');
    if (!Array.isArray(root.materials)) throw new InputError('invalid_shape', '/materials', 'Expected an array');
    if (root.materials.length === 0) {
      throw new InputError('invalid_value', '/materials', 'At least one material is required');
    }
    const seen = new Set<string>();
    const materials = root.materials.map((item, index) => {
      const path = `/materials/${index}`;
      const material = object(item, path);
      fields(material, ['id', 'gripFactor', 'rollingResistance', 'tireEffect'], path);
      const materialId = id(material.id, `${path}/id`);
      if (seen.has(materialId)) {
        throw new InputError('duplicate_id', `${path}/id`, `Duplicate material ID ${materialId}`);
      }
      seen.add(materialId);
      if (
        typeof material.tireEffect !== 'string' ||
        !TIRE_EFFECT_KINDS.includes(material.tireEffect as TireEffectKind)
      ) {
        throw new InputError('invalid_value', `${path}/tireEffect`, `Expected one of ${TIRE_EFFECT_KINDS.join(', ')}`);
      }
      return Object.freeze({
        id: materialId,
        gripFactor: nonnegative(material.gripFactor, `${path}/gripFactor`),
        rollingResistance: nonnegative(material.rollingResistance, `${path}/rollingResistance`),
        tireEffect: material.tireEffect as TireEffectKind,
      });
    });
    const source = freeze({
      format: 'superoutride.surface-materials' as const,
      version: 1 as const,
      id: documentId,
      materials,
    });
    const table = new Map(source.materials.map((material) => [material.id, material]));
    const catalog = Object.freeze({
      source,
      ids: Object.freeze(source.materials.map((material) => material.id)),
      get(materialId: string) {
        return table.get(materialId);
      },
    });
    return Object.freeze({ ok: true as const, value: catalog });
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([
        Object.freeze({
          kind: 'input' as const,
          code: error.code,
          document,
          path: error.path,
          message: error.message,
        }),
      ]),
    });
  }
}

const loaded = new WeakMap<ContentDelivery, Promise<SurfaceMaterialCatalog>>();

/** Transport verifies the saved bytes before this one admission boundary validates the material document. */
export function loadSurfaceMaterials(content: ContentDelivery): Promise<SurfaceMaterialCatalog> {
  let pending = loaded.get(content);
  if (pending) return pending;
  pending = (async () => {
    const files = content.manifest.files.filter((file) => file.kind === 'material');
    if (files.length !== 1 || files[0]!.id !== 'surface') {
      throw new RangeError('Manifest requires one surface material document');
    }
    const file = files[0]!;
    const result = compileSurfaceMaterialDocument(await content.json('material', file.id), file.path);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    if (result.value.source.id !== file.id) {
      const diagnostic = {
        kind: 'input',
        code: 'invalid_value',
        document: file.path,
        path: '/id',
        message: 'Surface material document ID must match manifest identity',
      };
      throw new Error(JSON.stringify([diagnostic]));
    }
    return result.value;
  })();
  loaded.set(content, pending);
  return pending;
}
