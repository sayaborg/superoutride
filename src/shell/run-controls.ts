import type { SessionVehicle } from '../content/session-vehicle.js';
import type { DrivingDocument } from '../vehicle/driving-definition.js';
import { compileDrivingDocument } from '../vehicle/definition-document.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import { DRIVING_DEFINITION_ID } from '../content/vehicle-catalog.js';
import { mountDrivingTuningControls } from './driving-tuning-controls.js';
import { downloadDefinition } from './definition-export.js';
import { mustGet } from './dom.js';

/** What the run's DEV controls ask of the run. */
export interface RunDevActions {
  /** Whether manual recovery may run now. */
  canRecover(): boolean;
  /** The race's manual recovery of the player, followed by a camera reset. */
  recover(): void;
  /** DEV tuning: rebuild the Session around a vehicle driving the admitted tuned definition. */
  rebuildSession(driving: CompiledDrivingDefinition): void;
}

/**
 * A run's DEV controls for the player's Session vehicle: driving tuning, export and RECOVER, mounted in the DEV
 * panel. The tuned driving definition belongs to the run and persists across its rebuilt Sessions for the next tuning
 * step and export.
 */
export function mountRunDevControls(sessionVehicle: SessionVehicle, actions: RunDevActions) {
  // The run's listeners on page elements end with the run.
  const listeners = new AbortController();
  const { signal } = listeners;
  let driving = sessionVehicle.drivingDefinition;
  const definition = sessionVehicle.vehicleDefinition;
  const vehicleId = definition.compiledVehicle.id;
  const tuning = {
    get: () => driving.source,
    set: (document: DrivingDocument) => {
      // A tuned definition is not a delivered document and has no reference identity.
      const admitted = compileDrivingDocument(document, 'DEV driving tuning', null);
      if (!admitted.ok) return false;
      driving = admitted.value;
      actions.rebuildSession(driving);
      return true;
    },
  };
  // DEV driving tuning stays available in a Session.
  const tuningContainers = {
    STEERING: mustGet('tuning-steering-buttons'),
    PEDALS: mustGet('tuning-pedal-buttons'),
    TIRES: mustGet('tuning-tire-buttons'),
    POWERTRAIN: mustGet('tuning-powertrain-buttons'),
    RIVALS: mustGet('tuning-rival-buttons'),
    CONTACT: mustGet('tuning-contact-buttons'),
    ASSIST: mustGet('tuning-assist-buttons'),
  };
  mountDrivingTuningControls(tuningContainers, tuning);
  // Export writes the admitted source documents in the saved layout, never runtime values.
  const exportVehicle = mustGet<HTMLButtonElement>('export-vehicle-button');
  exportVehicle.textContent = `vehicles/${vehicleId}.json`;
  mustGet<HTMLButtonElement>('export-driving-button').addEventListener(
    'click',
    () => downloadDefinition(`${DRIVING_DEFINITION_ID}.json`, driving.source),
    { signal },
  );
  exportVehicle.addEventListener('click', () => downloadDefinition(`${vehicleId}.json`, definition.mechanics), {
    signal,
  });
  mustGet<HTMLButtonElement>('recover-button').addEventListener(
    'click',
    () => {
      if (actions.canRecover()) actions.recover();
    },
    { signal },
  );
  return Object.freeze({
    /** The run's driving and vehicle definitions for the DEV vehicle HUD. */
    get driving() {
      return driving.source;
    },
    definition,
    /** Remove the run's listeners and tuning controls. */
    dispose() {
      listeners.abort();
      for (const container of Object.values(tuningContainers)) container.replaceChildren();
    },
  });
}
