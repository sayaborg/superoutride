// Authored acoustic observations for auditions, not a driving simulation.
export const TIRE_AUDITION_SECONDS = 9;
export const TIRE_AUDITION_PHASES = [
  {
    load: 4000,
    slipSpeed: 0,
    utilization: 0.2,
    longitudinalPower: 0,
    lateralPower: 0,
    surface: 'ASPHALT',
  },
  { slipSpeed: 5, utilization: 0.85, lateralPower: 8000 },
  { slipSpeed: 10, utilization: 1.2, lateralPower: 30000 },
  { slipSpeed: 0, utilization: 0.2, lateralPower: 0 },
  { slipSpeed: 25, utilization: 1.2, longitudinalPower: 45000 },
  { surface: 'DIRT' },
  { load: 0, slipSpeed: 0, longitudinalPower: 0, lateralPower: 0 },
];
