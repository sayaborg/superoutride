import { createHash } from 'node:crypto';
import { ENVELOPE_DRIVER } from '../../src/race/envelope-driver.js';

/** Offline reference policy is part of the reference identity, not vehicle mechanics. */
export const REFERENCE_DRIVER = Object.freeze({ ...ENVELOPE_DRIVER, utilization: 0.9 });

/**
 * The reference driver's one identity: SHA-256 of its record's JSON with sorted keys. Run cache keys, saved
 * reports and report admission all use it.
 */
export const REFERENCE_DRIVER_SHA256 = createHash('sha256')
  .update(JSON.stringify(REFERENCE_DRIVER, Object.keys(REFERENCE_DRIVER).sort()))
  .digest('hex');
