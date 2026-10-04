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
          seconds: 240,
          expect: { outcome: 'GOAL', position: 'P1/2', stop: true, rivalsDrive: true },
        },
        {
          name: 'ARCADE with the RIBBON series traffic',
          mode: 'ARCADE',
          series: 'product',
          policy: 'finish',
          seed: 7,
          seconds: 240,
          // The outcome is open: the player's driver keeps to lanes, so traffic side by side on a two-lane road holds it.
          expect: { traffic: true },
        },
        {
          name: 'TIME TRIAL finish from the last slot',
          mode: 'TIME_TRIAL',
          policy: 'finish',
          seconds: 240,
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
      // Backing beyond the entry is the same on every course; coast runs it.
      ...(stem === 'ribbon-coast' ? [{ name: 'reverse beyond entry', policy: 'reverse', seconds: 15 }] : []),
      // Departures are symmetric, so each course departs to one side: fork to the left, the others to the right.
      {
        name: `departure ${stem === 'ribbon-fork' ? 'left' : 'right'}`,
        policy: 'departure',
        steering: stem === 'ribbon-fork' ? -1 : 1,
        seconds: 20,
      },
      ...(stem === 'ribbon-fork'
        ? [
            ...[0, 1].map((exit) => ({
              name: `fork ${exit === 0 ? 'left' : 'right'} finish`,
              policy: 'finish',
              exit,
              seconds: 180,
            })),
            // Seed 0 sends the rival to exit 0 while the player approaches exit 1.
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
      ...(stem === 'ribbon-coast'
        ? [
            // On RIBBON COAST's first straight the player steers into the left course limit, which pushes it back.
            { name: 'course limit pushes back', policy: 'limit', steering: -0.12, steerSeconds: 4, seconds: 14 },
            // The player keeps to the course's first row of movable objects, knocks them all and drives on over them.
            { name: 'through the cone row', policy: 'cones', seconds: 240 },
          ]
        : []),
      ...sessionRules,
    ];
    for (const scenario of scenarios)
      await t.test(scenario.name, async () => {
        const result = await runScenario(loaded, scenario);
        assert.deepEqual(await runScenario(loaded, scenario), result, 'fixed-input replay diverged');
        t.diagnostic(`${scenario.name}: ${JSON.stringify(result)}`);
      });
  });
}
