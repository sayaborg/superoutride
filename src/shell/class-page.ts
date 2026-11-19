import type { CourseIndexEntry } from '../content/course-index.js';
import type { SeriesClass, SeriesEntry } from '../content/series-catalog.js';
import { TEXT_PALETTES } from '../image/text-tiles.js';
import { classGridSlots, runPlayerColor } from '../race/run-setup.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import {
  createVehiclePaletteVariant,
  selectVehicleSprite,
  type VehicleSpriteImages,
} from '../vehicle/vehicle-sprite-set.js';
import { PLAYER_DEPTH_PIXELS_PER_METER } from '../view/display-scale.js';
import { drawScaledSprite, scaledSpriteBounds } from '../view/sprite.js';
import type { CardPage, PageCanvas, PixelBox } from './card-face.js';
import { PAGE_LIMITS, type CardStyle, type PageFact, type PageParts, type PageSheet } from './card-styles.js';

/** The side view the grid shows each vehicle in: the yaw image a quarter turn round, its front to the right. */
const SIDE_TURN = 0.25;
/** A grid slot's cell is at most this many pixels long and a row this many tall, `clear` from the picture's edges. */
const GRID = Object.freeze({ cell: 32, row: 16, clear: 4 });
/** A side view too large for its cell shrinks from the player depth by this factor until every one fits. */
const SCALE_STEP = 0.97;

/** English ordinals for a grid position. */
const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH')}`;

/** The catalog's vehicle of an ID. */
type Vehicles = (id: string) => CompiledVehicleDefinition;
/** A rival's entry: its vehicle and color, each null where the player's own vehicle decides it. */
type Rival = Pick<SeriesEntry, 'vehicle' | 'color'>;

/**
 * One vehicle on the grid: its slot index in the course's grid, its vehicle and color (null in a class of any vehicle,
 * which shows the slot alone), and whether it is the player's.
 */
interface GridCar {
  readonly slot: number;
  readonly vehicle: CompiledVehicleDefinition | null;
  readonly color: string | null;
  readonly player: boolean;
}
/** The words for what a class leaves to the player: any course or vehicle, and a field of the player's own vehicle. */
const ANY = 'ANY',
  YOURS = 'SAME AS YOURS';

/**
 * What a class's card says of it (K, 2026-11-19): its series, course, vehicles, laps where its course has them, where
 * the player starts, its rivals, its traffic and its clock; never a record. Its picture is its starting grid.
 */
function classParts(
  runClass: SeriesClass,
  course: CourseIndexEntry | null,
  cars: readonly GridCar[],
  rivals: readonly Rival[],
  vehicles: Vehicles,
) {
  const modelOf = (id: string | null) => (id === null ? YOURS : vehicles(id).listing.metadata.model.toUpperCase());
  // A fact whose value and note fit a row together, else the note says how many models it names.
  const fact = (label: string, value: string, names: readonly string[] = []): PageFact => {
    const distinct = [...new Set(names)],
      listed = distinct.join(', ');
    const note =
      distinct.length === 0
        ? undefined
        : value.length + 1 + listed.length <= PAGE_LIMITS.rowCharacters
          ? listed
          : `${distinct.length} MODELS`;
    return note === undefined ? { label, value } : { label, value, note };
  };
  const field = cars.length,
    position = [...cars].sort((a, b) => a.slot - b.slot).findIndex((car) => car.player) + 1;
  const candidates = runClass.vehicles?.map(modelOf) ?? [ANY];
  const traffic = runClass.traffic?.vehicles.map(modelOf) ?? [];
  // On any course a grid may hold fewer of the field: its rivals are at most the class's, its place first or last.
  const open = course === null;
  const facts: PageFact[] = [
    { label: 'COURSE', value: course?.name ?? ANY },
    candidates.length === 1 ? fact('VEHICLE', candidates[0]!) : fact('VEHICLE', String(candidates.length), candidates),
    ...(open || course.type === 'CIRCUIT' ? [{ label: 'LAPS', value: String(runClass.laps) }] : []),
    runClass.chase
      ? { label: 'START', value: 'CHASE', note: `GO ${runClass.chase.seconds} S AFTER THE RIVAL PASSES` }
      : field === 1
        ? { label: 'START', value: 'ALONE' }
        : open
          ? { label: 'START', value: position === 1 ? 'FIRST' : 'LAST', note: 'OF THE GRID' }
          : { label: 'START', value: ordinal(position), note: `OF ${field}` },
    rivals.length === 0
      ? { label: 'RIVALS', value: 'NONE' }
      : fact(
          'RIVALS',
          `${open && rivals.length > 1 ? 'UP TO ' : ''}${rivals.length}`,
          rivals.map((rival) => modelOf(rival.vehicle)),
        ),
    runClass.traffic ? fact('TRAFFIC', 'ON', traffic) : { label: 'TRAFFIC', value: 'OFF' },
    { label: 'CLOCK', value: runClass.timeMargin === null ? 'OFF' : 'ON' },
  ];
  return Object.freeze<PageParts>({
    title: runClass.title,
    sheet: classSheet(runClass, course, facts, rivals, vehicles),
    tag: runClass.series.title,
    factsName: 'CLASS',
    facts,
    moreName: '',
    more: [],
    choice: null,
    chart: null,
    chartName: '',
    words: null,
  });
}

