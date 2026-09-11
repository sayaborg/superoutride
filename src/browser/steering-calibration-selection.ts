import { BROWSER_CALIBRATION_KEYS } from './key-bindings.js';
import { cycleSelectorChoice, sameSelectorValue } from './selector-values.js';
const OFFSET_DEGREES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] as const;
const MAX_STEER_DEGREES = [50, 55, 60, 65, 70, 75, 80] as const;
const TRAVERSAL_SECONDS = [0.2, 0.225, 0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.4] as const;
export type BrowserSteeringTraversalSeconds = (typeof TRAVERSAL_SECONDS)[number];

export interface BrowserSteeringAngleSelection<Degrees extends number = number> {
  readonly degrees: Degrees;
  readonly radians: number;
}

export interface BrowserSteeringResponseSelection {
  readonly traversalSeconds: BrowserSteeringTraversalSeconds;
  readonly rate: number;
}

export const BROWSER_STEERING_OFFSET_CYCLE_CODE = BROWSER_CALIBRATION_KEYS.D;
export const BROWSER_MAX_STEER_CYCLE_CODE = BROWSER_CALIBRATION_KEYS.M;
export const BROWSER_STEERING_RESPONSE_CYCLE_CODE = BROWSER_CALIBRATION_KEYS.ACT;

export const BROWSER_STEERING_OFFSETS = Object.freeze(OFFSET_DEGREES.map(angle));
export const BROWSER_MAX_ROAD_WHEEL_STEERS = Object.freeze(MAX_STEER_DEGREES.map(angle));
export const BROWSER_STEERING_RESPONSES = Object.freeze(TRAVERSAL_SECONDS.map(response));

export const DEFAULT_BROWSER_STEERING_OFFSET = mustAngleDegrees(BROWSER_STEERING_OFFSETS, 20).radians;
export const DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER = mustAngleDegrees(BROWSER_MAX_ROAD_WHEEL_STEERS, 65).radians;
export const DEFAULT_BROWSER_STEERING_RESPONSE_RATE = mustTraversalSeconds(BROWSER_STEERING_RESPONSES, 0.3).rate;

export function nextBrowserSteeringOffset(currentRadians: number): number {
  return nextAngleChoice(BROWSER_STEERING_OFFSETS, currentRadians).radians;
}
export function nextBrowserMaxRoadWheelSteer(currentRadians: number): number {
  return nextAngleChoice(BROWSER_MAX_ROAD_WHEEL_STEERS, currentRadians).radians;
}
export function nextBrowserSteeringResponseRate(currentRate: number): number {
  return cycleSelectorChoice(BROWSER_STEERING_RESPONSES, currentRate, (choice) => choice.rate).rate;
}

export function formatSteeringOffsetSelector(activeRadians: number): string {
  return `D [${BROWSER_STEERING_OFFSET_CYCLE_CODE.slice(3)}] ${formatDegrees(activeRadians)}°`;
}
export function formatMaxRoadWheelSteerSelector(activeRadians: number): string {
  return `M [${BROWSER_MAX_STEER_CYCLE_CODE.slice(3)}] ${formatDegrees(activeRadians)}°`;
}
export function formatSteeringResponseSelector(activeRate: number): string {
  const selection = BROWSER_STEERING_RESPONSES.find(({ rate }) => sameSelectorValue(rate, activeRate));
  const traversalSeconds = selection?.traversalSeconds ?? 1 / activeRate;
  return `ACT [${BROWSER_STEERING_RESPONSE_CYCLE_CODE.slice(3)}] ${formatTraversalSeconds(traversalSeconds)}s`;
}
export function formatTraversalSeconds(seconds: number): string {
  const roundedMilliseconds = Math.round(seconds * 1_000);
  return roundedMilliseconds % 10 === 0
    ? (roundedMilliseconds / 1_000).toFixed(2)
    : (roundedMilliseconds / 1_000).toFixed(3);
}
function formatDegrees(radians: number): string {
  const degrees = (radians * 180) / Math.PI;
  const rounded = Math.round(degrees * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function angle<Degrees extends number>(degrees: Degrees): Readonly<BrowserSteeringAngleSelection<Degrees>> {
  return Object.freeze({ degrees, radians: (degrees * Math.PI) / 180 });
}
function response(traversalSeconds: BrowserSteeringTraversalSeconds): Readonly<BrowserSteeringResponseSelection> {
  return Object.freeze({ traversalSeconds, rate: 1 / traversalSeconds });
}
function nextAngleChoice<Degrees extends number>(
  choices: readonly BrowserSteeringAngleSelection<Degrees>[],
  currentRadians: number,
): BrowserSteeringAngleSelection<Degrees> {
  return cycleSelectorChoice(choices, currentRadians, (choice) => choice.radians);
}
function mustAngleDegrees<Degrees extends number>(
  choices: readonly BrowserSteeringAngleSelection<Degrees>[],
  degrees: Degrees,
): BrowserSteeringAngleSelection<Degrees> {
  const choice = choices.find((candidate) => candidate.degrees === degrees);
  if (choice === undefined) throw new RangeError(`missing browser steering angle default: ${degrees}`);
  return choice;
}
function mustTraversalSeconds(
  choices: readonly BrowserSteeringResponseSelection[],
  traversalSeconds: BrowserSteeringTraversalSeconds,
): BrowserSteeringResponseSelection {
  const choice = choices.find((candidate) => candidate.traversalSeconds === traversalSeconds);
  if (choice === undefined) throw new RangeError(`missing browser steering response default: ${traversalSeconds}`);
  return choice;
}
