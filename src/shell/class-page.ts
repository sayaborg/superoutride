import type { CourseIndexEntry } from '../content/course-index.js';
import type { SeriesClass } from '../content/series-catalog.js';
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
import { PAGE_LIMITS, type CardStyle, type PageFact, type PageParts } from './card-styles.js';

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

/** One vehicle on the grid: its slot index in the course's grid, and whether it is the player's. */
interface GridCar {
  readonly slot: number;
  readonly vehicle: CompiledVehicleDefinition;
  readonly color: string;
  readonly player: boolean;
}

/**
 * What a class's card says of it (K, 2026-11-19): its series, course, vehicles, laps where its course has them, where
 * the player starts, its rivals, its traffic and its clock; never a record. Its picture is its starting grid.
 */
function classParts(
  runClass: SeriesClass,
  course: CourseIndexEntry,
  cars: readonly GridCar[],
  rivals: readonly string[],
  vehicles: Vehicles,
) {
  const modelOf = (id: string) => vehicles(id).listing.metadata.model.toUpperCase();
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
  const candidates = runClass.vehicles.map(modelOf);
  const traffic = runClass.traffic?.vehicles.map(modelOf) ?? [];
  const facts: PageFact[] = [
    { label: 'COURSE', value: course.name },
    candidates.length === 1 ? fact('VEHICLE', candidates[0]!) : fact('VEHICLE', String(candidates.length), candidates),
    ...(course.type === 'CIRCUIT' ? [{ label: 'LAPS', value: String(runClass.laps) }] : []),
    runClass.start === 'chase'
      ? { label: 'START', value: 'CHASE', note: 'ONCE THE RIVAL PASSES' }
      : field > 1
        ? { label: 'START', value: ordinal(position), note: `OF ${field}` }
        : { label: 'START', value: 'ALONE' },
    rivals.length === 0
      ? { label: 'RIVALS', value: 'NONE' }
      : fact('RIVALS', String(rivals.length), rivals.map(modelOf)),
    runClass.traffic ? fact('TRAFFIC', 'ON', traffic) : { label: 'TRAFFIC', value: 'OFF' },
    { label: 'CLOCK', value: runClass.timeMargin === null ? 'OFF' : 'ON' },
  ];
  return Object.freeze<PageParts>({
    title: runClass.title,
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
  const sides = cars.map((car) => selectVehicleSprite(images(car), SIDE_TURN * 2 * Math.PI).asset);
  let scale = PLAYER_DEPTH_PIXELS_PER_METER;
  const bounds = () => sides.map((asset) => scaledSpriteBounds(asset, scale));
  while (!bounds().every((b) => b.right - b.left <= cell - 3 && b.bottom - b.top <= GRID.row - 3)) scale *= SCALE_STEP;
  // A row is as tall as the tallest car, over a clear pixel and the slot's foot line.
  const row = Math.ceil(Math.max(...bounds().map((b) => b.bottom - b.top))) + 3;
  const dark = canvas.mainColor(TEXT_PALETTES.DARK),
    yellow = canvas.mainColor(TEXT_PALETTES.YELLOW);
  cars.forEach((car, i) => {
    const right = front - Math.round((car.slot * cell) / 2),
      top = car.slot % 2 === 0 ? middle - row : middle,
      mark = car.player ? yellow : dark;
    // The slot's mark, painted as a grid's: a line across its front, and one along its foot.
    canvas.fill({ x: right - 1, y: top, width: 1, height: row }, mark);
    canvas.fill({ x: right - cell + 1, y: top + row - 1, width: cell - 2, height: 1 }, mark);
    const asset = sides[i]!,
      b = scaledSpriteBounds(asset, scale);
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
 * entries appearing ahead are not on it.
 */
export function classPage(
  runClass: SeriesClass,
  course: CourseIndexEntry,
  vehicles: Vehicles,
  style: CardStyle,
): CardPage {
  const player = vehicles(runClass.vehicles[0]!);
  const slots = classGridSlots(runClass, player.compiledVehicle.id);
  const cars: readonly GridCar[] = [
    {
      slot: slots.player,
      vehicle: player,
      color: runPlayerColor(runClass, player, null),
      player: true,
    },
    ...slots.others.flatMap(({ entry, slot }) =>
      slot === null ? [] : [{ slot, vehicle: vehicles(entry.vehicle), color: entry.color, player: false }],
    ),
  ];
  const parts = classParts(
    runClass,
    course,
    cars,
    slots.others.map(({ entry }) => entry.vehicle),
    vehicles,
  );
  // Each vehicle's images in each color shown, made once.
  const made = new Map<string, VehicleSpriteImages>();
  const images = (car: GridCar) => {
    const key = `${car.vehicle.compiledVehicle.id}/${car.color}`;
    let shown = made.get(key);
    if (!shown) made.set(key, (shown = createVehiclePaletteVariant(car.vehicle.spriteSet, car.color)));
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
