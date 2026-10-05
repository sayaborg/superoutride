import type { ControlSettings } from './audio-control-policy.js';
import { sameControlSettings } from './audio-control-policy.js';
import { follow } from './audio-parameter.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
import type { ProcessingReport } from './processing-meter.js';
import { sameUnifiedSettings } from './tire-unified-acoustics.js';
import type { ScrapeSettings } from './wall-scrape-acoustics.js';
import type { WallSoundRecords } from './wall-sounds.js';

/** One barrier line rubbing the player: its friction power (W), the speed along the road (m/s) and its wall sound. */
export interface WallRubObservation {
  readonly frictionPower: number;
  readonly speed: number;
  readonly sound: string | null;
}

/**
 * The walls' scraping voice: one worklet, sounding the rub of the line with the most friction power (one voice).
 * Without a rub its excitation stops and the stored vibration decays, as a released tire's does. Settings changes fade
 * out and replace the kernel after the transition, as the tire voice's do; admitted values are used as given.
 */
export function createScrapeVoice(context: BaseAudioContext, destination: AudioNode, walls: WallSoundRecords) {
  const node = new AudioWorkletNode(context, 'wall-scrape', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { walls: walls.walls },
  });
  const output = context.createGain();
  output.gain.value = 1;
  node.connect(output).connect(destination);
  let settings: ScrapeSettings = DEFAULT_AUDIO_SETTINGS.scrape,
    control: ControlSettings = DEFAULT_AUDIO_SETTINGS.control;
  let active = { settings, control },
    pendingAt: number | null = null,
    disposed = false;
  const parameter = (name: string) => node.parameters.get(name)!;
  return {
    setSettings(value: ScrapeSettings): void {
      settings = value;
    },
    setControl(value: ControlSettings): void {
      control = value;
    },
    update(rubs: readonly WallRubObservation[]): void {
      if (disposed) return;
      let rub: WallRubObservation | null = null;
      for (const candidate of rubs) if (!rub || candidate.frictionPower > rub.frictionPower) rub = candidate;
      parameter('power').value = rub?.frictionPower ?? 0;
      parameter('speed').value = rub?.speed ?? 0;
      parameter('wall').value = rub ? walls.indexOf(rub.sound) : -1;
      const now = context.currentTime;
      const changed = !sameUnifiedSettings(settings, active.settings) || !sameControlSettings(active.control, control);
      if (!changed) {
        if (pendingAt !== null) follow(output.gain, 1, now, control.gainSeconds);
        pendingAt = null;
        return;
      }
      if (pendingAt === null) {
        pendingAt = now + control.transitionSeconds;
        follow(output.gain, 0, now, control.fadeSeconds);
      }
      if (now < pendingAt) return;
      node.port.postMessage({ settings, control, walls: walls.walls });
      active = { settings, control };
      pendingAt = null;
      follow(output.gain, 1, now, control.gainSeconds);
    },
    /** Rest the worklet from context time `at`, or wake it with null. */
    rest(at: number | null): void {
      if (!disposed) node.port.postMessage({ restAt: at });
    },
    /** DEV: report the worklet's processing to `listener`, or stop with null. */
    measureProcessing(listener: ((report: ProcessingReport) => void) | null): void {
      if (disposed) return;
      node.port.onmessage = listener && (({ data }) => listener(data as ProcessingReport));
      node.port.postMessage({ measure: listener !== null });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      try {
        node.port.postMessage('stop');
      } finally {
        node.port.close();
        node.disconnect();
        output.disconnect();
      }
    },
  };
}
