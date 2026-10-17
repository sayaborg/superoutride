import { createRunVehicle, type RunVehicle } from '../content/run-vehicle.js';
import { compileDrivingDocument, retuneVehicleMechanics } from '../vehicle/definition-document.js';
import { DRIVING_DEFINITION_ID } from '../content/vehicle-catalog.js';
import { mountDrivingTuningControls } from './driving-tuning-controls.js';
import { tuningOwner, type TuningDocuments } from './driving-tuning.js';
import { downloadDefinition } from './definition-export.js';
import { mustGet } from './dom.js';

/** What the run's DEV controls ask of the run. */
export interface RunDevActions {
  /** Whether manual recovery may run now. */
  canRecover(): boolean;
  /** The race's manual recovery of the player, followed by a camera reset. */
  recover(): void;
  /** DEV tuning: rebuild the run around the run vehicle of the admitted tuned definitions. */
  rebuildRun(vehicle: RunVehicle): void;
}

/**
 * A run's DEV controls for the player's run vehicle: driving tuning, export and RECOVER, mounted in the DEV
 * panel. The tuned driving definition and vehicle definition belong to the run and persist across its rebuilt runs
 * for the next tuning step and export.
 */
export function mountRunDevControls(runVehicle: RunVehicle, actions: RunDevActions) {
  // The run's listeners on page elements end with the run.
  const listeners = new AbortController();
  const { signal } = listeners;
  let { drivingDefinition: driving, vehicleDefinition: definition } = runVehicle;
  const vehicleId = definition.compiledVehicle.id;
  const tuning = {
    get: (): TuningDocuments => ({ driving: driving.source, mechanics: definition.mechanics }),
    // Each changed document is admitted by its own compiler; tuned documents are not delivered and have no reference
    // identity.
    set: (documents: TuningDocuments) => {
      const tunedDriving =
        documents.driving === driving.source
          ? { ok: true as const, value: driving }
          : compileDrivingDocument(documents.driving, 'DEV driving tuning', null);
      if (!tunedDriving.ok) return false;
      const tunedVehicle =
        documents.mechanics === definition.mechanics
          ? { ok: true as const, value: definition }
          : retuneVehicleMechanics(definition, documents.mechanics, `DEV ${vehicleId} tuning`);
      if (!tunedVehicle.ok) return false;
      driving = tunedDriving.value;
      definition = tunedVehicle.value;
      actions.rebuildRun(createRunVehicle(definition, driving));
      return true;
    },
  };
  // DEV names whose tire and wheel slip it tunes: the vehicle's own or the game-wide defaults.
  const owner = (key: 'tire' | 'wheelSlip') => (tuningOwner(tuning.get(), key) === 'VEHICLE' ? vehicleId : 'game-wide');
  mustGet('tuning-tire-label').textContent = `TIRES F/R · ${owner('tire')}`;
  mustGet('tuning-assist-label').textContent = `ASSISTS · ${owner('wheelSlip')}`;
  // DEV driving tuning stays available in a run.
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
    /** Remove the run's listeners and tuning controls. */
    dispose() {
      listeners.abort();
      for (const container of Object.values(tuningContainers)) container.replaceChildren();
    },
  });
}
