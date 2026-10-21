import type { CompiledPuffs, PuffDocument, PuffKindRecord, PuffPictureSize } from '../content/puff-catalog.js';
import { createPlanCoordinateSample, createPlanProjectionWorkspace } from '../course/geometry/plan-coordinate.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { ProfileReader } from '../course/geometry/profile.js';
import { createSpritePalette, type SpriteLodAsset } from '../image/sprite.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { TireObservation } from '../vehicle/physics/vehicle-tire-observation.js';
import { RENDER_FAR_DEPTH_METERS, RENDER_NEAR_DEPTH_METERS } from './camera.js';
import type { CourseSprite } from './course-sprite.js';

/** The most puffs alive at once, an author's value for performance; a new puff replaces the oldest beyond it. */
export const PUFF_LIMIT = 256;

/** One puff: its base point on the Route (`s`, `l`, height `y`), its speeds along those, its age and its look. */
interface Puff {
  s: number;
  l: number;
  y: number;
  speedS: number;
  speedL: number;
  speedY: number;
  age: number;
  kind: PuffKindRecord;
  sizes: readonly PuffPictureSize[];
  palette: string;
  /** Its birth's order, which turns its shapes. */
  serial: number;
  sprite: CourseSprite;
}

/** One contact patch's carried fractions of a puff, rolling and sliding, and the side its next puff leaves from. */
interface PatchState {
  rolling: number;
  sliding: number;
  side: number;
}

/** The scene a step reads: the Route's coordinates and height, and its resident window. */
interface PuffScene {
  readonly world: { readonly coordinates: PlanCoordinateReader; readonly height: ProfileReader };
  readonly runtime: { readonly window: { at(s: number): unknown } };
}

/**
 * The puffs the tires throw ([Tire puffs](../../docs/tire-puffs.md)), owned by the observer like its vehicle sprites. Each
 * fixed step `advance` moves every puff and lets each vehicle within the drawing depth throw new ones from its tire
 * observations, with the kinds and surfaces of `records` at that step; `sprites` gives every puff's picture for the
 * frame, each the size nearest its diameter in the palette its surface names. It draws no randomness.
 */
