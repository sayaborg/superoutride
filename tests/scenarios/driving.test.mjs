import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScenarioCourse, runScenario } from './driving-harness.mjs';

for (const stem of ['ribbon-coast', 'ribbon-fork', 'ribbon-ring']) {
  test(`${stem}: deterministic driving scenarios`, async (t) => {
    const loaded = await loadScenarioCourse(stem);
    // Session-rule scenarios: ARCADE uses the test series' settings for the course (session-rules.series.json).
    const sessionRules = {
      'ribbon-coast': [
        {
          name: 'ARCADE finish ahead of a paced rival, then the takeover stops',
          mode: 'ARCADE',
          policy: 'finish',
          afterEndingSeconds: 12,
          seconds: 120,
          expect: { outcome: 'GOAL', position: 'P1/2', stop: true, rivalsDrive: true },
        },
        {
          name: 'ARCADE with the RIBBON series traffic',
          mode: 'ARCADE',
          series: 'product',
          policy: 'finish',
          seed: 7,
          seconds: 120,
          expect: { outcome: 'GOAL', position: 'P1/1', traffic: true },
        },
        {
          name: 'TIME TRIAL finish from the last slot',
          mode: 'TIME_TRIAL',
          policy: 'finish',
          seconds: 120,
          expect: { outcome: 'GOAL', position: 'P1/1' },
        },
      ],
      'ribbon-fork': [
        {
          name: 'ARCADE ahead entry appears and leaves',
          mode: 'ARCADE',
          policy: 'appearance',
          exit: 0,
          seconds: 120,
          expect: { outcome: 'GOAL', position: 'P1/1', appearance: { stage: 2, distance: 80, last: 2 } },
        },
      ],
      'ribbon-ring': [
        {
          name: 'ARCADE rank limit GAME OVER',
          mode: 'ARCADE',
          policy: 'rank',
          afterEndingSeconds: 2,
          seconds: 120,
          expect: { outcome: 'GAME_OVER', cause: 'RANK', position: 'P2/2', rankGate: 'ring-CP1' },
        },
      ],
    }[stem];
    const scenarios = [
      { name: 'reverse beyond entry', policy: 'reverse', exit: 1, seconds: 15 },
      ...[-1, 1].map((steering) => ({
        name: `departure ${steering < 0 ? 'left' : 'right'}`,
        policy: 'departure',
        steering,
        seconds: 20,
      })),
      ...(stem === 'ribbon-fork'
        ? [
            ...[
              { lane: -1, exit: 0 },
              { lane: 1, exit: 1 },
            ].map(({ lane, exit }) => ({
              name: `fork ${exit === 0 ? 'left' : 'right'} finish`,
              policy: 'finish',
              lane,
              exit,
              seconds: 180,
            })),
            // Seed 0 sends the rival to exit 0 while the player approaches exit 1.
            {
              name: 'closed Carriageway entry and recovery',
              policy: 'closed',
              rivals: 1,
              seed: 0,
              rivalExit: 0,
              exit: 1,
              seconds: 180,
            },
            {
              name: 'closed Carriageway through player finish',
              policy: 'closed',
              finish: true,
              rivals: 1,
              seed: 0,
              rivalExit: 0,
              exit: 1,
              seconds: 180,
            },
            {
              name: 'finished rival stops while player waits then finishes',
              policy: 'closed',
              finish: true,
              waitForStop: true,
              rivals: 1,
              seed: 0,
              rivalExit: 0,
              exit: 1,
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
      ...sessionRules,
    ];
    for (const scenario of scenarios)
      await t.test(scenario.name, () => {
        const result = runScenario(loaded, scenario);
        assert.deepEqual(runScenario(loaded, scenario), result, 'fixed-input replay diverged');
        t.diagnostic(`${scenario.name}: ${JSON.stringify(result)}`);
      });
  });
}
