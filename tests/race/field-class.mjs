/**
 * A class for a test's run on `course` with the player in `vehicleId`, as its rules reach a run (`ClassRules`):
 * `rivals` rivals of the player's own vehicle in the grid's first slots, their colors drawn by the run's seed, the player
 * in the slot behind them, `laps` laps, `traffic` (none by default) and no clock.
 */
export function fieldClass(course, vehicleId, { rivals = 0, laps = 1, traffic = null } = {}) {
  return Object.freeze({
    course: course.id,
    laps,
    vehicles: [vehicleId],
    entries: Array.from({ length: rivals + 1 }, (_, slot) => ({
      vehicle: vehicleId,
      color: null,
      stages: null,
      slot,
      ahead: null,
    })),
    playerSlot: 'last',
    start: 'grid',
    rankLimits: {},
    traffic,
    timeMargin: null,
    fixedColors: false,
  });
}
