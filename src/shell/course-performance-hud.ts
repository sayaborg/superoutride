import { STRIP_ACTIVE_LIMIT, type renderDriving } from '../view/renderer.js';
type StripObservation = NonNullable<ReturnType<typeof renderDriving>['stripGround']>;
/** Host measurements; the HUD reports observations and makes no device qualification claim. */
export function createCoursePerformanceHud(
  canvas: HTMLCanvasElement,
  metrics: { readonly routeChanges: number; readonly routeChangeMaxMilliseconds: number },
  ground: { readonly maxActiveStrips: number },
) {
  const output = document.createElement('output');
  output.className = 'course-performance';
  output.setAttribute('aria-label', 'Course performance');
  output.setAttribute('aria-live', 'off');
  canvas.insertAdjacentElement('afterend', output);
  let reported = false;
  let frames = 0,
    first = performance.now(),
    last = first,
    stepTotal = 0;
  let frameMax = 0,
    stepMax = 0,
    intervalMax = 0;
  let strip: StripObservation | null = null;
  const recentStripTimes = new Float64Array(120);
  let stripIndex = 0,
    activeMax = 0;
  return {
    step(milliseconds: number) {
      stepTotal += milliseconds;
      stepMax = Math.max(stepMax, milliseconds);
    },
    frame(started: number, observation: StripObservation | null = null) {
      const methodChanged = strip?.method !== observation?.method;
      if (methodChanged) {
        recentStripTimes.fill(0);
        stripIndex = activeMax = 0;
      }
      strip = observation;
      if (strip) {
        recentStripTimes[stripIndex] = strip.milliseconds;
        stripIndex = (stripIndex + 1) % recentStripTimes.length;
        activeMax = Math.max(activeMax, strip.activeStrips);
      }
      const now = performance.now();
      frameMax = Math.max(frameMax, stepTotal + now - started);
      intervalMax = Math.max(intervalMax, now - last);
      stepTotal = 0;
      last = now;
      frames += 1;
      if (reported && !methodChanged && now - first < 500) return;
      reported = true;
      const fps = (frames * 1000) / Math.max(1, now - first);
      const detail = `Strips ${strip?.method ?? ''} · active ${activeMax} visible / ${ground.maxActiveStrips} course max / ${STRIP_ACTIVE_LIMIT} limit · ground ${(strip?.milliseconds ?? 0).toFixed(2)} ms / max120 ${Math.max(...recentStripTimes).toFixed(2)} ms`;
      output.textContent = `${fps.toFixed(0)} fps · frame ${frameMax.toFixed(1)} ms · step ${stepMax.toFixed(1)} ms · route ${metrics.routeChangeMaxMilliseconds.toFixed(1)} ms · interval ${intervalMax.toFixed(1)} ms · ${detail}`;
      activeMax = 0;
      first = now;
      frames = 0;
      frameMax = stepMax = intervalMax = 0;
    },
  };
}
