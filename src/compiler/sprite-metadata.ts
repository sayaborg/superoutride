export interface SpritePhysicalMetadata {
  readonly name: string;
  readonly sourceWidthTexels: number;
  readonly sourceHeightTexels: number;
  readonly worldWidthMeters: number;
  readonly anchorX?: number;
  readonly anchorY?: number;
}

export function validateSpritePhysicalMetadata(value: unknown): SpritePhysicalMetadata {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('sprite metadata must be an object');
  }
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, 'visualScale')) {
    throw new Error('visualScale is forbidden; physical size plus pseudo-depth determine display scale');
  }

  const name = record.name;
  const sourceWidthTexels = record.sourceWidthTexels;
  const sourceHeightTexels = record.sourceHeightTexels;
  const worldWidthMeters = record.worldWidthMeters;
  if (typeof name !== 'string' || name.trim().length === 0) throw new Error('sprite metadata name must be non-empty');
  if (!Number.isInteger(sourceWidthTexels) || (sourceWidthTexels as number) <= 0) {
    throw new RangeError('sourceWidthTexels must be a positive integer');
  }
  if (!Number.isInteger(sourceHeightTexels) || (sourceHeightTexels as number) <= 0) {
    throw new RangeError('sourceHeightTexels must be a positive integer');
  }
  if (typeof worldWidthMeters !== 'number' || !Number.isFinite(worldWidthMeters) || !(worldWidthMeters > 0)) {
    throw new RangeError('worldWidthMeters is required and must be finite and > 0');
  }

  const anchorX = optionalFinite(record.anchorX, 'anchorX');
  const anchorY = optionalFinite(record.anchorY, 'anchorY');
  return {
    name,
    sourceWidthTexels: sourceWidthTexels as number,
    sourceHeightTexels: sourceHeightTexels as number,
    worldWidthMeters,
    ...(anchorX === undefined ? {} : { anchorX }),
    ...(anchorY === undefined ? {} : { anchorY }),
  };
}

function optionalFinite(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite when present`);
  }
  return value;
}
