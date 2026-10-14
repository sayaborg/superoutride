import { TEXT_MARKS, TEXT_PALETTES, TEXT_TILE_SIZE } from '../image/text-tiles.js';
import type { MenuCommand } from '../input/menu-input.js';
import { PLAYER_DEPTH_PIXELS_PER_METER } from '../view/display-scale.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import { drawScaledSprite, scaledSpriteBounds } from '../view/sprite.js';
import type { TextLayer } from '../view/text-layer.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import { createVehicleModel, type VehicleModel } from '../vehicle/physics/vehicle-model.js';
import { createHeldVehicle, updateHeldVehicle, type HeldVehicleState } from '../vehicle/physics/vehicle-physics.js';
import { SIM_DT } from '../race/fixed-step.js';
import {
  createCompetitorObservation,
  writeCompetitorPowertrain,
  type CompetitorObservation,
} from '../race/competitor-observation.js';
import {
  createVehiclePaletteVariant,
  selectVehicleSprite,
  spriteSetColors,
  type VehicleSpriteImages,
} from '../vehicle/vehicle-sprite-set.js';
import { SCREEN_BACKGROUND } from './menu.js';
import { halveRgb555 } from '../image/rgb555.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { MenuResponse, Screen } from './screen-host.js';
import {
  DIM,
  PAGE_TABS,
  PICTURE_BOX,
  PICTURE_SCALE_STEP,
  VEHICLE_PAGE_STEPS,
  WALLPAPER_SHADE,
  YAW_IMAGE_STEPS,
  freeRevThrottle,
  type VehiclePage,
} from './vehicle-page.js';
import { ENGINE_PAGE } from './vehicle-engine-page.js';
import { DRIVETRAIN_PAGE } from './vehicle-drivetrain-page.js';
import { CHASSIS_PAGE } from './vehicle-chassis-page.js';

const PAGES: readonly VehiclePage[] = Object.freeze([ENGINE_PAGE, DRIVETRAIN_PAGE, CHASSIS_PAGE]);

/** A vehicle's display name: its manufacturer and model. */
export function vehicleName(vehicle: CompiledVehicleDefinition): string {
  const { manufacturer, model } = vehicle.listing.metadata;
  return `${manufacturer} ${model}`;
}

/**
 * The picture's one scale for all its yaw images, the largest from the player depth down at which every image, each
 * standing at the same anchor, fits the picture box, and the anchor that centres those images in the box.
 */
function pictureFit(set: VehicleSpriteImages) {
  const assets = Array.from(
    { length: set.yawVariants },
    (_, i) => selectVehicleSprite(set, (i * Math.PI * 2) / set.yawVariants).asset,
  );
  for (let scale = PLAYER_DEPTH_PIXELS_PER_METER; ; scale *= PICTURE_SCALE_STEP) {
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const asset of assets) {
      const bounds = scaledSpriteBounds(asset, scale);
      left = Math.min(left, bounds.left);
      top = Math.min(top, bounds.top);
      right = Math.max(right, bounds.right);
      bottom = Math.max(bottom, bounds.bottom);
    }
    if (right - left <= PICTURE_BOX.width && bottom - top <= PICTURE_BOX.height)
      return {
        scale,
        x: PICTURE_BOX.x + PICTURE_BOX.width / 2 - (left + right) / 2,
        y: PICTURE_BOX.y + PICTURE_BOX.height / 2 - (top + bottom) / 2,
      };
  }
}

/** Over a wallpaper: each pixel halved by the most halvings of the shade and the panels it lies in. */
function shadeWallpaper(frame: SoftwareSurface) {
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++) {
      let halvings: number = WALLPAPER_SHADE.halvings;
      for (const panel of WALLPAPER_SHADE.panels)
        if (x >= panel.left && x <= panel.right && y >= panel.top && y <= panel.bottom)
          halvings = Math.max(halvings, panel.halvings);
      const i = y * frame.width + x;
      let value = frame.pixels[i]!;
      for (let k = 0; k < halvings; k++) value = halveRgb555(value);
      frame.pixels[i] = value;
    }
}

/**
 * The page tabs: each page's name, the shown one WHITE and the others DARK, `PAGE n/N` (DARK), the shown page's time
 * line under its name, YELLOW from the left over DIM by the share of its time gone, and a DIM rule across the frame.
 */
