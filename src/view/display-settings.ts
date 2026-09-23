import { BAND_RENDER_MODES, type BandRenderMode } from '../course/band-ground.js';

export const DEFAULT_BAND_RENDER_MODE: BandRenderMode = 'LEVEL-POINT';

export function createDisplaySettings(initial: BandRenderMode = DEFAULT_BAND_RENDER_MODE) {
  const validate = (value: BandRenderMode) => {
    if (!BAND_RENDER_MODES.includes(value)) throw new RangeError('Unknown Band display mode');
    return value;
  };
  let bandMode = validate(initial);
  return Object.freeze({
    get bandMode() {
      return bandMode;
    },
    setBandMode(value: BandRenderMode) {
      bandMode = validate(value);
    },
  });
}
export type DisplaySettings = ReturnType<typeof createDisplaySettings>;
