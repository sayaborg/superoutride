import type {
  ArcadeTireFrictionCalibrationInput,
  ArcadeTireFrictionCalibrationState,
} from '../physics/tire-friction-calibration.js';

export type BrowserTireGripId = '1.20' | '1.40' | '1.50' | '1.60' | '1.80' | '2.00' | '2.20' | '2.40' | '2.60' | '2.80' | '3.00' | '3.20' | '3.40' | '3.60' | '3.80' | '4.00';
export type BrowserTirePeakId = '6' | '8' | '10' | '12' | '14' | '16' | '18' | '20' | '22' | '24' | '26' | '28' | '30' | '32' | '34' | '36' | '38' | '40' | '42' | '44' | '46' | '48' | '50' | '52' | '54' | '56' | '58' | '60';
export type BrowserTireSlideId = '1.00' | '1.20' | '1.40' | '1.60' | '1.80' | '2.00';
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
  /** Absolute deep-slide friction coefficient at gripFactor=1. */
  readonly effectiveSlideGrip: number;
}

export const BROWSER_TIRE_GRIP_CYCLE_CODE = 'KeyH';
export const BROWSER_TIRE_PEAK_CYCLE_CODE = 'KeyJ';
export const BROWSER_TIRE_SLIDE_CYCLE_CODE = 'KeyG';

export const DEFAULT_BROWSER_TIRE_GRIP_ID: BrowserTireGripId = '1.50';
export const DEFAULT_BROWSER_TIRE_PEAK_ID: BrowserTirePeakId = '8';
export const DEFAULT_BROWSER_TIRE_SLIDE_ID: BrowserTireSlideId = '1.20';

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
  effectiveSlideGrip: number,
): Readonly<BrowserTireSlideSelection> {
  return Object.freeze({ id, label: id, effectiveSlideGrip });
}

export const BROWSER_TIRE_GRIPS: readonly BrowserTireGripSelection[] = Object.freeze([
  // M9.19 lower-capacity comparison retains all earlier high-G probes.
  gripSelection('1.20', 1.20),
  gripSelection('1.40', 1.40),
  gripSelection('1.50', 1.50),
  gripSelection('1.60', 1.60),
  gripSelection('1.80', 1.80),
  gripSelection('2.00', 2.00),
  gripSelection('2.20', 2.20),
  gripSelection('2.40', 2.40),
  gripSelection('2.60', 2.60),
  gripSelection('2.80', 2.80),
  gripSelection('3.00', 3.00),
  gripSelection('3.20', 3.20),
  gripSelection('3.40', 3.40),
  gripSelection('3.60', 3.60),
  gripSelection('3.80', 3.80),
  gripSelection('4.00', 4.00),
]);

export const BROWSER_TIRE_PEAKS: readonly BrowserTirePeakSelection[] = Object.freeze([
  peakSelection('6', 0.06),
  peakSelection('8', 0.08),
  peakSelection('10', 0.10),
  peakSelection('12', 0.12),
  peakSelection('14', 0.14),
  peakSelection('16', 0.16),
  peakSelection('18', 0.18),
  peakSelection('20', 0.20),
  peakSelection('22', 0.22),
  peakSelection('24', 0.24),
  peakSelection('26', 0.26),
  peakSelection('28', 0.28),
  peakSelection('30', 0.30),
  peakSelection('32', 0.32),
  peakSelection('34', 0.34),
  peakSelection('36', 0.36),
  peakSelection('38', 0.38),
  peakSelection('40', 0.40),
  peakSelection('42', 0.42),
  peakSelection('44', 0.44),
  peakSelection('46', 0.46),
  peakSelection('48', 0.48),
  peakSelection('50', 0.50),
  peakSelection('52', 0.52),
  peakSelection('54', 0.54),
  peakSelection('56', 0.56),
  peakSelection('58', 0.58),
  peakSelection('60', 0.60),
]);

export const BROWSER_TIRE_SLIDES: readonly BrowserTireSlideSelection[] = Object.freeze([
  slideSelection('1.00', 1.00),
  slideSelection('1.20', 1.20),
  slideSelection('1.40', 1.40),
  slideSelection('1.60', 1.60),
  slideSelection('1.80', 1.80),
  slideSelection('2.00', 2.00),
]);

const DEFAULT_GRIP = mustChoiceById(BROWSER_TIRE_GRIPS, DEFAULT_BROWSER_TIRE_GRIP_ID, 'GRIP');
const DEFAULT_PEAK = mustChoiceById(BROWSER_TIRE_PEAKS, DEFAULT_BROWSER_TIRE_PEAK_ID, 'PEAK');
const DEFAULT_SLIDE = mustChoiceById(BROWSER_TIRE_SLIDES, DEFAULT_BROWSER_TIRE_SLIDE_ID, 'SLIDE');

