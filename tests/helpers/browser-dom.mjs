import { SelectorElement as Element } from './fake-selector-dom.mjs';
export function installBrowserDom(t, search = '') {
  const frames = new Map();
  let nextFrame = 0,
    now = 0;
  const ids = [
    'game',
    'sound-toggle',
    'tire-sound-toggle',
    'tire-component-controls',
    'sound-volume',
    'sound-tuning',
    'engine-volume',
    'tire-volume',
    'tire-tuning',
    'dev-panel',
    'vehicle-selector-buttons',
    'camera-selector-buttons',
    'steering-offset-selector-buttons',
    'max-steer-selector-buttons',
    'steering-response-selector-buttons',
    'tire-friction-selector-buttons',
  ];
  const elements = new Map(ids.map((id) => [id, new Element()]));
  const calls = [];
  const context = new Proxy(
    { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) },
    { get: (obj, key) => obj[key] ?? ((...args) => calls.push([key, ...args])) },
  );
  elements.get('game').getContext = () => context;
  const doc = new Element();
  doc.getElementById = (id) => elements.get(id) ?? null;
  doc.createElement = (tag) => new Element(tag);
  doc.documentElement = new Element();
  const win = new Element();
  win.innerWidth = 1200;
  win.innerHeight = 800;
  for (const [key, value] of Object.entries({
    document: doc,
    window: win,
    navigator: { maxTouchPoints: 0 },
    matchMedia: () => ({ matches: false }),
    location: { search },
    performance: { now: () => now },
    requestAnimationFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
  return {
    elements,
    calls,
    win,
    frame(time = 0) {
      const [id, callback] = frames.entries().next().value ?? [];
      if (!callback) throw new Error('animation loop did not schedule a frame');
      frames.delete(id);
      now = time;
      callback(now);
    },
  };
}
