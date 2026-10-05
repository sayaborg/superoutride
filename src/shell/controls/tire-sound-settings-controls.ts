import {
  UNIFIED_SETTING_RANGES,
  resolveUnifiedSettings,
  type UnifiedSettings,
} from '../../audio/tire-unified-acoustics.js';
import {
  ROLLING_SETTING_RANGES,
  resolveRollingSettings,
  type RollingSettings,
} from '../../audio/tire-rolling-acoustics.js';
import {
  SCRAPE_SETTING_RANGES,
  resolveScrapeSettings,
  type ScrapeSettings,
} from '../../audio/wall-scrape-acoustics.js';
import { createSoundSettingsPanel, mountSoundSettingsPanel } from './sound-settings-panel.js';

// Labels only: audio owns defaults, bounds and validation. These are not physical tire settings.
const UNIFIED_LABELS = {
  feedbackMaximumPerSecond: ['Self-excitation strength', '/s'],
  powerReferenceWatts: ['Friction power reference', 'W'],
  noiseForcePerSecond: ['Input noise strength', '/s'],
  lowFrequencyHz: ['Low mode natural frequency', 'Hz'],
  highFrequencyHz: ['High mode natural frequency', 'Hz'],
  outputGainPerSecond: ['Friction Q output gain', '/s'],
  saturationPerSecond: ['Self-excitation saturation (cubic dissipation)', '/s'],
  slipHalfMps: ['Slip at half self-excitation', 'm/s'],
  slipRolloffMps: ['Excitation roll-off at high slip', 'm/s'],
  noiseBandwidthHz: ['Input noise bandwidth', 'Hz'],
  outputCutoffHz: ['Friction Q output LPF', 'Hz'],
  resonanceDampingPerSecond: ['Damping of both modes', '/s'],
  lowParticipation: ['Low mode participation (high is √(1−value²))', ''],
  dcHz: ['Friction Q DC removal', 'Hz'],
} as const satisfies Record<keyof UnifiedSettings, readonly [string, string]>;

const ROLLING_LABELS = {
  toneSeconds: ['Road and wheel frequency smoothing', 's'],
  lowOrder: ['Low band wheel order', 'order'],
  highOrder: ['High band wheel order', 'order'],
  minimumHz: ['Minimum band center', 'Hz'],
  bandwidthRatio: ['Bandwidth ratio', ''],
  loadHalfNewtons: ['Load at half level', 'N'],
  speedHalfMps: ['Speed at half level', 'm/s'],
  speedExponent: ['Speed exponent', ''],
  attackSeconds: ['Level attack', 's'],
  releaseSeconds: ['Level release', 's'],
  textureMinimumDepth: ['Minimum road texture depth', ''],
  textureMaximumHz: ['Maximum texture rate', 'Hz'],
  gain: ['Rolling R output gain', ''],
  outputHz: ['Rolling R output LPF', 'Hz'],
  dcHz: ['Rolling R DC removal', 'Hz'],
} as const satisfies Record<keyof RollingSettings, readonly [string, string]>;

export function mountTireSoundSettings(container: HTMLElement, initial: UnifiedSettings, onChange: () => void) {
  return mountSoundSettingsPanel(
    container,
    createSoundSettingsPanel(
      'UNIFIED · friction Q',
      UNIFIED_SETTING_RANGES,
      resolveUnifiedSettings,
      initial,
      UNIFIED_LABELS,
      onChange,
      'Reset UNIFIED to defaults',
    ),
  );
}

/** The walls' scraping: the same friction-synthesis items and panel as UNIFIED, with its own values. */
export function mountScrapeSoundSettings(container: HTMLElement, initial: ScrapeSettings, onChange: () => void) {
  return mountSoundSettingsPanel(
    container,
    createSoundSettingsPanel(
      'SCRAPE · wall friction',
      SCRAPE_SETTING_RANGES,
      resolveScrapeSettings,
      initial,
      UNIFIED_LABELS,
      onChange,
      'Reset SCRAPE to defaults',
    ),
  );
}

export function mountRollingSoundSettings(container: HTMLElement, initial: RollingSettings, onChange: () => void) {
  return mountSoundSettingsPanel(
    container,
    createSoundSettingsPanel(
      'ROLLING · rolling R',
      ROLLING_SETTING_RANGES,
      resolveRollingSettings,
      initial,
      ROLLING_LABELS,
      onChange,
      'Reset ROLLING to defaults',
    ),
  );
}
