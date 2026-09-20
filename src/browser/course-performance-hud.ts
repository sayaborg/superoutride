/** Host measurements; the HUD reports observations and makes no device qualification claim. */
export function createCoursePerformanceHud(
  canvas: HTMLCanvasElement,
  metrics: { readonly seamCommits: number; readonly seamCommitMaxMilliseconds: number },
  ground: { readonly residentBytes: number; readonly uniqueTiles: number; readonly sectionCount: number },
) {
  const output = document.createElement('output');
  output.className = 'course-performance';
  output.setAttribute('aria-label', 'Course performance');
  output.setAttribute('aria-live', 'off');
  canvas.insertAdjacentElement('afterend', output);
  let frames = 0,
    first = performance.now(),
    last = first,
    stepTotal = 0;
  let frameMax = 0,
    stepMax = 0,
    intervalMax = 0;
  return {
    step(milliseconds: number) {
      stepTotal += milliseconds;
      stepMax = Math.max(stepMax, milliseconds);
    },
    frame(started: number) {
      const now = performance.now();
      frameMax = Math.max(frameMax, stepTotal + now - started);
      intervalMax = Math.max(intervalMax, now - last);
      stepTotal = 0;
      last = now;
      frames += 1;
      if (now - first < 500 && frames > 1) return;
      const fps = (frames * 1000) / Math.max(1, now - first);
      output.textContent = `${fps.toFixed(0)} fps · frame ${frameMax.toFixed(1)} ms · step ${stepMax.toFixed(1)} ms · seam ${metrics.seamCommitMaxMilliseconds.toFixed(1)} ms · interval ${intervalMax.toFixed(1)} ms · ground ${(ground.residentBytes / 1048576).toFixed(1)} MiB / ${ground.uniqueTiles} tiles / ${ground.sectionCount} sections · loaded once`;
      first = now;
      frames = 0;
      frameMax = stepMax = intervalMax = 0;
    },
  };
}
