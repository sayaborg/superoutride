import { paceScheduleStations, type PaceSchedule, type PaceTimes } from '../content/pace-schedule.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import { routeSectionS, type CourseRoute, type RouteOccurrence } from '../course/course-route.js';
import type { CompiledDriving } from '../vehicle/physics/compiled-driving.js';

/**
 * An ARCADE rival's pace: its target times are the player vehicle's schedule divided by the pace ratio, summed by
 * Section along the Route the rival runs. A grid rival's targets count from GO along the start schedule; a rival
 * joining later counts from where and when it joins. Its utilization starts at the middle of its bounds and responds,
 * with the bounds' time constant, toward the maximum while it is behind its target time and toward the minimum
 * otherwise. Where its schedule times no station, the utilization holds, and the next timed station re-anchors the
 * targets. It reads nothing else, in particular not the player's position.
 */
export function createRivalPace(
  route: CourseRoute,
  schedule: PaceSchedule,
  ratio: number,
  bounds: CompiledDriving['rivalPace'],
  stepSeconds: number,
) {
  const { minimumUtilization, maximumUtilization, responseSeconds } = bounds;
  const response = 1 - Math.exp(-stepSeconds / responseSeconds);
  const timesOf = (occurrence: RouteOccurrence) =>
    occurrence.ordinal === 0 ? schedule.start : schedule.section(occurrence.section);
  let utilization = (minimumUtilization + maximumUtilization) / 2;
  // The current occurrence, its schedule and the race time at that schedule's zero; NaN until anchored.
  let ordinal = 0;
  let times: PaceTimes | null = schedule.start;
  let zeroSeconds = 0;
  const stationsBySection = new Map<CompiledSection, readonly number[]>();
  const secondsAt = (record: PaceTimes, station: number) => {
    let stations = stationsBySection.get(record.section);
    if (!stations) stationsBySection.set(record.section, (stations = paceScheduleStations(record.section)));
    return scheduleSeconds(record, stations, station);
  };
  return Object.freeze({
    get utilization() {
      return utilization;
    },
    /** Join the Session at route station `s`: on schedule at the first station its schedule times. */
    join(s: number) {
      const occurrence = route.at(s)!;
      ordinal = occurrence.ordinal;
      times = timesOf(occurrence);
      zeroSeconds = NaN;
    },
    /** One step's response to the rival's route station `s` at race time `raceSeconds`. */
    update(s: number, raceSeconds: number) {
      const at = route.at(s);
      for (; at && ordinal < at.ordinal; ordinal += 1) {
        const occurrence = route.occurrences[ordinal]!;
        const end = times && secondsAt(times, occurrence.section.coordinates.domain.end);
        zeroSeconds = end === null ? NaN : zeroSeconds + end / ratio;
        times = timesOf(route.occurrences[ordinal + 1]!);
      }
      const local = times && secondsAt(times, routeSectionS(route.occurrences[ordinal]!, s));
      if (local === null) return;
      if (Number.isNaN(zeroSeconds)) zeroSeconds = raceSeconds - local / ratio;
      const target = raceSeconds > zeroSeconds + local / ratio ? maximumUtilization : minimumUtilization;
      utilization += (target - utilization) * response;
    },
  });
}

/**
 * The schedule's seconds at a native station of its Section, interpolated between the Section's schedule stations;
 * null where it times none.
 */
function scheduleSeconds(times: PaceTimes, stations: readonly number[], station: number): number | null {
  const { first, milliseconds } = times;
  if (!(station >= stations[0]!) || station > stations.at(-1)!) return null;
  let k = Math.min(stations.length - 2, Math.floor((station - stations[0]!) / (stations[1]! - stations[0]!)));
  while (k > 0 && station < stations[k]!) k -= 1;
  while (k < stations.length - 2 && station > stations[k + 1]!) k += 1;
  const i = k - first;
  if (i < 0 || i + 1 >= milliseconds.length) return null;
  const a = stations[k]!,
    b = stations[k + 1]!;
  return (milliseconds[i]! + ((station - a) / (b - a)) * (milliseconds[i + 1]! - milliseconds[i]!)) / 1000;
}
