import {
  admit,
  deepFreeze,
  readDocument,
  readIdentified,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';

export interface SurfaceMaterial {
  readonly id: string;
  readonly gripFactor: number;
  readonly rollingResistance: number;
}

export interface SurfaceMaterialDocument {
  readonly format: 'superoutride.surface-materials';
  readonly version: 3;
  readonly materials: readonly SurfaceMaterial[];
}

export interface SurfaceMaterialCatalog {
  readonly source: SurfaceMaterialDocument;
  /** SHA-256 of the delivered document, supplied by its catalog. */
  readonly sha256: string;
  get(id: string): SurfaceMaterial | undefined;
}

const MATERIAL_ID = { pattern: /^[A-Za-z0-9_-]+$/, patternMessage: 'Expected a stable ID using A-Z, a-z, 0-9, _ or -' };

/** Compile one surface-material document into its immutable catalog. */
export function compileSurfaceMaterialDocument(
  value: unknown,
  document: string,
  sha256: string,
): AdmissionResult<SurfaceMaterialCatalog> {
  return admit(document, () => {
    const root = readDocument(value, ['format', 'version', 'materials'], 'superoutride.surface-materials', 3);
    requireAdmission(
      Array.isArray(root.materials) && root.materials.length > 0,
      Array.isArray(root.materials) ? 'invalid_value' : 'invalid_shape',
      '/materials',
      'Expected a nonempty array of materials',
    );
    const materials = readIdentified(root.materials, '/materials', (item, path) => {
      const material = readRecord(item, path, ['id', 'gripFactor', 'rollingResistance']);
      return Object.freeze({
        id: readString(material.id, `${path}/id`, MATERIAL_ID),
        gripFactor: readNumber(material.gripFactor, `${path}/gripFactor`, { min: 0 }),
        rollingResistance: readNumber(material.rollingResistance, `${path}/rollingResistance`, { min: 0 }),
      });
    });
    const source = deepFreeze({
      format: 'superoutride.surface-materials' as const,
      version: 3 as const,
      materials,
    });
    const table = new Map(source.materials.map((material) => [material.id, material]));
    return Object.freeze({
      source,
      sha256,
      get(materialId: string) {
        return table.get(materialId);
      },
    });
  });
}