/**
 * What SHEET writes of a class (K, 2026-11-20): its series along the title's foot, and its rules in full under its grid:
 * its course, every vehicle, laps, start; its rivals' vehicles each with its entries' colors; its traffic's density,
 * speed and vehicles; the rank to hold at each gate where it has one; and its clock with its margin.
 */
function classSheet(
  runClass: SeriesClass,
  course: CourseIndexEntry | null,
  facts: readonly PageFact[],
  rivals: readonly Rival[],
  vehicles: Vehicles,
): PageSheet {
  const open = course === null;
  const modelOf = (id: string | null) => (id === null ? YOURS : vehicles(id).listing.metadata.model.toUpperCase());
  // Each vehicle once, in the order of its first entry, with its entries' colors, each once with how many share it.
  const groups = new Map<string | null, string[]>();
  for (const { vehicle, color } of rivals) {
    const colors = groups.get(vehicle) ?? [];
    if (color !== null) colors.push(vehicles(vehicle!).listing.visuals.colorNames[color] ?? color);
    groups.set(vehicle, colors);
  }
  const counted = (names: readonly string[]) =>
    [...new Set(names)].map((name) => {
      const count = names.filter((other) => other === name).length;
      return count > 1 ? `${count} ${name}` : name;
    });
  const field = [...groups].map(([vehicle, colors]) =>
    colors.length === 0 ? modelOf(vehicle) : `${modelOf(vehicle)} (${counted(colors).join(', ')})`,
  );
  const traffic = runClass.traffic;
  const ranks = Object.entries(runClass.rankLimits);
  const fact = (label: string) => facts.find((item) => item.label === label)!;
  return Object.freeze({
    line: [{ label: 'SERIES', value: runClass.series.title }],
    beside: [],
    table: null,
    rest: [
      fact('COURSE'),
      {
        label: 'VEHICLE',
        value: runClass.vehicles === null ? ANY : [...new Set(runClass.vehicles.map(modelOf))].join(', '),
      },
      ...facts.filter((item) => item.label === 'LAPS'),
      fact('START'),
      rivals.length === 0
        ? { label: 'RIVALS', value: 'NONE' }
        : {
            label: 'RIVALS',
            value: `${open && rivals.length > 1 ? 'UP TO ' : ''}${rivals.length}: ${field.join(', ')}`,
          },
      traffic === null
        ? { label: 'TRAFFIC', value: 'OFF' }
        : {
            label: 'TRAFFIC',
            value: `${traffic.density}/KM AT ${traffic.speedKilometersPerHour} KM/H: ${[
              ...new Set(traffic.vehicles.map(modelOf)),
            ].join(', ')}`,
          },
      ...(ranks.length === 0
        ? []
        : [{ label: 'RANK', value: ranks.map(([gate, rank]) => `TOP ${rank} AT ${gate.toUpperCase()}`).join(', ') }]),
      runClass.timeMargin === null
        ? { label: 'CLOCK', value: 'OFF' }
        : { label: 'CLOCK', value: 'ON', note: `MARGIN ${runClass.timeMargin}` },
    ],
  });
}

/**
 * The starting grid in `box`, front to the right: each car in side view in its slot, two rows staggered half a cell,
 * each slot marked by a line across its front and one along its foot, the player's YELLOW and the others' DARK. Every
 * car takes the one scale, the largest from the player depth down at which each fits its cell and a row.
 */
