export interface DrivingInput {
  steering: number;
  throttle: boolean;
  brake: boolean;
}

export function clampSteering(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export const ZERO_DRIVING_INPUT: Readonly<DrivingInput> = Object.freeze({
  steering: 0,
  throttle: false,
  brake: false,
});
