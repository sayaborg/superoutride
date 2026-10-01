import { compileStationSequence } from './geometry/station-sequence.js';

interface EnvironmentInterval {
  readonly sStart: number;
  readonly name: string;
}

/** Environment names over the Section ruler. Chainage is the open interval [0, courseLength]. */
export class EnvironmentTimeline {
  readonly intervals: readonly EnvironmentInterval[];

  constructor(
    readonly courseLength: number,
    intervals: readonly EnvironmentInterval[],
  ) {
    this.intervals = compileStationSequence(intervals, { length: courseLength, chainage: 'sStart' });
  }
}
