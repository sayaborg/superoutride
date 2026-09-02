export type BrowserSteeringOffsetDegrees = 10 | 11 | 12 | 13 | 14;
export type BrowserMaxRoadWheelSteerDegrees = 50 | 55 | 60 | 65 | 70;
export type BrowserSteeringTraversalSeconds = 0.2 | 0.225 | 0.25 | 0.275 | 0.3;

export interface BrowserSteeringAngleSelection<Degrees extends number = number> {
  readonly degrees: Degrees;
  readonly radians: number;
}

export interface BrowserSteeringResponseSelection {
  readonly traversalSeconds: BrowserSteeringTraversalSeconds;
  readonly rate: number;
}

export const BROWSER_STEERING_OFFSET_CYCLE_CODE = 'KeyY';
export const BROWSER_MAX_STEER_CYCLE_CODE = 'KeyU';
export const BROWSER_STEERING_RESPONSE_CYCLE_CODE = 'KeyT';

export const BROWSER_STEERING_OFFSETS: readonly BrowserSteeringAngleSelection<BrowserSteeringOffsetDegrees>[] = Object.freeze([
  angle(10), angle(11), angle(12), angle(13), angle(14),
]);

export const BROWSER_MAX_ROAD_WHEEL_STEERS: readonly BrowserSteeringAngleSelection<BrowserMaxRoadWheelSteerDegrees>[] = Object.freeze([
  angle(50), angle(55), angle(60), angle(65), angle(70),
]);

export const BROWSER_STEERING_RESPONSES: readonly BrowserSteeringResponseSelection[] = Object.freeze([
  response(0.2), response(0.225), response(0.25), response(0.275), response(0.3),
]);

export const DEFAULT_BROWSER_STEERING_OFFSET = mustAngleDegrees(BROWSER_STEERING_OFFSETS, 12).radians;
export const DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER = mustAngleDegrees(BROWSER_MAX_ROAD_WHEEL_STEERS, 60).radians;
export const DEFAULT_BROWSER_STEERING_RESPONSE_RATE = mustTraversalSeconds(BROWSER_STEERING_RESPONSES, 0.25).rate;

export function nextBrowserSteeringOffset(currentRadians: number): number {
  return nextAngleChoice(BROWSER_STEERING_OFFSETS, currentRadians).radians;
}
export function nextBrowserMaxRoadWheelSteer(currentRadians: number): number {
  return nextAngleChoice(BROWSER_MAX_ROAD_WHEEL_STEERS, currentRadians).radians;
}
export function nextBrowserSteeringResponseRate(currentRate: number): number {
  const currentIndex = BROWSER_STEERING_RESPONSES.findIndex(({ rate }) => approximatelyEqual(rate, currentRate));
  return mustChoice(BROWSER_STEERING_RESPONSES, (currentIndex + 1) % BROWSER_STEERING_RESPONSES.length).rate;
}

export function formatSteeringOffsetSelector(activeRadians: number): string {
  return `D [Y] ${formatDegrees(activeRadians)}°`;
}
export function formatMaxRoadWheelSteerSelector(activeRadians: number): string {
  return `M [U] ${formatDegrees(activeRadians)}°`;
}
export function formatSteeringResponseSelector(activeRate: number): string {
  const selection = BROWSER_STEERING_RESPONSES.find(({ rate }) => approximatelyEqual(rate, activeRate));
  const traversalSeconds = selection?.traversalSeconds ?? 1 / activeRate;
  return `ACT [T] ${formatTraversalSeconds(traversalSeconds)}s`;
}
export function formatTraversalSeconds(seconds: number): string {
  const roundedMilliseconds = Math.round(seconds * 1_000);
  return roundedMilliseconds % 10 === 0
    ? (roundedMilliseconds / 1_000).toFixed(2)
    : (roundedMilliseconds / 1_000).toFixed(3);
}
export function formatDegrees(radians: number): string {
  const degrees = radians * 180 / Math.PI;
  const rounded = Math.round(degrees * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function angle<Degrees extends number>(degrees: Degrees): Readonly<BrowserSteeringAngleSelection<Degrees>> {
  return Object.freeze({ degrees, radians: degrees * Math.PI / 180 });
}
function response(traversalSeconds: BrowserSteeringTraversalSeconds): Readonly<BrowserSteeringResponseSelection> {
  return Object.freeze({ traversalSeconds, rate: 1 / traversalSeconds });
}
function nextAngleChoice<Degrees extends number>(choices: readonly BrowserSteeringAngleSelection<Degrees>[], currentRadians: number): BrowserSteeringAngleSelection<Degrees> {
  const currentIndex = choices.findIndex(({ radians }) => approximatelyEqual(radians, currentRadians));
  return mustChoice(choices, (currentIndex + 1) % choices.length);
}
function mustAngleDegrees<Degrees extends number>(choices: readonly BrowserSteeringAngleSelection<Degrees>[], degrees: Degrees): BrowserSteeringAngleSelection<Degrees> {
  const choice = choices.find((candidate) => candidate.degrees === degrees);
  if (choice === undefined) throw new RangeError(`missing browser steering angle default: ${degrees}`);
  return choice;
}
function mustTraversalSeconds(choices: readonly BrowserSteeringResponseSelection[], traversalSeconds: BrowserSteeringTraversalSeconds): BrowserSteeringResponseSelection {
  const choice = choices.find((candidate) => candidate.traversalSeconds === traversalSeconds);
  if (choice === undefined) throw new RangeError(`missing browser steering response default: ${traversalSeconds}`);
  return choice;
}
function mustChoice<Value>(choices: readonly Value[], index: number): Value {
  const choice = choices[index];
  if (choice === undefined) throw new RangeError('browser steering calibration choices must not be empty');
  return choice;
}
function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-12;
}
