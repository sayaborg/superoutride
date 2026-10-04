// Milliseconds: display-only budget of 0.1 ns for accumulated fixed steps at an integer-ms tie.
// For example, 60 additions of 1/60 s err by about 1e-12 ms; ranking/deadlines remain exact.
const TIMER_ROUNDING_TOLERANCE_MILLISECONDS = 1e-7;

/** Race seconds as the whole milliseconds displays and records keep: floored, after the rounding tolerance. */
export function raceMilliseconds(seconds: number): number {
  return Math.floor(seconds * 1000 + TIMER_ROUNDING_TOLERANCE_MILLISECONDS);
}

/** The one time format: minutes ' seconds " thousandths, such as 1'23"456, of whole milliseconds. */
export function formatRaceTime(seconds: number): string {
  return formatMilliseconds(raceMilliseconds(seconds));
}

/** Whole milliseconds as `1'23"456`. */
export function formatMilliseconds(totalMilliseconds: number): string {
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const secondsPart = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}'${secondsPart.toString().padStart(2, '0')}"${milliseconds.toString().padStart(3, '0')}`;
}

/** A difference in whole milliseconds, signed: `-0"312`, `+0"312`, with minutes from one minute on (`-1'02"312`). */
export function formatTimeDifference(milliseconds: number): string {
  const sign = milliseconds < 0 ? '-' : '+',
    magnitude = Math.abs(milliseconds);
  const seconds = Math.floor((magnitude % 60_000) / 1000),
    thousandths = String(magnitude % 1000).padStart(3, '0');
  return magnitude < 60_000
    ? `${sign}${seconds}"${thousandths}`
    : `${sign}${Math.floor(magnitude / 60_000)}'${String(seconds).padStart(2, '0')}"${thousandths}`;
}
