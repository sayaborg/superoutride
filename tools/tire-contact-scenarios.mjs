// Diagnostic inputs in representative-contact units, NOT a conversion from game axle telemetry.
// Each row: start seconds, front [road travel, local slip, local N], rear [road travel, local slip, local N].
export const CONTACT_SCENARIOS = [
  {
    id: 'rolling',
    label: 'Paved: ordinary rolling',
    texture: 'paved',
    seconds: 5,
    steps: [
      [0, [30, 0, 5], [30, 0, 5]],
      [4, [0, 0, 0], [0, 0, 0]],
    ],
  },
  {
    id: 'slip-sweep',
    label: 'Paved: slip grows, weakens, recovers',
    texture: 'paved',
    seconds: 9,
    steps: [
      [0, [30, 0, 5], [30, 0, 5]],
      [1, [30, 0.05, 5], [30, 0.05, 5]],
      [2, [30, 0.25, 5], [30, 0.25, 5]],
      [3, [30, 0.5, 5], [30, 0.5, 5]],
      [4, [30, 0.8, 5], [30, 0.8, 5]],
      [5, [30, 3, 5], [30, 3, 5]],
      [6, [30, 0.5, 5], [30, 0.5, 5]],
      [7, [30, 0, 5], [30, 0, 5]],
      [8, [0, 0, 0], [0, 0, 0]],
    ],
  },
  {
    id: 'front-slide',
    label: 'Front slides; rear keeps rolling',
    texture: 'paved',
    seconds: 5,
    steps: [
      [0, [30, 0, 5], [30, 0, 5]],
      [1, [30, 0.5, 5], [30, 0, 5]],
      [3, [30, 0, 5], [30, 0, 5]],
      [4, [0, 0, 0], [0, 0, 0]],
    ],
  },
  {
    id: 'rear-spin',
    label: 'Rear friction without road travel',
    texture: 'paved',
    seconds: 5,
    steps: [
      [0, [0, 0, 5], [0, 0, 5]],
      [1, [0, 0, 5], [0, 0.5, 5]],
      [3, [0, 0, 5], [0, 0, 5]],
      [4, [0, 0, 0], [0, 0, 0]],
    ],
  },
  {
    id: 'loose',
    label: 'Loose sketch: rolling and rubbing, no velocity weakening',
    texture: 'loose',
    seconds: 5,
    steps: [
      [0, [30, 0, 5], [30, 0, 5]],
      [1, [30, 0.5, 5], [30, 0.5, 5]],
      [3, [30, 0, 5], [30, 0, 5]],
      [4, [0, 0, 0], [0, 0, 0]],
    ],
  },
  {
    id: 'airborne',
    label: 'Zero support, even with travel and slip',
    texture: 'paved',
    seconds: 3,
    steps: [[0, [30, 0.5, 0], [30, 0.8, 0]]],
  },
];
