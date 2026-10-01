import { clamp } from '../core/math.js';
import { paceScheduleStations, type PaceSchedule, type PaceTimes } from '../content/pace-schedule.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import { routeSectionS, type CourseRoute, type RouteOccurrence } from '../course/course-route.js';
import type { CompiledDriving } from '../vehicle/physics/compiled-driving.js';

/**
 * An ARCADE rival's pace: its target times are the player vehicle's schedule divided by the pace ratio, summed by
 * Section along the Route the rival runs. A grid rival's targets count from GO along the start schedule; a rival
 * joining later counts from where and when it joins. Its target utilization is proportional to its schedule
 * difference (race time minus target time): the minimum at minus the band or below, the maximum at plus the band or
 * above. Its utilization starts at the middle of its bounds and follows the target with the response time constant;
 * its speed cap, as a fraction of its maximum speed, runs linearly from the minimum speed fraction at the minimum
 * utilization to 1 at the maximum. Where its schedule times no station, both hold, and the next timed station
 * re-anchors the targets. It reads nothing else, in particular not the player's position.
 */
export function createRivalPace(
  route: CourseRoute,
  schedule: PaceSchedule,
  ratio: number,
  bounds: CompiledDriving['rivalPace'],
  stepSeconds: number,
) {
  const { minimumUtilization, maximumUtilization, minimumSpeedFraction, bandSeconds, responseSeconds } = bounds;
  const span = maximumUtilization - minimumUtilization;
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
    /** The speed cap's fraction of the rival's maximum speed at its utilization. */
    get speedFraction() {
      return span > 0
        ? minimumSpeedFraction + ((utilization - minimumUtilization) / span) * (1 - minimumSpeedFraction)
        : 1;
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
      const difference = raceSeconds - (zeroSeconds + local / ratio);
      const target = minimumUtilization + span * clamp((difference + bandSeconds) / (2 * bandSeconds), 0, 1);
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
