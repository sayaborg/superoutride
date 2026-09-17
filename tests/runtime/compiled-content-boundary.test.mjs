import assert from 'node:assert/strict';
import test from 'node:test';
import { compileRouteDag, createRouteDagState, updateRouteDag } from '../../dist/gameplay/route-dag.js';
import { GroundMapLogicalProfile } from '../../dist/groundmap/logical-profile.js';
import { VisualProfile } from '../../dist/visual/visual-profile.js';

test('invalid authored GroundBase colors fail before numeric coercion in the visual source', () => {
  for (const color of [NaN, Infinity, -1, 0.5, 0x100000000]) {
    const section = {
      sStart: 0,
      name: 'test',
      groundBaseLeft: { kind: 'color', color },
      groundBaseRight: { kind: 'transparent' },
    };
    assert.throws(() => new VisualProfile(100, [section]), RangeError);
  }
});

test('compiled route observations cannot mutate validated graph topology', () => {
  const route = compileRouteDag(
    'a',
    [
      { id: 'a', kind: 'STAGE' },
      { id: 'b', kind: 'TERMINAL' },
    ],
    [{ id: 'a-b', fromStageId: 'a', toStageId: 'b' }],
  );
  const first = createRouteDagState(route);
  const result = updateRouteDag(first, route, { kind: 'TRANSITION', choiceId: 'a-b' });
  assert.throws(() => {
    result.acceptedChoice.toStageId = 'a';
  }, TypeError);
  assert.throws(() => {
    route.stages[1].kind = 'STAGE';
  }, TypeError);
  const second = createRouteDagState(route);
  updateRouteDag(second, route, { kind: 'TRANSITION', choiceId: 'a-b' });
  assert.equal(updateRouteDag(second, route, { kind: 'FINISH', stageId: 'b' }).justFinished, true);
});

test('unknown logical GroundMap materials fail authoring rather than rendering as grass', () => {
  for (const groundMapLeft of ['SOIL', 'toString', undefined]) {
    assert.throws(
      () =>
        new GroundMapLogicalProfile(100, [
          {
            sStart: 0,
            name: 'invalid',
            left: groundMapLeft,
            right: 'GRASS',
          },
        ]),
      /unknown GroundMap material/,
    );
  }
});
