import { mostFrequent } from './statistics.js';

/** One stripe edge followed through the frames: the frames it is read on, its rows there, and whether each counts. */
export interface StripeTrack {
  readonly frames: Int32Array;
  readonly rows: Float64Array;
  readonly weight: Float64Array;
}

/** How the current profile places a frame's rows. */
export interface StripeView {
  /** The station a frame's row lies at (NaN where it lies on none). */
  station(t: number, y: number): number;
  /** The row a station stands at in a frame (NaN where it stands on none). */
  row(t: number, station: number): number;
}

/**
 * The stripe edges of a video's main road followed through its frames, each frame's edges (`edges[t]`, rows) placed by
 * the current profile (`view`). An edge continues a track when it is the nearest to the row the track's station stands
 * at in this frame, the track is the nearest to it, and it lies within the rows' rounding there: half a row, and half a
 * row of the track's last reading carried to this frame. Rows where one row spans more than half a stripe period are
 * left out, since there a stripe may fall between rows. The half period is the most frequent gap between the stations
 * of consecutive edges followed into the nearest octave of depth, where every stripe spans rows: below twice the median
 * of each frame's nearest reading's depth. Tracks of three readings or more are kept (one fixes the station, and its
 * rejection needs two more to judge it).
 */
export function followStripes(
  edges: readonly Float64Array[],
  frameStations: readonly number[],
  view: StripeView,
): { tracks: StripeTrack[]; halfPeriod: number } {
  const follow = (span: number) => {
    const tracks: { frames: number[]; rows: number[] }[] = [];
    let open: { track: (typeof tracks)[number]; t: number; y: number }[] = [];
    edges.forEach((here, t) => {
      if (!here.length) return;
      const kept = Array.from(here).filter((y) => spanOf(t, y) <= span);
      const predicted = open.map(({ t: last, y }) => {
        const station = view.station(last, y);
        const at = view.row(t, station);
        const reach = Math.abs(view.row(t, view.station(last, y + 0.5)) - view.row(t, view.station(last, y - 0.5)));
        return { at, reach: 0.5 + 0.5 * (Number.isFinite(reach) ? reach : Infinity) };
      });
      const nearest = (values: readonly number[], x: number) => {
        let best = -1;
        values.forEach((value, i) => {
          if (Number.isFinite(value) && (best < 0 || Math.abs(value - x) < Math.abs(values[best]! - x))) best = i;
        });
        return best;
      };
      const at = predicted.map((p) => p.at);
      open = kept.map((y, k) => {
        const p = nearest(at, y);
        const continues = p >= 0 && Math.abs(at[p]! - y) <= predicted[p]!.reach && nearest(kept, at[p]!) === k;
        const track = continues ? open[p]!.track : { frames: [], rows: [] };
        if (!continues) tracks.push(track);
        track.frames.push(t);
        track.rows.push(y);
        return { track, t, y };
      });
    });
    return tracks;
  };
  // The chainage one row spans at a frame's row.
  const spanOf = (t: number, y: number) => Math.abs(view.station(t, y + 0.5) - view.station(t, y - 0.5));
  const depth = (t: number, y: number) => view.station(t, y) - frameStations[t]!;
  const all = follow(Infinity);
  const nearestDepths = edges
    .map((here, t) => Math.min(...Array.from(here, (y) => depth(t, y)).filter(Number.isFinite)))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const near = 2 * nearestDepths[nearestDepths.length >> 1]!;
  const stations = all
    .filter((track) => track.frames.length >= 3 && depth(track.frames.at(-1)!, track.rows.at(-1)!) < near)
    .map((track) => view.station(track.frames.at(-1)!, track.rows.at(-1)!))
    .sort((a, b) => a - b);
  const halfPeriod = mostFrequent(stations.slice(1).map((s, i) => s - stations[i]!));
  const tracks = follow(halfPeriod)
    .filter((track) => track.frames.length >= 3)
    .map((track) => ({
      frames: Int32Array.from(track.frames),
      rows: Float64Array.from(track.rows),
      weight: new Float64Array(track.frames.length).fill(1),
    }));
  return { tracks, halfPeriod };
}
