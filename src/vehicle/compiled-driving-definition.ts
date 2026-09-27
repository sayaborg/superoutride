import type { DrivingDocument } from './driving-definition.js';
import type { CompiledDriving } from './physics/driving-settings.js';

/** Admitted source plus its converted immutable driving product; vehicle models hold the product unchanged. */
export interface CompiledDrivingDefinition {
  readonly source: DrivingDocument;
  /** SHA-256 of the delivered document, supplied by its catalog; null for a definition outside delivery. */
  readonly sha256: string | null;
  readonly compiledDriving: CompiledDriving;
}