function drawGrid(
  canvas: PageCanvas,
  box: PixelBox,
  cars: readonly GridCar[],
  images: (car: GridCar) => VehicleSpriteImages,
) {
  const slots = Math.max(...cars.map((car) => car.slot)) + 1,
    cell = Math.min(GRID.cell, Math.floor((2 * (box.width - 2 * GRID.clear)) / (slots + 1))),
    front = Math.round(box.x + (box.width + ((slots + 1) * cell) / 2) / 2),
    middle = box.y + Math.floor(box.height / 2);
  const sides = cars.map((car) => car.vehicle && selectVehicleSprite(images(car), SIDE_TURN * 2 * Math.PI).asset);
  const shown = sides.filter((asset) => asset !== null);
  let scale = PLAYER_DEPTH_PIXELS_PER_METER;
  const bounds = () => shown.map((asset) => scaledSpriteBounds(asset, scale));
  while (!bounds().every((b) => b.right - b.left <= cell - 3 && b.bottom - b.top <= GRID.row - 3)) scale *= SCALE_STEP;
  // A row is as tall as the tallest car, over a clear pixel and the slot's foot line; without cars, as a row may be.
  const row = shown.length ? Math.ceil(Math.max(...bounds().map((b) => b.bottom - b.top))) + 3 : GRID.row;
  const dark = canvas.mainColor(TEXT_PALETTES.DARK),
    yellow = canvas.mainColor(TEXT_PALETTES.YELLOW);
  cars.forEach((car, i) => {
    const right = front - Math.round((car.slot * cell) / 2),
      top = car.slot % 2 === 0 ? middle - row : middle,
      mark = car.player ? yellow : dark;
    // The slot's mark, painted as a grid's: a line across its front, and one along its foot.
    canvas.fill({ x: right - 1, y: top, width: 1, height: row }, mark);
    canvas.fill({ x: right - cell + 1, y: top + row - 1, width: cell - 2, height: 1 }, mark);
    const asset = sides[i];
    if (!asset) return;
    const b = scaledSpriteBounds(asset, scale);
    drawScaledSprite(
      canvas.surface,
      asset,
      Math.round(right - 1 - cell / 2 - (b.left + b.right) / 2),
      Math.round(top + row - 2 - b.bottom),
      scale,
    );
  });
}

/**
 * A class's card (SELECT CLASS) in `style` (K, 2026-11-19): its title, tagged with its series, its facts in rows, and
 * its starting grid. The grid is the class's field as its RACE starts it with the player in the class's first vehicle
 * (`classGridSlots`), each in its entry's color, the player's in the color its run takes unless chosen otherwise;
 * entries appearing ahead are not on it. A class of any vehicle shows its slots alone, and a class of any course
 * (`course` null) its whole field, which a course's grid may cut.
 */
export function classPage(
  runClass: SeriesClass,
  course: CourseIndexEntry | null,
  vehicles: Vehicles,
  style: CardStyle,
): CardPage {
  const player = runClass.vehicles && vehicles(runClass.vehicles[0]!);
  const slots = classGridSlots(runClass, player?.compiledVehicle.id ?? null);
  const cars: readonly GridCar[] = [
    {
      slot: slots.player,
      vehicle: player,
      color: player && runPlayerColor(runClass, player, null),
      player: true,
    },
    ...slots.others.flatMap(({ entry, slot }) =>
      slot === null
        ? []
        : [
            {
              slot,
              vehicle: entry.vehicle === null ? null : vehicles(entry.vehicle),
              color: entry.color,
              player: false,
            },
          ],
    ),
  ];
  const parts = classParts(
    runClass,
    course,
    cars,
    slots.others.map(({ entry }) => entry),
    vehicles,
  );
  // Each vehicle's images in each color shown, made once.
  const made = new Map<string, VehicleSpriteImages>();
  const images = (car: GridCar) => {
    const key = `${car.vehicle!.compiledVehicle.id}/${car.color}`;
    let shown = made.get(key);
    if (!shown) made.set(key, (shown = createVehiclePaletteVariant(car.vehicle!.spriteSet, car.color!)));
    return shown;
  };
  return Object.freeze({
    title: parts.title,
    faces: style.faces(parts),
    paint(canvas: PageCanvas, face: number) {
      const { picture } = style.page(canvas, parts, face);
      if (picture) drawGrid(canvas, picture.box, cars, images);
      return null;
    },
  });
}
