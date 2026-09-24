export const DEFAULT_STRIP_RENDER_METHOD: StripRenderMethod = 'LEVEL-POINT';

export function createDisplaySettings(initial: StripRenderMethod = DEFAULT_STRIP_RENDER_METHOD) {
  const validate = (value: StripRenderMethod) => {
    if (!STRIP_RENDER_METHODS.includes(value)) throw new RangeError('Unknown Strip display method');
    return value;
  };
  let stripMethod = validate(initial);
  return Object.freeze({
    get stripMethod() {
      return stripMethod;
    },
    setStripMethod(value: StripRenderMethod) {
      stripMethod = validate(value);
    },
  });
}
export type DisplaySettings = ReturnType<typeof createDisplaySettings>;
export const STRIP_RENDER_METHODS = Object.freeze(['POINT-POINT', 'LEVEL-POINT', 'EXACT-BOX'] as const);
export type StripRenderMethod = (typeof STRIP_RENDER_METHODS)[number];
