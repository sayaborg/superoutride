// Synthetic, common macro observations, NOT captured vehicle telemetry or a second tire solver.
const observation = (values = {}) => ({
  longitudinalVelocity: 25,
  lateralVelocity: 0,
  wheelSpeed: 25,
  load: 4000,
  longitudinalPower: 0,
  lateralPower: 0,
  demand: 0,
  ...values,
});
const corner = observation({ lateralVelocity: 4, lateralPower: 12000, demand: 1.5 });
const lock = observation({ longitudinalVelocity: 20, wheelSpeed: 0, longitudinalPower: 60000, demand: 3 });
export const SPECTRAL_SCENARIOS = [
  {
    id: 'corner-sweep',
    label: 'Grip / cornering / recovery',
    seconds: 9,
    steps: [
      [0, observation()],
      [0.5, observation()],
      [2, observation({ lateralVelocity: 0.5, lateralPower: 500, demand: 0.5 })],
      [4, corner],
      [6, corner],
      [8, observation()],
      [9, observation()],
    ],
  },
  {
    id: 'locked-slide',
    label: 'Locked wheel: 20 m/s slide',
    seconds: 5,
    steps: [
      [0, { ...lock, load: 0 }],
      [0.3, lock, 'step'],
      [4, lock],
      [4.1, { ...lock, load: 0 }, 'step'],
    ],
  },
  {
    id: 'wheel-spin',
    label: 'Wheelspin: same speed, slip work and demand as lock',
    seconds: 5,
    steps: [
      [0, { ...lock, wheelSpeed: 40, load: 0 }],
      [0.3, { ...lock, wheelSpeed: 40 }, 'step'],
      [4, { ...lock, wheelSpeed: 40 }],
      [4.1, { ...lock, wheelSpeed: 40, load: 0 }, 'step'],
    ],
  },
  {
    id: 'stationary-spin',
    label: 'Stationary burnout',
    seconds: 5,
    steps: [
      [0, observation({ longitudinalVelocity: 0, wheelSpeed: 0 })],
      [1, observation({ longitudinalVelocity: 0, wheelSpeed: 20, longitudinalPower: 60000, demand: 3 })],
      [3, observation({ longitudinalVelocity: 0, wheelSpeed: 20, longitudinalPower: 60000, demand: 3 })],
      [4, observation({ longitudinalVelocity: 0, wheelSpeed: 0 })],
    ],
  },
  {
    id: 'release-recontact',
    label: 'Abrupt loss of support, then recontact',
    seconds: 6,
    steps: [
      [0, corner],
      [2, { ...corner, load: 0 }, 'step'],
      [3, corner, 'step'],
      [5, { ...corner, load: 0 }, 'step'],
    ],
  },
];

/** The same authored trace can feed all model adapters; step segments remain discontinuous. */
export function spectralScenarioAt(scene, seconds) {
  let i = 0;
  while (i + 1 < scene.steps.length && scene.steps[i + 1][0] <= seconds) i++;
  const [start, a] = scene.steps[i];
  const next = scene.steps[i + 1];
  if (!next || next[2] === 'step') return { ...a };
  const t = Math.max(0, Math.min(1, (seconds - start) / (next[0] - start)));
  return Object.fromEntries(Object.keys(a).map((key) => [key, a[key] + t * (next[1][key] - a[key])]));
}

export function spectralReferenceObservation(v) {
  return {
    load: v.load,
    referenceLoad: 4000,
    travelSpeed: Math.hypot(v.longitudinalVelocity, v.lateralVelocity),
    slipSpeed: Math.hypot(v.wheelSpeed - v.longitudinalVelocity, v.lateralVelocity),
    longitudinalPower: v.longitudinalPower,
    lateralPower: v.lateralPower,
    utilization: v.demand,
    surface: v.load > 0 ? 'ASPHALT' : 'VOID',
  };
}
