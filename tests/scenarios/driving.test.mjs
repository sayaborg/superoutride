import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScenarioCourse, runScenario } from './driving-harness.mjs';

for (const stem of ['ribbon-coast', 'ribbon-fork', 'ribbon-ring']) {
  test(`${stem}: deterministic driving scenarios`, async (t) => {
    const loaded = await loadScenarioCourse(stem);
    const scenarios = [
      { name: 'reverse beyond entry', policy: 'reverse', seconds: 15 },
      ...[-1, 1].map((side) => ({
        name: `departure ${side < 0 ? 'left' : 'right'}`,
        policy: 'departure',
        side,
        seconds: 20,
      })),
      ...(stem === 'ribbon-fork'
        ? [
            ...[-1, 1].map((side) => ({
              name: `fork ${side < 0 ? 'left' : 'right'} finish`,
              policy: 'finish',
              side,
              seconds: 180,
            })),
            { name: 'closed Carriageway entry and recovery', policy: 'closed', rivals: 1, seconds: 180 },
            {
              name: 'closed Carriageway through player finish',
              policy: 'closed',
              finish: true,
              rivals: 1,
              seconds: 180,
            },
            {
              name: 'finished rival stops while player waits then finishes',
              policy: 'closed',
              finish: true,
              waitForStop: true,
              rivals: 1,
              seconds: 180,
            },
          ]
        : [
            {
              name: 'finish with rivals',
              policy: 'finish',
              rivals: 2,
              laps: stem === 'ribbon-ring' ? 3 : 1,
              seconds: 300,
            },
          ]),
    ];
    for (const scenario of scenarios)
      await t.test(scenario.name, () => {
        const result = runScenario(loaded, scenario);
        assert.deepEqual(runScenario(loaded, scenario), result, 'fixed-input replay diverged');
        t.diagnostic(`${scenario.name}: ${JSON.stringify(result)}`);
      });
  });
}
