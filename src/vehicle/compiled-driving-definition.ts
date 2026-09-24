import type { DrivingDocument } from './driving-definition.js';
import type { createDrivingSettings } from './physics/driving-settings.js';

/** Admitted source plus converted immutable runtime inputs; live steering is copied at spawn. */
export interface CompiledDrivingDefinition {
  readonly source: DrivingDocument;
  readonly settings: Readonly<ReturnType<typeof createDrivingSettings>>;
}
