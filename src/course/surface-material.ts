import type { ContentDelivery } from '../core/content-manifest.js';
import {
  admit,
  deepFreeze,
  readDocument,
  readEnum,
  readIdentified,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';

const TIRE_EFFECT_KINDS = Object.freeze(['NONE', 'SMOKE', 'DUST', 'GRASS', 'WATER_SPRAY', 'SNOW', 'MUD'] as const);
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

const MATERIAL_ID = { pattern: /^[A-Za-z0-9_-]+$/, patternMessage: 'Expected a stable ID using A-Z, a-z, 0-9, _ or -' };

export function compileSurfaceMaterialDocument(
  value: unknown,
  document: string,
): AdmissionResult<SurfaceMaterialCatalog> {
  return admit(document, () => {
    const root = readDocument(value, ['format', 'version', 'id', 'materials'], 'superoutride.surface-materials', 1);
    const documentId = readString(root.id, '/id', MATERIAL_ID);
    requireAdmission(
      Array.isArray(root.materials) && root.materials.length > 0,
      Array.isArray(root.materials) ? 'invalid_value' : 'invalid_shape',
      '/materials',
      'Expected a nonempty array of materials',
    );
    const materials = readIdentified(root.materials, '/materials', (item, path) => {
      const material = readRecord(item, path, ['id', 'gripFactor', 'rollingResistance', 'tireEffect']);
      return Object.freeze({
        id: readString(material.id, `${path}/id`, MATERIAL_ID),
        gripFactor: readNumber(material.gripFactor, `${path}/gripFactor`, { min: 0 }),
        rollingResistance: readNumber(material.rollingResistance, `${path}/rollingResistance`, { min: 0 }),
        tireEffect: readEnum(material.tireEffect, TIRE_EFFECT_KINDS, `${path}/tireEffect`),
      });
    });
    const source = deepFreeze({
      format: 'superoutride.surface-materials' as const,
      version: 1 as const,
      id: documentId,
      materials,
    });
    const table = new Map(source.materials.map((material) => [material.id, material]));
    return Object.freeze({
      source,
      ids: Object.freeze(source.materials.map((material) => material.id)),
      get(materialId: string) {
        return table.get(materialId);
      },
    });
  });
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
    const identity = admit(file.path, () =>
      requireAdmission(
        result.value.source.id === file.id,
        'invalid_value',
        '/id',
        'Surface material document ID must match manifest identity',
      ),
    );
    if (!identity.ok) throw new Error(JSON.stringify(identity.diagnostics));
    return result.value;
  })();
  loaded.set(content, pending);
  return pending;
}
