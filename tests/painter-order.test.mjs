import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { mergeTerrainAndSprites } from '../dist/graphics/painter-merge.js';

describe('sprite presentation', () => {
  test('Painter merge is far-to-near and terrain wins the equal-depth tie before sprite', () => {
    const terrain = [
      { d: 10, id: 'T10' },
      { d: 5, id: 'T5' },
    ];
    const sprites = [
      { d: 10, id: 'S10' },
      { d: 7, id: 'S7' },
    ];
    const order = [];
    mergeTerrainAndSprites(
      terrain,
      sprites,
      (item) => order.push(item.id),
      (item) => order.push(item.id),
    );
    assert.deepEqual(order, ['T10', 'S10', 'S7', 'T5']);
  });
});