function drawTabs(frame: SoftwareSurface, text: TextLayer, page: number, pageSteps: number) {
  let column = PAGE_TABS.firstColumn;
  PAGES.forEach(({ name }, k) => {
    text.write(column, PAGE_TABS.row, name, k === page ? TEXT_PALETTES.WHITE : TEXT_PALETTES.DARK);
    if (k === page) {
      const left = column * TEXT_TILE_SIZE;
      const right = left + name.length * TEXT_TILE_SIZE - 1;
      frame.fillSpan(PAGE_TABS.timeLineY, left, right, DIM);
      frame.fillSpan(
        PAGE_TABS.timeLineY,
        left,
        left + Math.round((pageSteps / VEHICLE_PAGE_STEPS) * (right - left)),
        text.mainColor(TEXT_PALETTES.YELLOW),
      );
    }
    column += name.length + PAGE_TABS.gap;
  });
  text.write(PAGE_TABS.pageColumn, PAGE_TABS.row, `PAGE ${page + 1}/${PAGES.length}`, TEXT_PALETTES.DARK);
  frame.fillSpan(PAGE_TABS.ruleY, 0, frame.width - 1, DIM);
}

/**
 * SELECT VEHICLE, one catalog page per vehicle: its name, a picture turning through its yaw images in its color, and
 * its pages (ENGINE, DRIVETRAIN, CHASSIS) in turn, each for `VEHICLE_PAGE_STEPS` fixed steps, with the physical values
 * as the simulation holds them under `driving`. On a page that revs, the shown vehicle's model, as a run builds it, is
 * held and revved by `FREE_REV_THROTTLE` from idle at the page's start; a change of vehicle starts it again. While it
 * revs the screen drives a vehicle, and each frame gives `sound` the engine's observation, as the player's. LEFT and RIGHT change
 * the vehicle and UP and DOWN its color, each wrapping around, starting from `choice`; each vehicle is first shown in
 * `colorOf` its color. A change of vehicle keeps the page and restarts its time. With fixed colors it has no color
 * choice and keeps that color. CONFIRM chooses the shown vehicle and color (null with fixed colors).
 */
