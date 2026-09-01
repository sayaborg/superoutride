import type {
  ArcadeTireFrictionCalibrationInput,
  ArcadeTireFrictionCalibrationState,
} from '../physics/tire-friction-calibration.js';

export type BrowserTirePresetId = '1' | '2' | '3';

export interface BrowserTireCharacteristicPreset {
  readonly id: BrowserTirePresetId;
  readonly label: BrowserTirePresetId;
  readonly calibration: Readonly<Required<ArcadeTireFrictionCalibrationInput>>;
}

export const BROWSER_TIRE_FRICTION_CYCLE_CODE = 'KeyG';
export const DEFAULT_BROWSER_TIRE_PRESET_ID: BrowserTirePresetId = '1';

const ADJUSTED_LINEAR_STIFFNESS_MULTIPLIER = 1.1444444444444446;
const TWELVE_DEGREE_REFERENCE_FRICTION_MULTIPLIER = 1.2870855880077763;
const FIFTEEN_DEGREE_REFERENCE_FRICTION_MULTIPLIER = 1.6225024585776389;

export const BROWSER_TIRE_CHARACTERISTIC_PRESETS:
readonly BrowserTireCharacteristicPreset[] = Object.freeze([
  Object.freeze({
    id: '1',
    label: '1',
    calibration: Object.freeze({
      referenceFrictionMultiplier: 1,
      linearStiffnessMultiplier: 1,
    }),
  }),
  Object.freeze({
    id: '2',
    label: '2',
    calibration: Object.freeze({
      referenceFrictionMultiplier: TWELVE_DEGREE_REFERENCE_FRICTION_MULTIPLIER,
      linearStiffnessMultiplier: ADJUSTED_LINEAR_STIFFNESS_MULTIPLIER,
    }),
  }),
  Object.freeze({
    id: '3',
    label: '3',
    calibration: Object.freeze({
      referenceFrictionMultiplier: FIFTEEN_DEGREE_REFERENCE_FRICTION_MULTIPLIER,
      linearStiffnessMultiplier: ADJUSTED_LINEAR_STIFFNESS_MULTIPLIER,
    }),
  }),
]);

export const DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION:
Readonly<ArcadeTireFrictionCalibrationInput> = mustPreset(
  DEFAULT_BROWSER_TIRE_PRESET_ID,
).calibration;

export function browserTirePresetIdForCalibration(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): BrowserTirePresetId | undefined {
  return BROWSER_TIRE_CHARACTERISTIC_PRESETS.find(({ calibration: candidate }) => (
    approximatelyEqual(
      candidate.referenceFrictionMultiplier,
      calibration.referenceFrictionMultiplier,
    )
      && approximatelyEqual(
        candidate.linearStiffnessMultiplier,
        calibration.linearStiffnessMultiplier,
      )
  ))?.id;
}

export function nextBrowserTirePresetId(
  current: Readonly<ArcadeTireFrictionCalibrationState>,
): BrowserTirePresetId {
  const currentId = browserTirePresetIdForCalibration(current);
  const currentIndex = BROWSER_TIRE_CHARACTERISTIC_PRESETS.findIndex(
    ({ id }) => id === currentId,
  );
  return mustChoice(
    BROWSER_TIRE_CHARACTERISTIC_PRESETS,
    (currentIndex + 1) % BROWSER_TIRE_CHARACTERISTIC_PRESETS.length,
  ).id;
}

export function browserTirePresetCalibration(
  id: BrowserTirePresetId,
): Readonly<Required<ArcadeTireFrictionCalibrationInput>> {
  return mustPreset(id).calibration;
}

export function formatTirePresetSelector(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): string {
  return `TIRE [G] ${browserTirePresetIdForCalibration(calibration) ?? '?'}`;
}

function mustPreset(id: BrowserTirePresetId): BrowserTireCharacteristicPreset {
  const preset = BROWSER_TIRE_CHARACTERISTIC_PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new RangeError(`unknown browser tire preset: ${id}`);
  return preset;
}

function mustChoice<Value>(choices: readonly Value[], index: number): Value {
  const choice = choices[index];
  if (choice === undefined) throw new RangeError('browser tire preset choices must not be empty');
  return choice;
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-12;
}
