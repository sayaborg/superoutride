import type { ControlSettings } from './audio-control-policy.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
import { FrictionSynthesis } from './friction-synthesis.js';
import { ProcessingMeter } from './processing-meter.js';
import { SCRAPE_SEED, type ScrapeSettings } from './wall-scrape-acoustics.js';
import type { WallSound } from './wall-sounds.js';
import { WorkletRest } from './worklet-rest.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

/** The scraping worklet's inputs: the rubbing line's friction power (W), speed along it (m/s) and wall number. */
export const SCRAPE_PARAMETERS = Object.freeze({
  power: Object.freeze({ minValue: 0, maxValue: 1e8, defaultValue: 0 }),
  speed: Object.freeze({ minValue: 0, maxValue: 200, defaultValue: 0 }),
  wall: Object.freeze({ minValue: -1, maxValue: 255, defaultValue: -1 }),
});

/**
 * The walls' scraping: one friction synthesis excited by the rubbing line's friction power at its speed along the road,
 * on that wall's friction input. The voice supplies admitted records, used as given.
 */
class ScrapeProcessor extends AudioWorkletProcessor {
  private walls: readonly WallSound[];
  private kernel: FrictionSynthesis | null;
  private readonly meter = new ProcessingMeter(this.port, sampleRate);
  private readonly rest = new WorkletRest();
  static get parameterDescriptors() {
    return Object.entries(SCRAPE_PARAMETERS).map(([name, range]) => ({ name, ...range, automationRate: 'k-rate' }));
  }
  constructor(options?: { processorOptions: { walls: readonly WallSound[] } }) {
    super();
    this.walls = options!.processorOptions.walls;
    this.kernel = new FrictionSynthesis(
      sampleRate,
      DEFAULT_AUDIO_SETTINGS.scrape,
      DEFAULT_AUDIO_SETTINGS.control,
      SCRAPE_SEED,
    );
    this.port.onmessage = ({ data }) => {
      if (this.meter.receive(data) || this.rest.receive(data)) return;
      if (data === 'stop') this.kernel = null;
      else if (this.kernel !== null) {
        // A replacement after the voice's fade: a fresh kernel at silence.
        const { settings, control, walls } = data as {
          settings: ScrapeSettings;
          control: ControlSettings;
          walls: readonly WallSound[];
        };
        this.walls = walls;
        this.kernel = new FrictionSynthesis(sampleRate, settings, control, SCRAPE_SEED);
      }
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][], p: Record<string, Float32Array>): boolean {
    const output = outputs[0]?.[0],
      kernel = this.kernel;
    if (!kernel) {
      output?.fill(0);
      return false;
    }
    if (!output) return true;
    const started = this.meter.begin();
    if (this.rest.resting) output.fill(0);
    else {
      // Numerical transport only: a float wall number must still name a record.
      const wall = this.walls[Math.round(p.wall![0]!)];
      if (wall) kernel.update(p.power![0]!, p.speed![0]!, wall.friction);
      else kernel.release();
      for (let i = 0; i < output.length; i++) output[i] = kernel.sample();
    }
    this.meter.end(started, output.length);
    return true;
  }
}
registerProcessor('wall-scrape', ScrapeProcessor);
