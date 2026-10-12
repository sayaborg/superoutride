import { scenarioTests } from './driving-harness.mjs';

// An ARCADE race on the product course TSUKUBA through the test series (session-rules.series.json): one lap from the
// pole with rivals behind, its rank and GOAL, then the takeover stops the player on its runout while the field drives.
scenarioTests({
  tsukuba: [
    {
      name: 'ARCADE lap from the grid ahead of rivals, then the takeover stops',
      mode: 'ARCADE',
      class: 'tsukuba',
      policy: 'finish',
      afterEndingSeconds: 16,
      seconds: 120,
      expect: { outcome: 'GOAL', position: 'P1/3', stop: true, rivalsDrive: true },
    },
  ],
});
