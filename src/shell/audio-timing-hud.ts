import type { AudioTimingSource } from './audio-lifecycle.js';

/** The audio timing HUD refreshes this often, in milliseconds. */
const REFRESH_MILLISECONDS = 500;

/** One reading of the audio timing HUD; every time is in milliseconds. */
export interface AudioTimingReading {
  readonly state: AudioContextState | 'none';
  readonly sampleRate: number;
  readonly baseLatency: number;
  readonly outputLatency: number;
  /** `currentTime` less the output timestamp's context time: how far scheduling runs ahead of what is heard. */
  readonly timestampLag: number;
  /** `performance.now()` less the output timestamp's performance time. */
  readonly timestampAge: number;
  /** Wall time less context time since the context last started running; it grows while rendering falls behind. */
  readonly clockDeficit: number;
  /** State changes to suspended and to running, counted since the HUD started. */
  readonly suspends: number;
  readonly resumes: number;
  /** Worklet render blocks, those that overran their duration, and the longest, summed over every voice. */
  readonly blocks: number;
  readonly overruns: number;
  readonly maxBlock: number;
  /** The recordings that could not be decoded. */
  readonly recordingFailures: readonly string[];
}

/**
 * DEV: the AudioContext's timing facts outside the frame, to find when engine sound starts to lag. It reports
 * observations and makes no device qualification claim. Its latest reading is also on the element's `data-reading`
 * as JSON.
 */
export function createAudioTimingHud(lines: HTMLElement, source: AudioTimingSource) {
  const output = document.createElement('output');
  output.className = 'audio-timing';
  output.setAttribute('aria-label', 'Audio timing');
  output.setAttribute('aria-live', 'off');
  lines.append(output);
  let watched: AudioContext | null = null,
    suspends = 0,
    resumes = 0,
    blocks = 0,
    overruns = 0,
    maxBlock = 0;
  // Context and wall time when the watched context last started running.
  let runningSince: { readonly context: number; readonly wall: number } | null = null;
  const onState = () => {
    if (!watched) return;
    if (watched.state === 'suspended') suspends += 1;
    if (watched.state === 'running') {
      resumes += 1;
      runningSince = { context: watched.currentTime, wall: performance.now() };
    } else runningSince = null;
  };
  source.measureProcessing((report) => {
    blocks += report.blocks;
    overruns += report.overruns;
    maxBlock = Math.max(maxBlock, report.maxMilliseconds);
  });
  const read = (): AudioTimingReading => {
    const context = source.context();
    if (context !== watched) {
      watched?.removeEventListener('statechange', onState);
      watched = context;
      watched?.addEventListener('statechange', onState);
      runningSince = context?.state === 'running' ? { context: context.currentTime, wall: performance.now() } : null;
    }
    const stamp = context?.getOutputTimestamp?.();
    return {
      state: context?.state ?? 'none',
      sampleRate: context?.sampleRate ?? 0,
      baseLatency: (context?.baseLatency ?? 0) * 1000,
      outputLatency: (context?.outputLatency ?? 0) * 1000,
      timestampLag: context && stamp?.contextTime !== undefined ? (context.currentTime - stamp.contextTime) * 1000 : 0,
      timestampAge: stamp?.performanceTime !== undefined ? performance.now() - stamp.performanceTime : 0,
      clockDeficit:
        context && runningSince
          ? performance.now() - runningSince.wall - (context.currentTime - runningSince.context) * 1000
          : 0,
      suspends,
      resumes,
      blocks,
      overruns,
      maxBlock,
      recordingFailures: source.recordingFailures(),
    };
  };
  const show = () => {
    const r = read();
    output.dataset.reading = JSON.stringify(r);
    output.textContent =
      `AUDIO ${r.state} ${r.sampleRate} Hz · base ${r.baseLatency.toFixed(1)} ms · output ${r.outputLatency.toFixed(1)} ms` +
      ` · stamp lag ${r.timestampLag.toFixed(1)} ms age ${r.timestampAge.toFixed(1)} ms · deficit ${r.clockDeficit.toFixed(1)} ms` +
      ` · suspend ${r.suspends} resume ${r.resumes} · overrun ${r.overruns}/${r.blocks} max ${r.maxBlock} ms` +
      (r.recordingFailures.length ? ` · not decoded: ${r.recordingFailures.join(', ')}` : '');
  };
  show();
  setInterval(show, REFRESH_MILLISECONDS);
}
