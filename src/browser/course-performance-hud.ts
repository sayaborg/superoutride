import { BAND_ACTIVE_LIMIT, BAND_DEFAULT_FILTER, type renderDriving } from '../render/renderer.js';
type BandObservation = NonNullable<ReturnType<typeof renderDriving>['bandGround']>;
/** Host measurements; the HUD reports observations and makes no device qualification claim. */
export function createCoursePerformanceHud(
  canvas: HTMLCanvasElement,
  metrics: { readonly seamCommits: number; readonly seamCommitMaxMilliseconds: number },
  ground:
    | {
        readonly kind: 'resident';
        readonly residentBytes: number;
        readonly uniqueTiles: number;
        readonly sectionCount: number;
      }
    | {
        readonly kind: 'bands';
        readonly coefficientBytes: number;
        readonly directoryBytes: number;
        readonly sectionCount: number;
        readonly maxActiveBands: number;
        readonly expandedBands: number;
        readonly profiles: number;
      },
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
  let band: BandObservation | null = null;
  let bandMax = 0,
    activeMax = 0;
  return {
    step(milliseconds: number) {
      stepTotal += milliseconds;
      stepMax = Math.max(stepMax, milliseconds);
    },
    frame(started: number, observation: BandObservation | null = null) {
      const filterChanged = band?.filter !== observation?.filter;
      band = observation;
      if (band) {
        bandMax = Math.max(bandMax, band.milliseconds);
        activeMax = Math.max(activeMax, band.activeBands);
      }
      const now = performance.now();
      frameMax = Math.max(frameMax, stepTotal + now - started);
      intervalMax = Math.max(intervalMax, now - last);
      stepTotal = 0;
      last = now;
      frames += 1;
      if (reported && !filterChanged && now - first < 500) return;
      reported = true;
      const fps = (frames * 1000) / Math.max(1, now - first);
      const detail =
        ground.kind === 'resident'
          ? `ground ${(ground.residentBytes / 1048576).toFixed(1)} MiB / ${ground.uniqueTiles} tiles / ${ground.sectionCount} sections · loaded once`
          : `Bands ${band?.filter ?? BAND_DEFAULT_FILTER} · active ${activeMax} visible / ${ground.maxActiveBands} course max / ${BAND_ACTIVE_LIMIT} limit · ground ${bandMax.toFixed(2)} ms · s L${band?.preblendLevel ?? 0} · l spans ${band?.profileSegments ?? 0} · ${((ground.coefficientBytes + ground.directoryBytes) / 1048576).toFixed(2)} MiB coefficients+index · ${ground.expandedBands} expanded / ${ground.profiles} profiles`;
      output.textContent = `${fps.toFixed(0)} fps · frame ${frameMax.toFixed(1)} ms · step ${stepMax.toFixed(1)} ms · seam ${metrics.seamCommitMaxMilliseconds.toFixed(1)} ms · interval ${intervalMax.toFixed(1)} ms · ${detail}`;
      bandMax = activeMax = 0;
      first = now;
      frames = 0;
      frameMax = stepMax = intervalMax = 0;
    },
  };
}