export function createTirePuffs(
  puffs: CompiledPuffs,
  vehicles: readonly CompiledVehicleDefinition[],
  records: () => PuffDocument = () => puffs.source,
) {
  // The records each step throws with: the delivered document's, or DEV's; a puff keeps its kind's as it was thrown.
  let { kinds, surfaces } = puffs.source;
  const compiled = new Map(vehicles.map((vehicle) => [vehicle.compiledVehicle.id, vehicle.compiledVehicle]));
  // Live puffs from the oldest; spent ones wait in the pool.
  const live: Puff[] = [],
    pool: Puff[] = [];
  let births = 0;
  let patches = new Map<string, { front: PatchState; rear: PatchState }>(),
    seen = new Map<string, { front: PatchState; rear: PatchState }>();
  const projection = { s: 0, l: 0, inDomain: false },
    workspace = createPlanProjectionWorkspace(),
    sample = createPlanCoordinateSample(),
    point = { x: 0, z: 0 };
  // Each picture in each palette, resolved once on first use.
  const colored = new Map<SpriteLodAsset, Map<string, SpriteLodAsset>>();
  const inPalette = (asset: SpriteLodAsset, palette: string) => {
    let byPalette = colored.get(asset);
    if (!byPalette) colored.set(asset, (byPalette = new Map()));
    let resolved = byPalette.get(palette);
    if (!resolved) byPalette.set(palette, (resolved = createSpritePalette(asset, palette)));
    return resolved;
  };
  const sprites: CourseSprite[] = [];

  /** Throw one puff from a patch at `forward` along the body and `track` across it, its wheel turned by `steer`. */
  const throwPuff = (
    actor: CompetitorObservation,
    scene: PuffScene,
    tire: TireObservation,
    surface: string,
    forward: number,
    track: number,
    radius: number,
    steer: number,
    state: PatchState,
  ) => {
    const record = surfaces[surface]!;
    const kind = kinds[record.kind]!;
    const lateral = (state.side * track) / 2;
    state.side = -state.side;
    const sinYaw = Math.sin(actor.yaw),
      cosYaw = Math.cos(actor.yaw);
    const heading = actor.yaw + steer;
    const sinWheel = Math.sin(heading),
      cosWheel = Math.cos(heading);
    const release = (kind.releaseDegrees * Math.PI) / 180;
    // The tread leaves the patch turned `release` past it, behind the patch for a wheel turning forward.
    const behind = -Math.sign(tire.wheelSpeed) * radius * Math.sin(release);
    point.x = actor.x + sinYaw * forward + cosYaw * lateral + sinWheel * behind;
    point.z = actor.z + cosYaw * forward - sinYaw * lateral + cosWheel * behind;
    const { world } = scene;
    const { s, l, inDomain } = world.coordinates.locateLocal(point, actor.course.s, projection, workspace);
    if (!inDomain || !scene.runtime.window.at(s)) return;
    // The tread's velocity in the wheel's frame (forward, right, up), then along the Route's heading and across it.
    const along = tire.longitudinalVelocity - tire.wheelSpeed * Math.cos(release);
    const across = tire.lateralVelocity;
    const velocityX = sinWheel * along + cosWheel * across,
      velocityZ = cosWheel * along - sinWheel * across;
    const routeHeading = world.coordinates.toWorld(s, l, sample).heading;
    const puff = live.length < PUFF_LIMIT ? (pool.pop() ?? createPuff()) : live.shift()!;
    puff.s = s;
    puff.l = l;
    puff.y = world.height.sample(s) + radius * (1 - Math.cos(release));
    puff.speedS = velocityX * Math.sin(routeHeading) + velocityZ * Math.cos(routeHeading);
    puff.speedL = velocityX * Math.cos(routeHeading) - velocityZ * Math.sin(routeHeading);
    puff.speedY = Math.abs(tire.wheelSpeed) * Math.sin(release);
    puff.age = 0;
    puff.kind = kind;
    puff.sizes = puffs.pictures[record.kind]!;
    puff.palette = record.palette;
    puff.serial = births++;
    live.push(puff);
  };

  /** One patch's step: its rolling and sliding fractions grow, and each whole one throws a puff. */
  const throwFrom = (
    actor: CompetitorObservation,
    scene: PuffScene,
    tire: TireObservation,
    state: PatchState,
    forward: number,
    track: number,
    radius: number,
    steer: number,
  ) => {
    // A patch that transmits no force throws nothing and keeps its fractions.
    if (tire.surface === null) return;
    const record = surfaces[tire.surface]!;
    if (record.metersPerPuff !== null) state.rolling += (Math.abs(tire.wheelSpeed) * SIM_DT) / record.metersPerPuff;
    if (record.joulesPerPuff !== null) state.sliding += (tire.slidingPower * SIM_DT) / record.joulesPerPuff;
    for (; state.rolling >= 1; state.rolling -= 1)
      throwPuff(actor, scene, tire, tire.surface, forward, track, radius, steer, state);
    for (; state.sliding >= 1; state.sliding -= 1)
      throwPuff(actor, scene, tire, tire.surface, forward, track, radius, steer, state);
  };

  return Object.freeze({
    /** The puffs alive. */
    get count() {
      return live.length;
    },
    /**
     * One fixed step: every puff moves, grows older and ends at the end of its life, below the road under it or off the
     * resident Route; then every vehicle of `actors` whose route position lies within the drawing depth of `camera`
     * throws its new puffs.
     */
    advance(actors: readonly CompetitorObservation[], camera: { readonly s: number }, scene: PuffScene) {
      const { height } = scene.world;
      let kept = 0;
      for (const puff of live) {
        const { responseSeconds, riseMps, lifeSeconds } = puff.kind;
        // Still air's hold, solved exactly over the step: stable however short the response.
        const hold = Math.exp(-SIM_DT / responseSeconds),
          travel = responseSeconds * (1 - hold);
        puff.s += puff.speedS * travel;
        puff.l += puff.speedL * travel;
        puff.y += riseMps * SIM_DT + (puff.speedY - riseMps) * travel;
        puff.speedS *= hold;
        puff.speedL *= hold;
        puff.speedY = riseMps + (puff.speedY - riseMps) * hold;
        puff.age += SIM_DT;
        if (puff.age >= lifeSeconds || !scene.runtime.window.at(puff.s) || puff.y < height.sample(puff.s))
          pool.push(puff);
        else live[kept++] = puff;
      }
      live.length = kept;
      ({ kinds, surfaces } = records());
      [patches, seen] = [seen, patches];
      seen.clear();
      for (const actor of actors) {
        const vehicle = compiled.get(actor.vehicleId)!;
        const state = patches.get(actor.id) ?? {
          front: { rolling: 0, sliding: 0, side: 1 },
          rear: { rolling: 0, sliding: 0, side: 1 },
        };
        seen.set(actor.id, state);
        const depth = actor.course.s - camera.s;
        if (depth < RENDER_NEAR_DEPTH_METERS || depth > RENDER_FAR_DEPTH_METERS) continue;
        const { frontStation, rearStation } = vehicle;
        throwFrom(
          actor,
          scene,
          actor.tires.front,
          state.front,
          vehicle.frontAxle,
          vehicle.frontTrack,
          frontStation.rollingRadius,
          actor.frontSteerAngle,
        );
        throwFrom(
          actor,
          scene,
          actor.tires.rear,
          state.rear,
          -vehicle.rearAxle,
          vehicle.rearTrack,
          rearStation.rollingRadius,
          0,
        );
      }
    },
    /** Every puff's picture this frame, standing at its base point and casting no shadow; reused frame to frame. */
    sprites(coordinates: PlanCoordinateReader): readonly CourseSprite[] {
      sprites.length = 0;
      for (const puff of live) {
        const diameter = puff.kind.startDiameterMeters + puff.kind.growthMps * puff.age;
        const size = nearestSize(puff.sizes, diameter);
        const position = coordinates.toWorld(puff.s, puff.l, sample);
        const sprite = puff.sprite;
        sprite.x = position.x;
        sprite.y = puff.y;
        sprite.z = position.z;
        sprite.sRender = puff.s;
        sprite.asset = inPalette(size.shapes[puff.serial % size.shapes.length]!, puff.palette);
        sprites.push(sprite);
      }
      return sprites;
    },
  });
}

function createPuff(): Puff {
  return {
    s: 0,
    l: 0,
    y: 0,
    speedS: 0,
    speedL: 0,
    speedY: 0,
    age: 0,
    kind: null!,
    sizes: [],
    palette: '',
    serial: 0,
    sprite: { name: 'puff', x: 0, y: 0, z: 0, sRender: 0, asset: null!, views: null, shadow: null },
  };
}

/** The size whose diameter is nearest `diameter` by ratio; beyond the ends, the end's. */
function nearestSize(sizes: readonly PuffPictureSize[], diameter: number): PuffPictureSize {
  let best = sizes[0]!;
  for (const size of sizes)
    if (Math.abs(Math.log(size.diameterMeters / diameter)) < Math.abs(Math.log(best.diameterMeters / diameter)))
      best = size;
  return best;
}
