import type {
  ArcadeTireFrictionCalibrationInput,
  ArcadeTireFrictionCalibrationState,
} from '../physics/tire-friction-calibration.js';

export type BrowserTirePresetId = '100' | '85' | '80' | '75' | '70';

export interface BrowserTireCharacteristicPreset {
  readonly id: BrowserTirePresetId;
  readonly label: BrowserTirePresetId;
  readonly calibration: Readonly<Required<ArcadeTireFrictionCalibrationInput>>;
}

export const BROWSER_TIRE_FRICTION_CYCLE_CODE = 'KeyG';
export const DEFAULT_BROWSER_TIRE_PRESET_ID: BrowserTirePresetId = '100';

/** M9.10 browser baseline preserves the exact former M9.9 TIRE 2 peak characteristics. */
export const M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER = 1.2870855880077763;
export const M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER = 10.3 / 9.75;

function tire2SlidingPreset(
  id: BrowserTirePresetId,
  slidingFrictionRatio: number,
): BrowserTireCharacteristicPreset {
  return Object.freeze({
    id,
    label: id,
    calibration: Object.freeze({
      referenceFrictionMultiplier: M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER,
      linearStiffnessMultiplier: M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER,
      slidingFrictionRatio,
    }),
  });
}

export const BROWSER_TIRE_CHARACTERISTIC_PRESETS:
readonly BrowserTireCharacteristicPreset[] = Object.freeze([
  tire2SlidingPreset('100', 1.00),
  tire2SlidingPreset('85', 0.85),
  tire2SlidingPreset('80', 0.80),
  tire2SlidingPreset('75', 0.75),
  tire2SlidingPreset('70', 0.70),
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
      && approximatelyEqual(
        candidate.slidingFrictionRatio,
        calibration.slidingFrictionRatio,
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
  const percent = Math.round(calibration.slidingFrictionRatio * 100);
  return `SLIDE [G] ${percent}%`;
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