export const DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION:
Readonly<Required<ArcadeTireFrictionCalibrationInput>> = Object.freeze({
  referenceFrictionMultiplier: DEFAULT_GRIP.referenceFrictionMultiplier,
  linearStiffnessMultiplier: M9_10_TIRE_2_LINEAR_STIFFNESS_MULTIPLIER
    * (DEFAULT_GRIP.referenceFrictionMultiplier / M9_10_TIRE_2_REFERENCE_FRICTION_MULTIPLIER)
    * (M9_10_TIRE_2_PEAK_SLIP_RATIO / DEFAULT_PEAK.slipRatio),
  slidingFrictionRatio: slideToPeakRatio(
    DEFAULT_SLIDE.effectiveSlideGrip,
    DEFAULT_GRIP.effectiveGrip,
  ),
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

/** Absolute large-lateral-slip force coefficient at gripFactor=1. */
export function browserTireEffectiveSlideGrip(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): number {
  return browserTireEffectiveGrip(calibration) * calibration.slidingFrictionRatio;
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
  const effectiveSlideGrip = browserTireEffectiveSlideGrip(calibration);
  return BROWSER_TIRE_SLIDES.find(({ effectiveSlideGrip: candidate }) => approximatelyEqual(
    candidate,
    effectiveSlideGrip,
  ))?.id;
}

/** Skip inadmissible choices rather than silently changing the other displayed axis. */
export function nextBrowserTireGripId(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): BrowserTireGripId {
  return nextChoiceId(
    BROWSER_TIRE_GRIPS.filter(({ effectiveGrip }) =>
      effectiveGrip >= browserTireEffectiveSlideGrip(calibration)
      || approximatelyEqual(effectiveGrip, browserTireEffectiveSlideGrip(calibration))),
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
    BROWSER_TIRE_SLIDES.filter(({ effectiveSlideGrip }) =>
      effectiveSlideGrip <= browserTireEffectiveGrip(calibration)
      || approximatelyEqual(effectiveSlideGrip, browserTireEffectiveGrip(calibration))),
    browserTireSlideIdForCalibration(calibration),
  );
}

export function browserTireCalibrationForGrip(
  id: BrowserTireGripId,
  current: Readonly<ArcadeTireFrictionCalibrationState>,
): Readonly<Required<ArcadeTireFrictionCalibrationInput>> {
  const target = mustChoiceById(BROWSER_TIRE_GRIPS, id, 'GRIP');
  const ratio = target.referenceFrictionMultiplier / current.referenceFrictionMultiplier;
  const effectiveSlideGrip = browserTireEffectiveSlideGrip(current);
  return Object.freeze({
    referenceFrictionMultiplier: target.referenceFrictionMultiplier,
    linearStiffnessMultiplier: current.linearStiffnessMultiplier * ratio,
    slidingFrictionRatio: slideToPeakRatio(effectiveSlideGrip, target.effectiveGrip),
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
    slidingFrictionRatio: slideToPeakRatio(
      target.effectiveSlideGrip,
      browserTireEffectiveGrip(current),
    ),
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
  return `SLIDE [G] ${formatSlideValue(calibration)}`;
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
  return browserTireEffectiveSlideGrip(calibration).toFixed(2);
}

function formatPeakPercent(slipRatio: number): string {
  const percent = slipRatio * 100;
  return Math.abs(percent - Math.round(percent)) < 1e-9
    ? String(Math.round(percent))
    : percent.toFixed(1);
}

function slideToPeakRatio(effectiveSlideGrip: number, effectivePeakGrip: number): number {
  if (!(effectiveSlideGrip > 0) || !Number.isFinite(effectiveSlideGrip)) {
    throw new RangeError('absolute tire SLIDE grip must be finite and > 0');
  }
  if (!(effectivePeakGrip > 0) || !Number.isFinite(effectivePeakGrip)) {
    throw new RangeError('tire GRIP must be finite and > 0');
  }
  const ratio = effectiveSlideGrip / effectivePeakGrip;
  if (ratio > 1 && !approximatelyEqual(effectiveSlideGrip, effectivePeakGrip)) {
    throw new RangeError('absolute tire SLIDE grip must not exceed tire GRIP');
  }
  // Only floating-point equality at S=G is normalized; no displayed axis is retuned.
  return Math.min(1, ratio);
}

function nextChoiceId<Id extends string, Choice extends { readonly id: Id }>(
  choices: readonly Choice[],
  currentId: Id | undefined,
): Id {
  const currentIndex = choices.findIndex(({ id }) => id === currentId);
  return mustChoice(choices, (currentIndex + 1) % choices.length).id;
}

function mustChoiceById<Choice extends { readonly id: string }>(
  choices: readonly Choice[],
  id: Choice['id'],
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
