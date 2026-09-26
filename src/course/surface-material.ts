import type { ContentDelivery } from '../core/content-manifest.js';
import {
  admit,
  admitSingleDocument,
  deepFreeze,
  readDocument,
  readEnum,
  readIdentified,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
  type DocumentSource,
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

/**
 * Admit the material catalog from its sources, from the build's files or delivery's manifest alike:
 * exactly one document, named `surface`, whose ID is its file name.
 */
export function compileSurfaceMaterials(sources: readonly DocumentSource[]): AdmissionResult<SurfaceMaterialCatalog> {
  const single = admitSingleDocument(sources, 'surface', 'surface material document');
  if (!single.ok) return single;
  const { id, path, value } = single.value;
  return admit(path, () => {
    const root = readDocument(value, ['format', 'version', 'id', 'materials'], 'superoutride.surface-materials', 1);
    const documentId = readString(root.id, '/id', MATERIAL_ID);
    requireAdmission(documentId === id, 'invalid_value', '/id', `Expected the file name ${id} as the document ID`);
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

/** Transport verifies the saved bytes before the catalog admission validates the material document. */
export function loadSurfaceMaterials(content: ContentDelivery): Promise<SurfaceMaterialCatalog> {
  let pending = loaded.get(content);
  if (pending) return pending;
  pending = (async () => {
    const sources: DocumentSource[] = [];
    for (const file of content.manifest.files.filter((file) => file.kind === 'material'))
      sources.push({ id: file.id, path: file.path, value: await content.json('material', file.id) });
    const result = compileSurfaceMaterials(sources);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result.value;
  })();
  loaded.set(content, pending);
  return pending;
}
