import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { MenuCommand } from '../input/menu-input.js';
import { LOGICAL_WIDTH, PLAYER_DEPTH_PIXELS_PER_METER } from '../view/display-scale.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import { drawScaledSprite } from '../view/sprite.js';
import type { TextLayer } from '../view/text-layer.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import {
  createVehiclePaletteVariant,
  selectVehicleSprite,
  spriteSetColors,
  type VehicleSpriteSet,
} from '../vehicle/vehicle-sprite-set.js';
import { SCREEN_BACKGROUND, writeCentred } from './menu.js';
import type { MenuResponse, Screen } from './screen-host.js';

/** Fixed steps each yaw image stays on SELECT VEHICLE. */
const YAW_IMAGE_STEPS = 6;
/** Where the vehicle stands on SELECT VEHICLE: the frame's centre line, its ground at this row. */
const VEHICLE_GROUND_Y = 150;

/** A vehicle's display name: its manufacturer and model. */
export function vehicleName(vehicle: CompiledVehicleDefinition): string {
  const { manufacturer, model } = vehicle.listing.metadata;
  return `${manufacturer} ${model}`;
}

/**
 * SELECT VEHICLE: the current vehicle turns through its yaw images, drawn as the race draws vehicles, over its name.
 * LEFT and RIGHT change the vehicle and UP and DOWN its color, each wrapping around, starting from `choice`; each
 * vehicle is first shown in `colorOf` its color. With fixed colors it has no color choice and keeps that color. CONFIRM
 * chooses the shown vehicle and color (null with fixed colors).
 */
export function createVehicleScreen(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  candidates: readonly CompiledVehicleDefinition[],
  choice: { vehicleId: string | null; fixedColors: boolean; colorOf(vehicle: CompiledVehicleDefinition): string },
  actions: { confirm(vehicle: CompiledVehicleDefinition, color: string | null): void; back(): void },
): Screen {
  let index = Math.max(
    0,
    candidates.findIndex((vehicle) => vehicle.compiledVehicle.id === choice.vehicleId),
  );
  let colors: readonly string[] = [],
    color = 0,
    steps = 0;
  const sets = new Map<string, VehicleSpriteSet>();
  const show = () => {
    const vehicle = candidates[index]!;
    colors = choice.fixedColors ? [] : spriteSetColors(vehicle.spriteSet);
    color = Math.max(0, colors.indexOf(choice.colorOf(vehicle)));
  };
  show();
  const turn = (list: number, step: number, at: number) => (at + step + list) % list;
  return {
    live: false,
    tick() {
      steps++;
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
        return 'confirm';
      }
      if (command === 'BACK') {
        actions.back();
        return 'back';
      }
      return null;
    },
    render() {
      const vehicle = candidates[index]!;
      const palette = colors[color] ?? choice.colorOf(vehicle);
      const key = `${vehicle.compiledVehicle.id}/${palette}`;
      let set = sets.get(key);
      if (!set) sets.set(key, (set = createVehiclePaletteVariant(vehicle.spriteSet, palette)));
      const yaw = (Math.floor(steps / YAW_IMAGE_STEPS) % set.yawVariants) * ((Math.PI * 2) / set.yawVariants);
      frame.clear(SCREEN_BACKGROUND);
      drawScaledSprite(
        frame,
        selectVehicleSprite(set, yaw).asset,
        LOGICAL_WIDTH / 2,
        VEHICLE_GROUND_Y,
        PLAYER_DEPTH_PIXELS_PER_METER,
      );
      text.clear();
      writeCentred(text, 4, 'SELECT VEHICLE', TEXT_PALETTES.WHITE);
      writeCentred(text, 22, vehicleName(vehicle), TEXT_PALETTES.YELLOW);
      text.draw(frame);
      present();
    },
  };
}
