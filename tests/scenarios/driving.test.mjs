import { scenarioTests } from './driving-harness.mjs';

// Short deterministic scenarios on the product courses TSUKUBA and OUTRUN TEST and the trial course OUTRUN TRIAL A.
scenarioTests({
  tsukuba: [
    // On the home straight the player steers into the left course limit, which pushes it back.
    { name: 'course limit pushes back', policy: 'limit', steering: -0.12, steerSeconds: 4, seconds: 14 },
    // Stopped a quarter turn toward the left course limit with its front contact past the limit, the player keeps
    // both contacts on ground and does not recover.
    { name: 'stopped broadside against a course limit', policy: 'broadside', ahead: 60, reach: 0.6, seconds: 4 },
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
  ],
  // A BRANCH course: the rival, driving from the grid while the player waits there, takes its intended exit's racing line
  // through the first fork (the opposite exit to the player's), holds it and does not recover.
  'outrun-test': [
    {
      name: "a rival takes its intended exit's line through a fork",
      policy: 'branch',
      rivals: 1,
      seed: 2,
      exit: 0,
      seconds: 150,
      bounded: true,
      lineTolerance: 2,
    },
  ],
  'outrun-trial-a': [
    {
      name: 'RACE with the TRIAL series traffic',
      mode: 'RACE',
      series: 'trial',
      class: 'a',
      policy: 'finish',
      seed: 7,
      // A bounded stretch: traffic appears ahead and leaves the view behind the player; the outcome is open.
      seconds: 30,
      bounded: true,
      expect: { traffic: true },
    },
  ],
});
