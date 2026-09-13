/** A bounded event list, with continuity when targets change faster than the smoothing time. */
export function follow(param: AudioParam, value: number, now: number, tau = 0.025): void {
  param.cancelAndHoldAtTime(now);
  param.setTargetAtTime(value, now, tau);
}
