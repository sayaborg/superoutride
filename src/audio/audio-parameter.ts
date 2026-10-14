// Detect once per parameter; weak ownership does not retain disposed graphs.
const holders = new WeakMap<AudioParam, (time: number) => void>();

/** Cancel scheduled values after `now` and hold the value `param` has then. */
export function hold(param: AudioParam, now: number): void {
  let held = holders.get(param);
  if (!held) {
    const nativeHold = param.cancelAndHoldAtTime;
    held =
      typeof nativeHold === 'function'
        ? nativeHold.bind(param)
        : (time) => {
            // Read before cancellation: value is the currently evaluated automation value,
            // not the previous target. This fallback is for current-time retargeting only.
            const current = param.value;
            param.cancelScheduledValues(time);
            param.setValueAtTime(current, time);
          };
    holders.set(param, held);
  }
  held(now);
}

/**
 * Fade `param` linearly from its value now to silence, reached at the returned time, `now + seconds`: the one fade after
 * which a source stops, a kernel is replaced or a worklet rests, so each happens in silence.
 */
export function fadeToSilence(param: AudioParam, now: number, seconds: number): number {
  hold(param, now);
  // A linear ramp runs from the previous event: anchor it at the value held now.
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(0, now + seconds);
  return now + seconds;
}

/** Retarget at currentTime while bounding scheduled events and preserving the current value. */
export function follow(param: AudioParam, value: number, now: number, tau: number): void {
  hold(param, now);
  param.setTargetAtTime(value, now, tau);
}
