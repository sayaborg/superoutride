export type BrowserYawTransientGain = 0 | 0.06 | 0.12 | 0.18 | 0.24 | 0.3;
export type BrowserYawWashoutTime = 0.2 | 0.35 | 0.5 | 0.65;
export type BrowserSteeringTraversalSeconds = 0.25 | 0.375 | 0.5 | 0.625;

export interface BrowserSteeringResponseSelection {
  readonly traversalSeconds: BrowserSteeringTraversalSeconds;
  readonly rate: number;
}

export const BROWSER_YAW_TRANSIENT_CYCLE_CODE = 'KeyY';
export const BROWSER_YAW_WASHOUT_CYCLE_CODE = 'KeyU';
export const BROWSER_STEERING_RESPONSE_CYCLE_CODE = 'KeyT';

export const BROWSER_YAW_TRANSIENT_GAINS: readonly BrowserYawTransientGain[] = Object.freeze([
  0,
  0.06,
  0.12,
  0.18,
  0.24,
  0.3,
]);

export const BROWSER_YAW_WASHOUT_TIMES: readonly BrowserYawWashoutTime[] = Object.freeze([
  0.2,
  0.35,
  0.5,
  0.65,
]);

export const BROWSER_STEERING_RESPONSES: readonly BrowserSteeringResponseSelection[] = Object.freeze([
  response(0.25),
  response(0.375),
  response(0.5),
  response(0.625),
]);

export function nextBrowserYawTransientGain(current: number): BrowserYawTransientGain {
  return nextNumericChoice(BROWSER_YAW_TRANSIENT_GAINS, current);
}

export function nextBrowserYawWashoutTime(current: number): BrowserYawWashoutTime {
  return nextNumericChoice(BROWSER_YAW_WASHOUT_TIMES, current);
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

export function formatYawTransientSelector(activeGain: number): string {
  return `YAW [Y] ${activeGain.toFixed(2)}s`;
}

export function formatYawWashoutSelector(activeTime: number): string {
  return `WASH [U] ${activeTime.toFixed(2)}s`;
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
