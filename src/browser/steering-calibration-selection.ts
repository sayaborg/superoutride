import type { ArcadeSteeringCalibrationInput } from '../physics/vehicle-calibration.js';

export type BrowserSelfSteerGain = 0 | 0.2 | 0.4 | 0.6 | 0.8 | 1;
export type BrowserYawPreviewTime = 0 | 0.06 | 0.12 | 0.18 | 0.24 | 0.3;
export type BrowserSteeringTraversalSeconds = 0.25 | 0.375 | 0.5 | 0.625;

export interface BrowserSelfSteerGainSelection {
  readonly code: 'Digit4' | 'Digit5' | 'Digit6' | 'Digit7' | 'Digit8' | 'Digit9';
  readonly numpadCode: 'Numpad4' | 'Numpad5' | 'Numpad6' | 'Numpad7' | 'Numpad8' | 'Numpad9';
  readonly gain: BrowserSelfSteerGain;
}

export interface BrowserSteeringResponseSelection {
  readonly traversalSeconds: BrowserSteeringTraversalSeconds;
  readonly rate: number;
}

export const BROWSER_YAW_PREVIEW_CYCLE_CODE = 'KeyY';
export const BROWSER_STEERING_RESPONSE_CYCLE_CODE = 'KeyT';
export const DEFAULT_BROWSER_SELF_STEER_GAIN: BrowserSelfSteerGain = 0.4;
export const DEFAULT_BROWSER_YAW_PREVIEW_TIME: BrowserYawPreviewTime = 0.12;
export const DEFAULT_BROWSER_STEERING_TRAVERSAL_SECONDS: BrowserSteeringTraversalSeconds = 0.375;

export const BROWSER_SELF_STEER_GAINS: readonly BrowserSelfSteerGainSelection[] = Object.freeze([
  Object.freeze({ code: 'Digit4', numpadCode: 'Numpad4', gain: 0 }),
  Object.freeze({ code: 'Digit5', numpadCode: 'Numpad5', gain: 0.2 }),
  Object.freeze({ code: 'Digit6', numpadCode: 'Numpad6', gain: 0.4 }),
  Object.freeze({ code: 'Digit7', numpadCode: 'Numpad7', gain: 0.6 }),
  Object.freeze({ code: 'Digit8', numpadCode: 'Numpad8', gain: 0.8 }),
  Object.freeze({ code: 'Digit9', numpadCode: 'Numpad9', gain: 1 }),
]);

export const BROWSER_YAW_PREVIEW_TIMES: readonly BrowserYawPreviewTime[] = Object.freeze([
  0,
  0.06,
  0.12,
  0.18,
  0.24,
  0.3,
]);

export const BROWSER_STEERING_RESPONSES: readonly BrowserSteeringResponseSelection[] = Object.freeze([
  response(0.25),
  response(0.375),
  response(0.5),
  response(0.625),
]);

export const DEFAULT_BROWSER_STEERING_CALIBRATION: Readonly<ArcadeSteeringCalibrationInput> =
  Object.freeze({
    travelDirectionGain: DEFAULT_BROWSER_SELF_STEER_GAIN,
    yawPreviewTime: DEFAULT_BROWSER_YAW_PREVIEW_TIME,
    steeringActuatorResponse: Object.freeze({
      applyRate: 1 / DEFAULT_BROWSER_STEERING_TRAVERSAL_SECONDS,
      releaseRate: 1 / DEFAULT_BROWSER_STEERING_TRAVERSAL_SECONDS,
    }),
  });

export function browserSelfSteerGainForKey(code: string): BrowserSelfSteerGain | null {
  return BROWSER_SELF_STEER_GAINS.find(
    (selection) => selection.code === code || selection.numpadCode === code,
  )?.gain ?? null;
}

export function nextBrowserYawPreviewTime(current: number): BrowserYawPreviewTime {
  return nextNumericChoice(BROWSER_YAW_PREVIEW_TIMES, current);
}

export function nextBrowserSteeringResponseRate(currentRate: number): number {
  const currentIndex = BROWSER_STEERING_RESPONSES.findIndex(
    ({ rate }) => approximatelyEqual(rate, currentRate),
  );
  return mustChoice(
    BROWSER_STEERING_RESPONSES,
    (currentIndex + 1) % BROWSER_STEERING_RESPONSES.length,
  ).rate;
}

export function formatSelfSteerGainSelector(activeGain: number): string {
  return BROWSER_SELF_STEER_GAINS
    .map(({ code, gain }) => `[${code.slice(-1)}]${gain.toFixed(1)}${gain === activeGain ? '*' : ''}`)
    .join(' ');
}

export function formatYawPreviewSelector(activeTime: number): string {
  return `YAW [Y] ${activeTime.toFixed(2)}s`;
}

export function formatSteeringResponseSelector(activeRate: number): string {
  const selection = BROWSER_STEERING_RESPONSES.find(
    ({ rate }) => approximatelyEqual(rate, activeRate),
  );
  const traversalSeconds = selection?.traversalSeconds ?? 1 / activeRate;
  return `ACT [T] ${formatTraversalSeconds(traversalSeconds)}s`;
}

export function formatTraversalSeconds(seconds: number): string {
  return String(seconds);
}

function response(
  traversalSeconds: BrowserSteeringTraversalSeconds,
): Readonly<BrowserSteeringResponseSelection> {
  return Object.freeze({ traversalSeconds, rate: 1 / traversalSeconds });
}

function nextNumericChoice<Value extends number>(choices: readonly Value[], current: number): Value {
  const currentIndex = choices.findIndex((value) => approximatelyEqual(value, current));
  return mustChoice(choices, (currentIndex + 1) % choices.length);
}

function mustChoice<Value>(choices: readonly Value[], index: number): Value {
  const choice = choices[index];
  if (choice === undefined) throw new RangeError('browser steering calibration choices must not be empty');
  return choice;
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-12;
}
