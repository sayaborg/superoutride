import type { ArcadeTireFrictionCalibrationInput } from '../physics/tire-friction-calibration.js';

export type BrowserTireFrictionMultiplier = 1 | 1.5 | 2 | 2.5;

export interface BrowserTireFrictionSelection {
  readonly multiplier: BrowserTireFrictionMultiplier;
  readonly label: string;
}

export const BROWSER_TIRE_FRICTION_CYCLE_CODE = 'KeyG';
export const DEFAULT_BROWSER_TIRE_FRICTION_MULTIPLIER: BrowserTireFrictionMultiplier = 1;

export const BROWSER_TIRE_FRICTION_PROFILES: readonly BrowserTireFrictionSelection[] =
  Object.freeze([
    Object.freeze({ multiplier: 1, label: 'SEMI' }),
    Object.freeze({ multiplier: 1.5, label: '1.5x' }),
    Object.freeze({ multiplier: 2, label: '2.0x' }),
    Object.freeze({ multiplier: 2.5, label: '2.5x' }),
  ]);

export const DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION:
Readonly<ArcadeTireFrictionCalibrationInput> = Object.freeze({
  referenceFrictionMultiplier: DEFAULT_BROWSER_TIRE_FRICTION_MULTIPLIER,
});

export function nextBrowserTireFrictionMultiplier(
  current: number,
): BrowserTireFrictionMultiplier {
  const currentIndex = BROWSER_TIRE_FRICTION_PROFILES.findIndex(
    ({ multiplier }) => multiplier === current,
  );
  return mustChoice(
    BROWSER_TIRE_FRICTION_PROFILES,
    (currentIndex + 1) % BROWSER_TIRE_FRICTION_PROFILES.length,
  ).multiplier;
}

export function formatTireFrictionSelector(activeMultiplier: number): string {
  const profile = BROWSER_TIRE_FRICTION_PROFILES.find(
    ({ multiplier }) => multiplier === activeMultiplier,
  );
  return `TIRE [G] ${profile?.label ?? `${activeMultiplier}x`}`;
}

function mustChoice<Value>(choices: readonly Value[], index: number): Value {
  const choice = choices[index];
  if (choice === undefined) throw new RangeError('browser tire-friction choices must not be empty');
  return choice;
}
