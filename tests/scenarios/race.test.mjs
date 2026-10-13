import { scenarioTests } from './driving-harness.mjs';

// A RACE on the product course TSUKUBA through the test series (run-rules.series.json): one lap from the
// pole with rivals behind, its rank and GOAL, then the takeover stops the player on its runout while the field drives.
scenarioTests({
  tsukuba: [
    {
      name: 'RACE lap from the grid ahead of rivals, then the takeover stops',
      mode: 'RACE',
      class: 'tsukuba',
      policy: 'finish',
      afterEndingSeconds: 16,
      seconds: 120,
      expect: { outcome: 'GOAL', position: 'P1/3', stop: true, rivalsDrive: true },
    },
  ],
});
