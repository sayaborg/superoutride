import type {
  ArcadeTireFrictionCalibrationInput,
  ArcadeTireFrictionCalibrationState,
} from '../physics/tire-friction-calibration.js';

export type BrowserTireGripId = '1.60' | '1.80' | '2.00' | '2.20' | '2.40';
export type BrowserTirePeakId = '16' | '18' | '20' | '22' | '24';
export type BrowserTireSlideId = '70' | '75' | '80' | '85' | '90';
export type BrowserTireCalibrationAxis = 'GRIP' | 'PEAK' | 'SLIDE';

export interface BrowserTireGripSelection {
  readonly id: BrowserTireGripId;
  readonly label: BrowserTireGripId;
  readonly effectiveGrip: number;
  readonly referenceFrictionMultiplier: number;
}

export interface BrowserTirePeakSelection {
  readonly id: BrowserTirePeakId;
  readonly label: BrowserTirePeakId;
  readonly slipRatio: number;
}

export interface BrowserTireSlideSelection {
  readonly id: BrowserTireSlideId;
  readonly label: BrowserTireSlideId;
  readonly slidingFrictionRatio: number;
}

export const BROWSER_TIRE_GRIP_CYCLE_CODE = 'KeyH';
export const BROWSER_TIRE_PEAK_CYCLE_CODE = 'KeyJ';
export const BROWSER_TIRE_SLIDE_CYCLE_CODE = 'KeyG';

export const DEFAULT_BROWSER_TIRE_GRIP_ID: BrowserTireGripId = '2.00';
export const DEFAULT_BROWSER_TIRE_PEAK_ID: BrowserTirePeakId = '20';
export const DEFAULT_BROWSER_TIRE_SLIDE_ID: BrowserTireSlideId = '80';

/** M9.10 retained former TIRE 2 reference anchors. */
export const M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER = 1.2870855880077763;
export const M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER = 10.3 / 9.75;
export const M9_10_TIRE_2_EFFECTIVE_GRIP = 1.35 * M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER;
export const M9_10_TIRE_2_PEAK_SLIP_RATIO = 0.21255656167002204;

function gripSelection(
  id: BrowserTireGripId,
  effectiveGrip: number,
): Readonly<BrowserTireGripSelection> {
  return Object.freeze({
    id,
    label: id,
    effectiveGrip,
    referenceFrictionMultiplier: M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER
      * effectiveGrip / M9_10_TIRE_2_EFFECTIVE_GRIP,
  });
}

function peakSelection(
  id: BrowserTirePeakId,
  slipRatio: number,
): Readonly<BrowserTirePeakSelection> {
  return Object.freeze({ id, label: id, slipRatio });
}

function slideSelection(
  id: BrowserTireSlideId,
  slidingFrictionRatio: number,
): Readonly<BrowserTireSlideSelection> {
  return Object.freeze({ id, label: id, slidingFrictionRatio });
}

export const BROWSER_TIRE_GRIPS: readonly BrowserTireGripSelection[] = Object.freeze([
  gripSelection('1.60', 1.60),
  gripSelection('1.80', 1.80),
  gripSelection('2.00', 2.00),
  gripSelection('2.20', 2.20),
  gripSelection('2.40', 2.40),
]);

export const BROWSER_TIRE_PEAKS: readonly BrowserTirePeakSelection[] = Object.freeze([
  peakSelection('16', 0.16),
  peakSelection('18', 0.18),
  peakSelection('20', 0.20),
  peakSelection('22', 0.22),
  peakSelection('24', 0.24),
]);

export const BROWSER_TIRE_SLIDES: readonly BrowserTireSlideSelection[] = Object.freeze([
  slideSelection('70', 0.70),
  slideSelection('75', 0.75),
  slideSelection('80', 0.80),
  slideSelection('85', 0.85),
  slideSelection('90', 0.90),
]);

const DEFAULT_GRIP = mustChoiceById(BROWSER_TIRE_GRIPS, DEFAULT_BROWSER_TIRE_GRIP_ID, 'GRIP');
const DEFAULT_PEAK = mustChoiceById(BROWSER_TIRE_PEAKS, DEFAULT_BROWSER_TIRE_PEAK_ID, 'PEAK');

export const DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION:
Readonly<Required<ArcadeTireFrictionCalibrationInput>> = Object.freeze({
  referenceFrictionMultiplier: DEFAULT_GRIP.referenceFrictionMultiplier,
  linearStiffnessMultiplier: M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER
    * (DEFAULT_GRIP.referenceFrictionMultiplier / M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER)
    * (M9_10_TIRE_2_PEAK_SLIP_RATIO / DEFAULT_PEAK.slipRatio),
  slidingFrictionRatio: 0.80,
});

export function browserTireEffectiveGrip(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): number {
  return M9_10_TIRE_2_EFFECTIVE_GRIP
    * calibration.referenceFrictionMultiplier
    / M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER;
}

export function browserTirePeakSlipRatio(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): number {
  return M9_10_TIRE_2_PEAK_SLIP_RATIO
    * (calibration.referenceFrictionMultiplier / M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER)
    / (calibration.linearStiffnessMultiplier / M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER);
}

export function browserTireGripIdForCalibration(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): BrowserTireGripId | undefined {
  return BROWSER_TIRE_GRIPS.find(({ referenceFrictionMultiplier }) => approximatelyEqual(
    referenceFrictionMultiplier,
    calibration.referenceFrictionMultiplier,
  ))?.id;
}

