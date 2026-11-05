import { readdirSync, readFileSync } from 'node:fs';
import type { CourseGateDocument, CoursePosition, Lateral } from '../../../src/course/course-document.js';
import { RUN_RULE_LIMITS } from '../../../src/course/run-rules.js';
import { compileVehicleMechanicsDocument } from '../../../src/vehicle/definition-document.js';
import { laneCentre, micrometre } from './section-writing.js';
import { GRID_FORMS } from './shared-constants.js';
import { AuthoringError } from '../../authoring/authoring-error.js';

/** A grid's kind: a car grid (`grid`) or a bike grid (`bikeGrid`). */
export type GridKind = 'car' | 'bike';

/** A grid slot as a conversion places it: its station in the entry Section, metres, and its lateral. */
export interface GridPlace {
  readonly s: number;
  readonly lateral: Lateral;
}

/** A place the original stands a vehicle in at GO: metres ahead of the grid's origin and right of it. */
export interface OriginalPlace {
  readonly ahead: number;
  readonly right: number;
}

/**
 * The original's places at GO of a grid's kind: laid by its program's rule, the k-th place in the order it lays them
 * (`rule`), or as it stands them (`places`), its own vehicle's first.
 */
export type OriginalGrid =
  { readonly rule: (k: number) => OriginalPlace } | { readonly places: readonly OriginalPlace[] };

/**
 * Where an original stands its vehicles at GO, which a start's grids' stations follow: `origin`, the place its places
 * are measured from (its own vehicle's, or a circuit's line on P); its places of each kind (`originals`); a circuit's
 * line (`line`, a station), absent on a course that is not a circuit; and the course limits, metres left and right of
 * the origin.
 */
export interface GridStand {
  readonly origin: GridPlace;
  readonly originals: Readonly<Partial<Record<GridKind, OriginalGrid>>>;
  readonly line?: number;
  readonly limits: readonly [left: number, right: number];
}

/**
 * What a start's grids are laid from: where the original stands, and the general form's two lanes, left and right, each
 * `laneWidth` wide, meeting `meet` metres right of the origin.
 */
export interface StartGrids extends GridStand {
  readonly lanes: readonly [left: string, right: string];
  readonly meet: number;
  readonly laneWidth: number;
}

/** The largest body of each kind in the vehicle catalog, metres along and across. */
type Body = { readonly length: number; readonly width: number };
let bodies: Record<GridKind, Body> | undefined;
function largestBodies(): Record<GridKind, Body> {
  if (bodies) return bodies;
  const content = new URL('../../../content/', import.meta.url);
  const largest = { car: { length: 0, width: 0 }, bike: { length: 0, width: 0 } };
  for (const file of readdirSync(new URL('vehicle-listings/', content))) {
    const id = file.replace(/\.json$/, '');
    const { form } = JSON.parse(readFileSync(new URL(`vehicle-listings/${file}`, content), 'utf8')) as {
      form: GridKind;
    };
    const document = `vehicles/${file}`;
    const mechanics = compileVehicleMechanicsDocument(
      JSON.parse(readFileSync(new URL(document, content), 'utf8')),
      id,
      document,
      null,
    );
    if (!mechanics.ok) throw new AuthoringError(mechanics.diagnostics);
    const { overallLength, overallWidth } = mechanics.value.compiledVehicle;
    largest[form] = {
      length: Math.max(largest[form].length, overallLength),
      width: Math.max(largest[form].width, overallWidth),
    };
  }
  return (bodies = largest);
}

/** A lateral moved `metres` right. */
const shifted = (lateral: Lateral, metres: number): Lateral =>
  typeof lateral === 'number'
    ? micrometre(lateral + metres)
    : { ...lateral, offset: micrometre(lateral.offset + metres) };

/** Whether bodies `body` at places `p` and `q` overlap. */
const overlap = (body: Body, p: OriginalPlace, q: OriginalPlace) =>
  Math.abs(q.ahead - p.ahead) < body.length && Math.abs(q.right - p.right) < body.width;

/**
 * The original's places at GO, front to back, as many as a run's competitors: a rule's in the order it lays them; a
 * table's, of places as far along, its own vehicle's first and the rest from the left.
 */
function ordered(original: OriginalGrid): OriginalPlace[] {
  const places =
    'rule' in original
      ? Array.from({ length: RUN_RULE_LIMITS.competitors }, (_, k) => original.rule(k))
      : original.places
          .map((place, i) => ({ place, i }))
          .sort((a, b) => b.place.ahead - a.place.ahead || +(b.i === 0) - +(a.i === 0) || a.place.right - b.place.right)
          .map(({ place }) => place);
  return places.sort((a, b) => b.ahead - a.ahead).slice(0, RUN_RULE_LIMITS.competitors);
}

