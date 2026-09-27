import type { DrivingDocument } from './driving-definition.js';
import type { CompiledDriving } from './physics/driving-settings.js';

/** Admitted source plus converted immutable runtime inputs; live steering is copied at spawn. */
export interface CompiledDrivingDefinition {
  readonly source: DrivingDocument;
  /** SHA-256 of the delivered document, supplied by its catalog; null for a definition outside delivery. */
  readonly sha256: string | null;
  readonly compiledDriving: CompiledDriving;
}
