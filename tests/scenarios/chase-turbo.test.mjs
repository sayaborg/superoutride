import { scenarioTests } from './driving-harness.mjs';

// Each newly selectable car drives and renders through the delivered catalog and ordinary FREE PLAY scene.
// Replay checks include the physics state and rendered frame digest, with a rival in the same shared scene.
scenarioTests({
  tsukuba: [
    'PORSCHE_928_S4_1987',
    'TURBO_ESPRIT_1984',
    'COUNTACH_5000_QV_1988',
    '911_TURBO_3_3_1986',
    'FERRARI_GTO_1985',
    'PORSCHE_928_S_1984',
    'TOYOTA_PICKUP_1980',
    'FERRARI_F40_1990',
    'PORSCHE_959_1988',
    'CORVETTE_C4_1984',
    'AUSTIN_MINI_850_1964',
    'WRANGLER_YJ_1995',
    'NOVA_250_1977',
    'NOVA_9C1_1977',
  ].map((vehicleId) => ({
    name: `${vehicleId}: FREE PLAY drive and render`,
    vehicleId,
    policy: 'finish',
    seconds: 25,
    rivals: 1,
    seed: 7,
    bounded: true,
  })),
});