export function createVehicleScreen(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  sound: (engine: CompetitorObservation) => void,
  candidates: readonly CompiledVehicleDefinition[],
  driving: CompiledDrivingDefinition,
  choice: {
    vehicleId: string | null;
    fixedColors: boolean;
    colorOf(vehicle: CompiledVehicleDefinition): string;
    /** Its CONFIRM starts the run: it answers `entry`. */
    entry: boolean;
    /** A picture the page stands over, shaded by `WALLPAPER_SHADE`; null for the plain background. */
    background: TilePicture | null;
  },
  actions: { confirm(vehicle: CompiledVehicleDefinition, color: string | null): void; back(): void },
): Screen {
  let index = Math.max(
    0,
    candidates.findIndex((vehicle) => vehicle.compiledVehicle.id === choice.vehicleId),
  );
  let colors: readonly string[] = [],
    color = 0,
    steps = 0,
    page = 0,
    pageSteps = 0,
    shownSteps = 0;
  // The engine revving on a page that revs, from idle at the page's start, in the shown vehicle's model.
  let engine: HeldVehicleState | null = null;
  // Its observation, in the player's place, at rest but for its controls and powertrain.
  let observation: CompetitorObservation;
  const models = new Map<CompiledVehicleDefinition, VehicleModel>();
  const modelOf = (vehicleDefinition: CompiledVehicleDefinition) => {
    let model = models.get(vehicleDefinition);
    if (!model)
      models.set(
        vehicleDefinition,
        (model = createVehicleModel({ vehicleDefinition, drivingDefinition: driving }, SIM_DT)),
      );
    return model;
  };
  const fuelCutEnterRedlineRatio = driving.compiledDriving.powertrain.fuelCutEnterRedlineRatio;
  const sets = new Map<string, VehicleSpriteImages>();
  // A vehicle's colors share its pictures' shapes, so one fit serves them all.
  const fits = new Map<string, ReturnType<typeof pictureFit>>();
  const show = () => {
    const vehicle = candidates[index]!;
    colors = choice.fixedColors ? [] : spriteSetColors(vehicle.spriteSet);
    color = Math.max(0, colors.indexOf(choice.colorOf(vehicle)));
    pageSteps = 0;
    shownSteps = 0;
    engine = null;
    observation = createCompetitorObservation(
      'PLAYER',
      vehicle.compiledVehicle.id,
      choice.colorOf(vehicle),
      vehicle.listing.form,
    );
  };
  show();
  const turn = (list: number, step: number, at: number) => (at + step + list) % list;
  return {
    live: false,
    get vehicleDriven() {
      return PAGES[page]!.revs;
    },
    wallpaper: choice.background,
    tick() {
      if (PAGES[page]!.revs) {
        const model = modelOf(candidates[index]!);
        engine ??= createHeldVehicle(model);
        updateHeldVehicle(engine, model, { steering: 0, throttle: freeRevThrottle(pageSteps), brake: 0 });
        writeCompetitorPowertrain(observation, engine, (pageSteps + 1) * SIM_DT);
      }
      steps++;
      shownSteps++;
      if (++pageSteps === VEHICLE_PAGE_STEPS) {
        page = (page + 1) % PAGES.length;
        pageSteps = 0;
        engine = null;
      }
    },
    command(command: MenuCommand): MenuResponse | null {
      if (command === 'LEFT' || command === 'RIGHT') {
        const before = index;
        index = turn(candidates.length, command === 'LEFT' ? -1 : 1, index);
        show();
        return index === before ? null : 'move';
      }
      if ((command === 'UP' || command === 'DOWN') && colors.length > 0) {
        const before = color;
        color = turn(colors.length, command === 'UP' ? -1 : 1, color);
        return color === before ? null : 'move';
      }
      if (command === 'CONFIRM') {
        actions.confirm(candidates[index]!, colors[color] ?? null);
        return choice.entry ? 'entry' : 'confirm';
      }
      if (command === 'BACK') {
        actions.back();
        return 'back';
      }
      return null;
    },
    render() {
      const vehicle = candidates[index]!;
      const id = vehicle.compiledVehicle.id;
      const palette = colors[color] ?? choice.colorOf(vehicle);
      const key = `${id}/${palette}`;
      let set = sets.get(key);
      if (!set) sets.set(key, (set = createVehiclePaletteVariant(vehicle.spriteSet, palette)));
      let fit = fits.get(id);
      if (!fit) fits.set(id, (fit = pictureFit(set)));
      const yaw = (Math.floor(steps / YAW_IMAGE_STEPS) % set.yawVariants) * ((Math.PI * 2) / set.yawVariants);
      if (choice.background) {
        choice.background.draw(frame, 0, 0);
        shadeWallpaper(frame);
      } else frame.clear(SCREEN_BACKGROUND);
      drawScaledSprite(frame, selectVehicleSprite(set, yaw).asset, fit.x, fit.y, fit.scale);

      const { metadata } = vehicle.listing;
      text.clear();
      text.write(13, 0, 'SELECT VEHICLE', TEXT_PALETTES.WHITE);
      text.write(32, 0, `${TEXT_MARKS.left} ${index + 1}/${candidates.length} ${TEXT_MARKS.right}`, TEXT_PALETTES.DARK);
      text.write(1, 2, vehicleName(vehicle), TEXT_PALETTES.YELLOW);
      const label = metadata.identifier ? `  ${metadata.identifier.officialLabel.toUpperCase()}` : '';
      text.write(1, 3, `${metadata.physicsAnchor.modelYear}${label}`, TEXT_PALETTES.DARK);
      const colorName = vehicle.listing.visuals.colorNames[palette]!;
      text.write(
        1,
        11,
        colors.length > 0
          ? `${TEXT_MARKS.up} ${colorName} ${color + 1}/${colors.length} ${TEXT_MARKS.down}`
          : colorName,
        TEXT_PALETTES.WHITE,
      );
      drawTabs(frame, text, page, pageSteps);
      PAGES[page]!.draw({
        frame,
        text,
        vehicle,
        fuelCutEnterRedlineRatio,
        shownSteps,
        engineRpm: engine?.powertrain.engineRpm ?? null,
      });
      text.draw(frame);
      if (engine) sound(observation);
      present();
    },
  };
}
