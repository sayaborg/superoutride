// Authored acoustic observations for auditions, not a driving simulation.
export const TIRE_AUDITION_SECONDS = 9;
export const TIRE_AUDITION_PHASES = [
  {
    load: 4000,
    longitudinalVelocity: 25,
    lateralVelocity: 0,
    wheelSpeed: 25,
    wheelAngularSpeed: 25 / 0.3,
    longitudinalPower: 0,
    lateralPower: 0,
    surface: 'ASPHALT',
  },
  { lateralVelocity: 5, lateralPower: 8000 },
  { lateralVelocity: 10, lateralPower: 30000 },
  { lateralVelocity: 0, lateralPower: 0 },
  { wheelSpeed: 0, wheelAngularSpeed: 0, longitudinalPower: 45000 },
  { surface: 'DIRT' },
  { load: 0, longitudinalVelocity: 0, longitudinalPower: 0, lateralPower: 0 },
];
