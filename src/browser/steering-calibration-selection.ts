export type BrowserSteeringOffsetDegrees = 9 | 9.5 | 11 | 12.5 | 14;
export type BrowserMaxRoadWheelSteerDegrees = 37 | 41 | 45 | 49 | 53;
export type BrowserSteeringTraversalSeconds = 0.25 | 0.375 | 0.5 | 0.625;

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
  angle(9),
  angle(9.5),
  angle(11),
  angle(12.5),
  angle(14),
]);

export const BROWSER_MAX_ROAD_WHEEL_STEERS: readonly BrowserSteeringAngleSelection<BrowserMaxRoadWheelSteerDegrees>[] = Object.freeze([
  angle(37),
  angle(41),
  angle(45),
  angle(49),
  angle(53),
]);

export const BROWSER_STEERING_RESPONSES: readonly BrowserSteeringResponseSelection[] = Object.freeze([
  response(0.25),
  response(0.375),
  response(0.5),
  response(0.625),
]);

export function nextBrowserSteeringOffset(currentRadians: number): number {
  return nextAngleChoice(BROWSER_STEERING_OFFSETS, currentRadians).radians;
}

export function nextBrowserMaxRoadWheelSteer(currentRadians: number): number {
  return nextAngleChoice(BROWSER_MAX_ROAD_WHEEL_STEERS, currentRadians).radians;
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

export function formatSteeringOffsetSelector(activeRadians: number): string {
  return `D [Y] ${formatDegrees(activeRadians)}°`;
}

export function formatMaxRoadWheelSteerSelector(activeRadians: number): string {
  return `M [U] ${formatDegrees(activeRadians)}°`;
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

export function formatDegrees(radians: number): string {
  const degrees = radians * 180 / Math.PI;
  return Number.isInteger(degrees) ? String(degrees) : degrees.toFixed(1);
}

function angle<Degrees extends number>(
  degrees: Degrees,
): Readonly<BrowserSteeringAngleSelection<Degrees>> {
  return Object.freeze({ degrees, radians: degrees * Math.PI / 180 });
}

function response(
  traversalSeconds: BrowserSteeringTraversalSeconds,
): Readonly<BrowserSteeringResponseSelection> {
  return Object.freeze({ traversalSeconds, rate: 1 / traversalSeconds });
}

function nextAngleChoice<Degrees extends number>(
  choices: readonly BrowserSteeringAngleSelection<Degrees>[],
  currentRadians: number,
): BrowserSteeringAngleSelection<Degrees> {
  const currentIndex = choices.findIndex(({ radians }) => approximatelyEqual(radians, currentRadians));
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
