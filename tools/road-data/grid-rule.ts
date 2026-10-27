import { readdirSync, readFileSync } from 'node:fs';
import type { Lateral } from '../../src/course/course-document.js';
import { RUN_RULE_LIMITS } from '../../src/course/run-rules.js';
import { compileVehicleMechanicsDocument } from '../../src/vehicle/definition-document.js';
import { laneCentre, micrometre } from './section-writing.js';

/** A grid's kind: a car grid (`grid`) or a bike grid (`bikeGrid`). */
export type GridKind = 'car' | 'bike';

/**
 * Each kind's general form (K, 2026-10-25): cars one a row, alternately at the two lanes' centres from the left, 12 m
 * apart; bikes four a row, two in each lane a quarter of its width either side of its centre, the rows 3 m apart.
 */
const GENERAL = Object.freeze({ car: { row: 1, spacing: 12 }, bike: { row: 4, spacing: 3 } });

/** A grid slot as a conversion places it: its station in the entry Section, metres, and its lateral. */
export interface GridPlace {
  readonly s: number;
  readonly lateral: Lateral;
}

/** A rival the original places at GO: metres ahead of the player's slot and right of it. */
export interface OriginalPlace {
  readonly ahead: number;
  readonly right: number;
}

/** The largest body of each kind in the vehicle catalog, metres along and across. */
type Body = { readonly length: number; readonly width: number };
let bodies: Record<GridKind, Body> | undefined;
function largestBodies(): Record<GridKind, Body> {
  if (bodies) return bodies;
  const content = new URL('../../content/', import.meta.url);
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
    if (!mechanics.ok) throw new Error(`${document} is not admitted`);
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

/**
 * A grid of kind `kind` by the rule ([Original road data](../../docs/original-road-data.md#the-grid)), front to back,
 * as many slots as a run's competitors: the player's slot `player`; the original's rivals of the kind `originals` where
 * it places them, unless a body of the kind's largest would overlap another or leave the course limits (`limits`,
 * metres left and right of the player's lateral), when the grid is the general form alone; the rest forward of the
 * frontmost slot in the general form on `lanes`, each `laneWidth` wide, the slots counted on from the player's, the
 * original's among them.
 */
export function ruleGrid(options: {
  readonly kind: GridKind;
  readonly player: GridPlace;
  readonly originals: readonly OriginalPlace[];
  readonly lanes: readonly [left: string, right: string];
  readonly laneWidth: number;
  readonly limits: readonly [left: number, right: number];
}): GridPlace[] {
  const { kind, player, lanes, laneWidth, limits } = options;
  const body = largestBodies()[kind];
  const places = [{ ahead: 0, right: 0 }, ...options.originals];
  const fits =
    places.every((p) => p.right - body.width / 2 >= -limits[0] && p.right + body.width / 2 <= limits[1]) &&
    places.every((p, i) =>
      places
        .slice(i + 1)
        .every((q) => Math.abs(q.ahead - p.ahead) >= body.length || Math.abs(q.right - p.right) >= body.width),
    );
  const originals = (fits ? options.originals : []).map((p) => ({
    s: player.s + p.ahead,
    lateral: shifted(player.lateral, p.right),
  }));
  const front = Math.max(player.s, ...originals.map((place) => place.s));
  const { row, spacing } = GENERAL[kind];
  const across =
    row === 1
      ? [laneCentre(lanes[0]), laneCentre(lanes[1])]
      : lanes.flatMap((lane) => [-1, 1].map((side) => shifted(laneCentre(lane), (side * laneWidth) / 4)));
  const made = Array.from({ length: RUN_RULE_LIMITS.competitors - 1 - originals.length }, (_, j) => ({
    s: front + (Math.floor(j / row) + 1) * spacing,
    // One a row: counted on from the player's slot, the first at the left lane, alternating; four a row, left to right.
    lateral: across[row === 1 ? (originals.length + j) % 2 : j % row]!,
  }));
  return [...made.reverse(), ...[...originals].sort((a, b) => b.s - a.s), player];
}

/**
 * A start gate by the rule: the cars' grid and the bikes' (`ruleGrid`), with the original's places of each kind
 * (`originals`), each slot at its station as written (`at`).
 */
export function startGate<At>(
  at: (s: number) => At,
  options: Omit<Parameters<typeof ruleGrid>[0], 'kind' | 'originals'> & {
    readonly originals: Readonly<Record<GridKind, readonly OriginalPlace[]>>;
  },
) {
  const grid = (kind: GridKind) =>
    ruleGrid({ ...options, kind, originals: options.originals[kind] }).map((slot) => ({
      at: at(slot.s),
      lateral: slot.lateral,
    }));
  return { kind: 'start' as const, grid: grid('car'), bikeGrid: grid('bike') };
}
