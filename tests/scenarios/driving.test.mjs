import { scenarioTests } from './driving-harness.mjs';

// Short deterministic scenarios on the product course TSUKUBA.
scenarioTests({
  tsukuba: [
    // On the home straight the player steers into the left course limit, which pushes it back.
    { name: 'course limit pushes back', policy: 'limit', steering: -0.12, steerSeconds: 4, seconds: 14 },
    // Stopped a quarter turn toward the left course limit with its front contact past the limit, the player keeps
    // both contacts on ground and does not recover.
    { name: 'stopped broadside against a course limit', policy: 'broadside', ahead: 60, reach: 0.6, seconds: 4 },
    // Lifted 2 m above the home straight at 12 m/s in first gear with the throttle open, the player's driven wheels
    // spin the engine up to the fuel cut in the air and its gear holds, for its speed keeps first gear.
    {
      name: 'wheels spinning in the air shift no gear',
      policy: 'airborne',
      ahead: 60,
      height: 2,
      speed: 12,
      seconds: 2,
      bounded: true,
    },
    // A TIME ATTACK on a circuit has no finish: the player laps alone from the last slot until ending the run, here
    // after one lap of TSUKUBA, the quickest lap to drive.
    {
      name: 'TIME ATTACK lap without a finish from the last slot',
      mode: 'TIME_ATTACK',
      class: 'tsukuba',
      policy: 'finish',
      endAfterLaps: 1,
      seconds: 120,
      expect: { outcome: 'ENDED', position: 'P1/1' },
    },
    // RACE with traffic on TSUKUBA, the test series' traffic class: a bounded stretch in which traffic appears ahead and
    // leaves the view behind the player; the outcome is open.
    {
      name: 'RACE with the test series traffic',
      mode: 'RACE',
      class: 'traffic',
      policy: 'finish',
      seed: 7,
      seconds: 30,
      bounded: true,
      expect: { traffic: true },
    },
  ],
});
