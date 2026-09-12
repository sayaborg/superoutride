import { createStadiumScene } from './helpers/stadium-scene.mjs';

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { GroundMapLogicalProfile } from '../dist/groundmap/logical-profile.js';

import { GROUND_COLORS, sampleGroundMap } from '../dist/groundmap/ground-map.js';

describe('hill and cliff scenery', () => {
  const { guide, groundProfile } = createStadiumScene();

  test('GroundMap source sampling distinguishes road, shoulder, marking and terrain', () => {
    assert.equal(sampleGroundMap(3, 0, groundProfile), GROUND_COLORS.marking);
    assert.ok([GROUND_COLORS.asphaltA, GROUND_COLORS.asphaltB].includes(sampleGroundMap(9, 2, groundProfile)));
    assert.equal(sampleGroundMap(9, 5, groundProfile), GROUND_COLORS.shoulder);
    assert.ok([GROUND_COLORS.grassA, GROUND_COLORS.grassB].includes(sampleGroundMap(9, 8, groundProfile)));
    assert.ok(
      [GROUND_COLORS.rockA, GROUND_COLORS.rockB].includes(
        sampleGroundMap(9, -8, {
          ...groundProfile,
          logical: new GroundMapLogicalProfile(guide.length, [
            { sStart: 0, name: 'rock', left: 'ROCK', right: 'GRASS' },
          ]),
        }),
      ),
    );
  });
});