export function browserTirePeakIdForCalibration(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): BrowserTirePeakId | undefined {
  const peakSlipRatio = browserTirePeakSlipRatio(calibration);
  return BROWSER_TIRE_PEAKS.find(({ slipRatio }) => approximatelyEqual(
    slipRatio,
    peakSlipRatio,
  ))?.id;
}

export function browserTireSlideIdForCalibration(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): BrowserTireSlideId | undefined {
  return BROWSER_TIRE_SLIDES.find(({ slidingFrictionRatio }) => approximatelyEqual(
    slidingFrictionRatio,
    calibration.slidingFrictionRatio,
  ))?.id;
}

export function nextBrowserTireGripId(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): BrowserTireGripId {
  return nextChoiceId(
    BROWSER_TIRE_GRIPS,
    browserTireGripIdForCalibration(calibration),
  );
}

export function nextBrowserTirePeakId(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): BrowserTirePeakId {
  return nextChoiceId(
    BROWSER_TIRE_PEAKS,
    browserTirePeakIdForCalibration(calibration),
  );
}

export function nextBrowserTireSlideId(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): BrowserTireSlideId {
  return nextChoiceId(
    BROWSER_TIRE_SLIDES,
    browserTireSlideIdForCalibration(calibration),
  );
}

export function browserTireCalibrationForGrip(
  id: BrowserTireGripId,
  current: Readonly<ArcadeTireFrictionCalibrationState>,
): Readonly<Required<ArcadeTireFrictionCalibrationInput>> {
  const target = mustChoiceById(BROWSER_TIRE_GRIPS, id, 'GRIP');
  const ratio = target.referenceFrictionMultiplier / current.referenceFrictionMultiplier;
  return Object.freeze({
    referenceFrictionMultiplier: target.referenceFrictionMultiplier,
    linearStiffnessMultiplier: current.linearStiffnessMultiplier * ratio,
    slidingFrictionRatio: current.slidingFrictionRatio,
  });
}

export function browserTireCalibrationForPeak(
  id: BrowserTirePeakId,
  current: Readonly<ArcadeTireFrictionCalibrationState>,
): Readonly<Required<ArcadeTireFrictionCalibrationInput>> {
  const target = mustChoiceById(BROWSER_TIRE_PEAKS, id, 'PEAK');
  const linearStiffnessMultiplier = M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER
    * (current.referenceFrictionMultiplier / M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER)
    * (M9_10_TIRE_2_PEAK_SLIP_RATIO / target.slipRatio);
  return Object.freeze({
    referenceFrictionMultiplier: current.referenceFrictionMultiplier,
    linearStiffnessMultiplier,
    slidingFrictionRatio: current.slidingFrictionRatio,
  });
}

export function browserTireCalibrationForSlide(
  id: BrowserTireSlideId,
  current: Readonly<ArcadeTireFrictionCalibrationState>,
): Readonly<Required<ArcadeTireFrictionCalibrationInput>> {
  const target = mustChoiceById(BROWSER_TIRE_SLIDES, id, 'SLIDE');
  return Object.freeze({
    referenceFrictionMultiplier: current.referenceFrictionMultiplier,
    linearStiffnessMultiplier: current.linearStiffnessMultiplier,
    slidingFrictionRatio: target.slidingFrictionRatio,
  });
}

export function formatTireGripSelector(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): string {
  return `GRIP [H] ${formatGripValue(calibration)}`;
}

export function formatTirePeakSelector(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): string {
  const slipRatio = browserTirePeakSlipRatio(calibration);
  const percent = formatPeakPercent(slipRatio);
  const angle = Math.atan(slipRatio) * 180 / Math.PI;
  return `PEAK [J] ${percent}%/${angle.toFixed(1)}°`;
}

export function formatTireSlideSelector(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): string {
  return `SLIDE [G] ${formatSlideValue(calibration)}%`;
}

export function formatGripValue(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): string {
  return browserTireEffectiveGrip(calibration).toFixed(2);
}

export function formatPeakValue(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): string {
  return formatPeakPercent(browserTirePeakSlipRatio(calibration));
}

export function formatSlideValue(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): string {
  return String(Math.round(calibration.slidingFrictionRatio * 100));
}

function formatPeakPercent(slipRatio: number): string {
  const percent = slipRatio * 100;
  return Math.abs(percent - Math.round(percent)) < 1e-9
    ? String(Math.round(percent))
    : percent.toFixed(1);
}

function nextChoiceId<Id extends string, Choice extends { readonly id: Id }>(
  choices: readonly Choice[],
  currentId: Id | undefined,
): Id {
  const currentIndex = choices.findIndex(({ id }) => id === currentId);
  return mustChoice(choices, (currentIndex + 1) % choices.length).id;
}

function mustChoiceById<Id extends string, Choice extends { readonly id: Id }>(
  choices: readonly Choice[],
  id: Id,
  kind: string,
): Choice {
  const choice = choices.find((candidate) => candidate.id === id);
  if (choice === undefined) throw new RangeError(`unknown browser tire ${kind} choice: ${id}`);
  return choice;
}

function mustChoice<Value>(choices: readonly Value[], index: number): Value {
  const choice = choices[index];
  if (choice === undefined) throw new RangeError('browser tire choices must not be empty');
  return choice;
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-12;
}
