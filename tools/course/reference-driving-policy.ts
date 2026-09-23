import { ENVELOPE_DRIVER } from '../../src/race/envelope-driver.js';

/** Offline reference policy is part of the reference identity, not vehicle mechanics. */
export const REFERENCE_DRIVER = Object.freeze({ ...ENVELOPE_DRIVER, utilization: 0.9 });
