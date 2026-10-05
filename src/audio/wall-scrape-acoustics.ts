import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
import { UNIFIED_SETTING_RANGES, resolveFrictionSettings, type UnifiedSettings } from './tire-unified-acoustics.js';

/**
 * The walls' scraping: the friction synthesis with its own listening settings (DEV SCRAPE panel), the same items as the
 * tire's UNIFIED. Only the work reference has its own range, about a quarter to four times its default, since a wall's
 * friction removes far more power than a tire's contact. NOT measured wall properties.
 */
export type ScrapeSettings = UnifiedSettings;

export const SCRAPE_SETTING_RANGES = Object.freeze({
  ...UNIFIED_SETTING_RANGES,
  powerReferenceWatts: { min: 22500, max: 360000, step: 2500 },
});

/** The scraping kernel's seed: a structural constant, like the tire's. */
export const SCRAPE_SEED = 0x5c2a9e17;

export function resolveScrapeSettings(value: Partial<ScrapeSettings> = {}): ScrapeSettings {
  return resolveFrictionSettings('scrape', SCRAPE_SETTING_RANGES, DEFAULT_AUDIO_SETTINGS.scrape, value);
}
