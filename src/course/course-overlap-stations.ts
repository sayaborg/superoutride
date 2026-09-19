import { COURSE_DOCUMENT_LIMITS } from './course-document.js';
import { CourseInputError } from './course-diagnostics.js';

/** Retain exact stations from both rulers; a seam-relative round trip can lose an activation endpoint. */
export function compileCourseOverlapStations(
  source: { readonly seam: number; readonly stations: readonly number[] },
  destination: { readonly seam: number; readonly stations: readonly number[] },
  overlap: { readonly behind: number; readonly ahead: number },
  path: string,
) {
  const table = new Map<number, { delta: number; source: number; destination: number }>();
  const station = (delta: number) => {
    let value = table.get(delta);
    if (!value) {
      value = { delta, source: source.seam + delta, destination: destination.seam + delta };
      table.set(delta, value);
    }
    return value;
  };
  const extent = [-overlap.behind, 0, overlap.ahead];
  for (const delta of extent) station(delta);
  for (const [key, ruler] of [
    ['source', source],
    ['destination', destination],
  ] as const) {
    const offsets = new Map(extent.map((delta) => [delta, ruler.seam + delta]));
    for (const s of ruler.stations) {
      if (s < ruler.seam - overlap.behind || s > ruler.seam + overlap.ahead) continue;
      const delta =
        s === ruler.seam - overlap.behind
          ? -overlap.behind
          : s === ruler.seam + overlap.ahead
            ? overlap.ahead
            : s - ruler.seam;
      if (offsets.has(delta) && offsets.get(delta) !== s)
        throw new CourseInputError(
          'semantic_compile_failure',
          `${path}/${key}`,
          'Distinct ruler stations must remain distinguishable in overlap coordinates',
        );
      offsets.set(delta, s);
      station(delta)[key] = s;
    }
  }
  const stations = [...table.values()].sort((a, b) => a.delta - b.delta);
  if (stations.length - 1 > COURSE_DOCUMENT_LIMITS.linkCells)
    throw new CourseInputError(
      'resource_limit',
      path,
      `Link overlap exceeds ${COURSE_DOCUMENT_LIMITS.linkCells} cells`,
    );
  for (let i = 1; i < stations.length; i += 1)
    if (stations[i]!.source < stations[i - 1]!.source || stations[i]!.destination < stations[i - 1]!.destination)
      throw new CourseInputError('semantic_compile_failure', path, 'Overlap partition must preserve ruler order');
  return Object.freeze(stations.map((s) => Object.freeze(s)));
}