/**
 * The original's places of kind `kind` as a grid's (`ordered`), spread along the road from the front one by the least
 * factor that parts bodies of the kind's largest; none where two as far along would overlap or one leaves the course
 * limits (`limits`, metres left and right of the origin).
 */
function originalPlaces(kind: GridKind, original: OriginalGrid | undefined, limits: GridStand['limits']) {
  if (!original) return [];
  const body = largestBodies()[kind];
  const places = ordered(original);
  const pairs = places.flatMap((p, i) =>
    places
      .slice(i + 1)
      .filter((q) => overlap(body, p, q))
      .map((q) => [p, q] as const),
  );
  const fits =
    places.every((p) => p.right - body.width / 2 >= -limits[0] && p.right + body.width / 2 <= limits[1]) &&
    pairs.every(([p, q]) => q.ahead !== p.ahead);
  if (!fits) return [];
  const factor = Math.max(1, ...pairs.map(([p, q]) => body.length / (p.ahead - q.ahead)));
  const front = places[0]!.ahead;
  return places.map((p) => ({ ahead: front + (p.ahead - front) * factor, right: p.right }));
}

/**
 * The stations of a start's grid of kind `kind` from the start line back, as many as a run's competitors: the
 * original's places of the kind (`originalPlaces`), at their laterals, on a circuit moved back, whole, to half the
 * kind's largest body before its line where nearer; then the general form's, behind them a row's spacing behind the
 * last, or from the start line where the original stands none of the kind (on a circuit half its largest body before
 * it). The start line of a course that is not a circuit is the front of the original's places of either kind.
 */
function gridStations(kind: GridKind, stand: GridStand) {
  const { origin } = stand;
  const fronts = Object.values(stand.originals).map((original) => ordered(original)[0]!.ahead);
  const line = stand.line ?? origin.s + Math.max(0, ...fronts);
  const front = stand.line === undefined ? line : line - largestBodies()[kind].length / 2;
  const places = originalPlaces(kind, stand.originals[kind], stand.limits);
  const back = places.length > 0 ? Math.min(0, front - (origin.s + places[0]!.ahead)) : 0;
  const originals = places.map((p) => ({ s: origin.s + p.ahead + back, lateral: shifted(origin.lateral, p.right) }));
  const { row, spacing } = GRID_FORMS[kind];
  const first = originals.length > 0 ? originals.at(-1)!.s - spacing : front;
  const general = Array.from(
    { length: RUN_RULE_LIMITS.competitors - originals.length },
    (_, j) => first - Math.floor(j / row) * spacing,
  );
  return { originals, last: places.at(-1), general };
}

/**
 * A start's grid of kind `kind` by the rule ([Original road data](../../../docs/original-road-data.md#the-grid)), front
 * to back (`gridStations`): the general form's slots on the two lanes, cars one a row by turns, the first in the left
 * lane or, behind the original's places, in the lane the last of them is not in; bikes four a row, two in each lane a
 * quarter of its width either side of its centre, left to right.
 */
export function ruleGrid(kind: GridKind, options: StartGrids): GridPlace[] {
  const { lanes, meet, laneWidth } = options;
  const { originals, last, general } = gridStations(kind, options);
  const { row } = GRID_FORMS[kind];
  const across =
    row === 1
      ? [laneCentre(lanes[0]), laneCentre(lanes[1])]
      : lanes.flatMap((lane) => [-1, 1].map((side) => shifted(laneCentre(lane), (side * laneWidth) / 4)));
  const turn = last && last.right < meet ? 1 : 0;
  return [...originals, ...general.map((s, j) => ({ s, lateral: across[row === 1 ? (turn + j) % 2 : j % row]! }))];
}

/** How far behind the origin a start's grids reach: their rearmost slot's distance behind it, metres, at least 0. */
export function gridReach(stand: GridStand): number {
  const stations = (['car', 'bike'] as const).flatMap((kind) => {
    const { originals, general } = gridStations(kind, stand);
    return [...originals.map((o) => o.s), ...general];
  });
  return Math.max(0, ...stations.map((s) => stand.origin.s - s));
}

/** A start gate by the rule: the cars' grid and the bikes' (`ruleGrid`), each slot at its station as written (`at`). */
export function startGate(
  at: (s: number) => CoursePosition,
  options: StartGrids,
): Extract<CourseGateDocument, { readonly kind: 'start' }> {
  const grid = (kind: GridKind) => ruleGrid(kind, options).map((slot) => ({ at: at(slot.s), lateral: slot.lateral }));
  return { kind: 'start', grid: grid('car'), bikeGrid: grid('bike') };
}
