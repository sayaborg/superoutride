import { STRIP_ACTIVE_LIMIT, type RenderMeasurements } from '../view/renderer.js';
type StripObservation = RenderMeasurements['stripGround'];
/** Host measurements; the HUD reports observations and makes no device qualification claim. */
export function createCoursePerformanceHud(canvas: HTMLCanvasElement) {
  // The run's course ground; each run sets its own.
  let ground = { maxActiveStrips: 0 };
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
  let renderMilliseconds = 0;
  const recentRenderTimes = new Float64Array(120);
  let stripIndex = 0,
    activeMax = 0;
  return {
    /** The current run's course ground. */
    setCourse(course: { readonly maxActiveStrips: number }) {
      ground = course;
    },
    step(milliseconds: number) {
      stepTotal += milliseconds;
      stepMax = Math.max(stepMax, milliseconds);
    },
    /** `render` is the scene render's CPU milliseconds, timed by the caller around the renderer. */
    frame(started: number, observation: StripObservation | null = null, render = 0) {
      const methodChanged = strip?.method !== observation?.method;
      if (methodChanged) {
        recentRenderTimes.fill(0);
        stripIndex = activeMax = 0;
      }
      strip = observation;
      renderMilliseconds = render;
      if (strip) {
        recentRenderTimes[stripIndex] = render;
        stripIndex = (stripIndex + 1) % recentRenderTimes.length;
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
      const detail = `Strips ${strip?.method ?? ''} · active ${activeMax} visible / ${ground.maxActiveStrips} course max / ${STRIP_ACTIVE_LIMIT} limit · render ${renderMilliseconds.toFixed(2)} ms / max120 ${Math.max(...recentRenderTimes).toFixed(2)} ms`;
      output.textContent = `${fps.toFixed(0)} fps · frame ${frameMax.toFixed(1)} ms · step ${stepMax.toFixed(1)} ms · interval ${intervalMax.toFixed(1)} ms · ${detail}`;
      activeMax = 0;
      first = now;
      frames = 0;
      frameMax = stepMax = intervalMax = 0;
    },
  };
}
