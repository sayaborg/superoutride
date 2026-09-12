import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { VisualProfile } from '../dist/visual/visual-profile.js';

describe('authored boundary regressions', () => {
  // Regression: looking ahead with s+epsilon skipped the next boundary while sample(s)
  // still selected the preceding material. Arbitrarily narrow positive intervals are authored data.
  test('visual boundary distance agrees with sampling on both sides of a sub-tolerance interval', () => {
    const base = { groundBaseLeft: { kind: 'transparent' }, groundBaseRight: { kind: 'transparent' } };
    const start = 30,
      end = start + 5e-10;
    const visual = new VisualProfile(100, [
      { ...base, sStart: 0, name: 'before' },
      { ...base, sStart: start, name: 'sliver' },
      { ...base, sStart: end, name: 'after' },
    ]);
    for (const s of [start - 2e-10, start, (start + end) / 2, end]) {
      const expected = s < start ? start : s < end ? end : 100;
      assert.equal(visual.distanceToNextSection(s), expected - s);
      assert.equal(visual.sample(s).name, s < start ? 'before' : s < end ? 'sliver' : 'after');
    }
  });
});
