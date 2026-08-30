export interface DrivingInput {
  /** Device-independent normalized driver request; response state belongs to vehicle mechanics. */
  steering: number;
  throttle: boolean;
  brake: boolean;
}

export function clampSteering(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
