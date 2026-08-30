export type BrowserSelfSteerGain = 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1.0;

export interface BrowserSelfSteerGainSelection {
  readonly code: 'Digit4' | 'Digit5' | 'Digit6' | 'Digit7' | 'Digit8' | 'Digit9';
  readonly numpadCode: 'Numpad4' | 'Numpad5' | 'Numpad6' | 'Numpad7' | 'Numpad8' | 'Numpad9';
  readonly gain: BrowserSelfSteerGain;
}

export const DEFAULT_BROWSER_SELF_STEER_GAIN: BrowserSelfSteerGain = 1.0;

export const BROWSER_SELF_STEER_GAINS: readonly BrowserSelfSteerGainSelection[] = Object.freeze([
  Object.freeze({ code: 'Digit4', numpadCode: 'Numpad4', gain: 0.5 }),
  Object.freeze({ code: 'Digit5', numpadCode: 'Numpad5', gain: 0.6 }),
  Object.freeze({ code: 'Digit6', numpadCode: 'Numpad6', gain: 0.7 }),
  Object.freeze({ code: 'Digit7', numpadCode: 'Numpad7', gain: 0.8 }),
  Object.freeze({ code: 'Digit8', numpadCode: 'Numpad8', gain: 0.9 }),
  Object.freeze({ code: 'Digit9', numpadCode: 'Numpad9', gain: 1.0 }),
]);

export function browserSelfSteerGainForKey(code: string): BrowserSelfSteerGain | null {
  return BROWSER_SELF_STEER_GAINS.find(
    (selection) => selection.code === code || selection.numpadCode === code,
  )?.gain ?? null;
}

export function formatSelfSteerGainSelector(activeGain: number): string {
  return BROWSER_SELF_STEER_GAINS
    .map(({ code, gain }) => `[${code.slice(-1)}]${gain.toFixed(1)}${gain === activeGain ? '*' : ''}`)
    .join(' ');
}
