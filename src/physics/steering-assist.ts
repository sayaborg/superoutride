/** One Driver-owned filter memory. It is neither physical yaw nor derived HUD telemetry. */
export interface ArcadeSteeringAssistState {
  yawRateBaseline: number;
}

export function createArcadeSteeringAssistState(yawRate = 0): ArcadeSteeringAssistState {
  assertFiniteYawRate(yawRate);
  return { yawRateBaseline: yawRate };
}

export function resetArcadeSteeringAssistState(
  state: ArcadeSteeringAssistState,
  yawRate: number,
): void {
  assertFiniteYawRate(yawRate);
  state.yawRateBaseline = yawRate;
}

/**
 * Advances the low-frequency yaw baseline and returns the zero-DC high-pass observation.
 * The state advances even when the downstream automatic-steering allocation is saturated.
 */
export function stepArcadeSteeringYawWashout(
  state: ArcadeSteeringAssistState,
  yawRate: number,
  yawWashoutTime: number,
  dt: number,
): number {
  assertFiniteYawRate(yawRate);
  if (!(yawWashoutTime > 0) || !Number.isFinite(yawWashoutTime)) {
    throw new RangeError('vehicle steering yaw washout time must be finite and > 0');
  }
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new RangeError('vehicle steering washout dt must be finite and > 0');
  }
  if (!Number.isFinite(state.yawRateBaseline)) {
    throw new RangeError('vehicle steering yaw baseline must be finite');
  }
  const response = -Math.expm1(-dt / yawWashoutTime);
  state.yawRateBaseline += (yawRate - state.yawRateBaseline) * response;
  return yawRate - state.yawRateBaseline;
}

function assertFiniteYawRate(yawRate: number): void {
  if (!Number.isFinite(yawRate)) throw new RangeError('vehicle yaw rate must be finite');
}
