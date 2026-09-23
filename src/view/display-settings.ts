import { BAND_RENDER_METHODS, type BandRenderMethod } from '../course/band-ground.js';

export const DEFAULT_BAND_RENDER_METHOD: BandRenderMethod = 'LEVEL-POINT';

export function createDisplaySettings(initial: BandRenderMethod = DEFAULT_BAND_RENDER_METHOD) {
  const validate = (value: BandRenderMethod) => {
    if (!BAND_RENDER_METHODS.includes(value)) throw new RangeError('Unknown Band display method');
    return value;
  };
  let bandMethod = validate(initial);
  return Object.freeze({
    get bandMethod() {
      return bandMethod;
    },
    setBandMethod(value: BandRenderMethod) {
      bandMethod = validate(value);
    },
  });
}
export type DisplaySettings = ReturnType<typeof createDisplaySettings>;
