import { AUDIO_TIMING } from './audio-presentation.js';

// Detect once per parameter; weak ownership does not retain disposed graphs.
const holders = new WeakMap<AudioParam, (time: number) => void>();

/** Retarget at currentTime while bounding scheduled events and preserving the current value. */
export function follow(param: AudioParam, value: number, now: number, tau: number = AUDIO_TIMING.controlSeconds): void {
  let hold = holders.get(param);
  if (!hold) {
    const nativeHold = param.cancelAndHoldAtTime;
    hold =
      typeof nativeHold === 'function'
        ? nativeHold.bind(param)
        : (time) => {
            // Read before cancellation: value is the currently evaluated automation value,
            // not the previous target. This fallback is for current-time retargeting only.
            const current = param.value;
            param.cancelScheduledValues(time);
            param.setValueAtTime(current, time);
          };
    holders.set(param, hold);
  }
  hold(now);
  param.setTargetAtTime(value, now, tau);
}
