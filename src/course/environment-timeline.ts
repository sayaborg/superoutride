import { compileStationSequence, stationSequenceChainage, stationIndexAt } from './geometry/station-sequence.js';

interface EnvironmentInterval {
  readonly sStart: number;
  readonly name: string;
}

export interface EnvironmentReader {
  readonly intervals: readonly EnvironmentInterval[];
  sample(s: number): EnvironmentInterval;
  distanceToNextInterval(s: number): number;
}

/** Environment names over the Section ruler. Chainage is the open interval [0, courseLength]. */
export class EnvironmentTimeline implements EnvironmentReader {
  readonly intervals: readonly EnvironmentInterval[];

  constructor(
    readonly courseLength: number,
    intervals: readonly EnvironmentInterval[],
  ) {
    this.intervals = compileStationSequence(intervals, { length: courseLength, chainage: 'sStart' });
  }

  sample(s: number): EnvironmentInterval {
    const local = stationSequenceChainage(s, this.courseLength);
    return this.intervals[stationIndexAt(this.intervals, 'sStart', local)]!;
  }

  distanceToNextInterval(s: number): number {
    const local = stationSequenceChainage(s, this.courseLength);
    if (local === this.courseLength) return 0;
    const index = stationIndexAt(this.intervals, 'sStart', local);
    return (this.intervals[index + 1]?.sStart ?? this.courseLength) - local;
  }
}
