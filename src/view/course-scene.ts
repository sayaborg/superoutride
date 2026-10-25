import { createCourseRouteVisualReaders } from './course-route-visual-readers.js';
import { selectedSuccessor } from '../course/course-route.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { LOGICAL_HEIGHT } from './display-scale.js';
import { RENDER_NEAR_DEPTH_METERS, RENDER_FAR_DEPTH_METERS } from './camera.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { cameraDistance, type CameraState } from './camera.js';
import { CAMERA_DEFINITION } from './camera-definition.js';
import type { VehicleRenderRead } from '../vehicle/physics/vehicle-contract.js';
import { createRenderWorkspace, renderDriving, type RenderMeasurements } from './renderer.js';
import type { CourseSprite } from './course-sprite.js';
import type { SpriteAsset } from '../image/sprite.js';
import type { VehicleSpriteImages } from '../vehicle/vehicle-sprite-set.js';
import { createCourseWorld } from '../race/course-world.js';
import type { CourseLoadingWindow } from '../race/loading-coverage.js';
import type { KnockedObjectObservation } from '../race/object-contacts.js';
import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import { basePoint, type BaseBody, type BasePoint } from './base-point.js';
import { createBackgroundTransition } from './background-transition.js';

/** The scene's loading window: the product camera stands `cameraDistance` behind the player's route position. */
/** How far ahead of the camera the road's turn decides a wipe's direction, and the heading change that counts as one. */
const WIPE_TURN_AHEAD_METERS = 150;
const WIPE_TURN_RADIANS = 0.05;

const COURSE_LOADING_WINDOW: CourseLoadingWindow = Object.freeze({
  cameraDistance: cameraDistance(CAMERA_DEFINITION),
  near: RENDER_NEAR_DEPTH_METERS,
  far: RENDER_FAR_DEPTH_METERS,
});

/** The race's course world plus its rendering, shared by browser, tools, scenarios and smoke checks. */
export function createCourseScene(
  section: CompiledSection,
  gates: CompiledCourse['gates'],
  vehicles: readonly CompiledVehicleDefinition[],
) {
  const runtime = createCourseWorld(section, gates, vehicles, COURSE_LOADING_WINDOW);
  const rendering = createCourseRouteVisualReaders(runtime.window);
  rendering.read();
  const renderWorkspace = createRenderWorkspace();
  const worldSprites: CourseSprite[] = [];
  const sample = createPlanCoordinateSample();
  // The standing movable placements' pictures at their base points, each with its shadow on the road beneath it,
  // reaching its square's half diagonal; rebuilt with the sprite lists.
  let standingMovables: readonly { readonly key: string; readonly sprite: CourseSprite }[] = [];
  const playerBase: BasePoint = { x: 0, y: 0, z: 0, s: 0 },
    playerShadow = { y: 0, reach: 0 },
    baseSample = createPlanCoordinateSample();
  let lastRenderData: ReturnType<typeof rendering.read> | null = null;
  let lastSelection: typeof runtime.route.occurrences | null = null;
  let staticSpriteCount = 0;
  let terrainParameters: Parameters<typeof renderDriving>[1]['terrainParameters'];
  const backgrounds = createBackgroundTransition(),
    turnSample = createPlanCoordinateSample();
  // The sign of the road's turn from the point the camera follows to `WIPE_TURN_AHEAD_METERS` ahead, 0 within the
  // threshold or beyond the resident Route.
  const turnAhead = (s: number) => {
    const ahead = s + WIPE_TURN_AHEAD_METERS;
    if (!runtime.window.at(s) || !runtime.window.at(ahead)) return 0;
    const from = runtime.readers.coordinates.toWorld(s, 0, turnSample).heading,
      to = runtime.readers.coordinates.toWorld(ahead, 0, turnSample).heading;
    const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return Math.abs(turn) < WIPE_TURN_RADIANS ? 0 : Math.sign(turn);
  };
  return Object.freeze({
    runtime,
    get world() {
      return runtime.readers;
    },
    /**
     * One fixed step of the screen showing the course from `camera`: it advances the background's transition. The
     * environment is the one at the point the camera follows; still frames, which never step, show it as it is.
     */
    advance(camera: CameraState) {
      backgrounds.advance(rendering.read().environmentAt(camera.follows), turnAhead(camera.follows));
    },
    render(
      target: Parameters<typeof renderDriving>[0],
      /**
       * The player the viewer follows, its pictures in its color and lamp state and its body's half diagonal; null
       * draws the course without one.
       */
      player: {
        readonly vehicle: VehicleRenderRead & BaseBody;
        readonly set: VehicleSpriteImages;
        readonly reach: number;
      } | null,
      camera: CameraState,
      /** Every other vehicle's picture, its shadow place included. */
      vehicles: readonly CourseSprite[],
      /** The other pictures: the tire puffs'. */
      pictures: readonly CourseSprite[],
      /** The race's knocked movable objects; every other movable placement stands. */
      knocked: readonly KnockedObjectObservation[],
      /** DEV and tools only: receives the frame's measurements. */
      measurements: RenderMeasurements | null = null,
    ) {
      const readers = runtime.readers;
      const renderData = rendering.read();
      // Route occurrences change exactly when a successor is selected or appended.
      const selection = runtime.route.occurrences;
      if (lastRenderData !== renderData || lastSelection !== selection) {
        worldSprites.length = 0;
        for (const sprite of renderData.worldSprites) worldSprites.push(sprite);
        // A state-selected sign shows once its own fork occurrence has selected another exit.
        for (const placement of renderData.conditionalSprites) {
          const selected = selectedSuccessor(runtime.route, placement.occurrence);
          if (selected && selected.id !== placement.unselectedLink) worldSprites.push(placement.sprite);
        }
        staticSpriteCount = worldSprites.length;
        // A movable object's picture stands at its placement, its square's centre.
        standingMovables = renderData.movableSprites.map(({ section, index, sprite, footprint }) => ({
          key: `${section.id} ${index}`,
          sprite: Object.freeze({
            ...sprite,
            shadow: Object.freeze({ y: readers.height.sample(footprint.s), reach: squareReach(footprint.side) }),
          }),
        }));
        terrainParameters = {
          screenHeight: LOGICAL_HEIGHT,
          dMin: RENDER_NEAR_DEPTH_METERS,
          dMax: RENDER_FAR_DEPTH_METERS,
          height: readers.renderHeight,
          extent: runtime.window,
        };
        lastRenderData = renderData;
        lastSelection = selection;
      }
      worldSprites.length = staticSpriteCount;
      const down = knocked.length ? new Set(knocked.map((k) => `${k.section.id} ${k.sprite}`)) : null;
      for (const movable of standingMovables) if (!down?.has(movable.key)) worldSprites.push(movable.sprite);
      for (const k of knocked) {
        const pictures = renderData.knockedPictures(k.section, k.sprite);
        const reach = squareReach(renderData.movableBody(k.section, k.sprite).width);
        // A knocked object's picture stands at its square's centre at its own height, its shadow on the road beneath.
        const show = (s: number, l: number, asset: SpriteAsset) => {
          const position = readers.coordinates.toWorld(s, l, sample);
          const shadow = { y: readers.height.sample(s), reach };
          worldSprites.push({
            name: asset.name,
            x: position.x,
            y: k.y,
            z: position.z,
            sRender: s,
            asset,
            shadow,
          });
        };
        if (k.state === 'airborne') {
          if (runtime.window.at(k.s)) show(k.s, k.l, pictures.airborne);
          continue;
        }
        // A landed object lies at its place in every resident occurrence of its Section.
        for (const occurrence of runtime.window.occurrences)
          if (occurrence.section === k.at!.section && runtime.window.at(occurrence.start + k.at!.s) === occurrence)
            show(occurrence.start + k.at!.s, k.at!.l - occurrence.lateralOrigin, pictures.landed);
      }
      for (const sprite of pictures) worldSprites.push(sprite);
      for (const sprite of vehicles) worldSprites.push(sprite);
      if (player) {
        playerShadow.y = readers.height.sample(player.vehicle.course.s);
        playerShadow.reach = player.reach;
      }
      return renderDriving(
        target,
        {
          background: backgrounds.frame(renderData.environmentAt(camera.follows)),
          guide: readers,
          camera,
          player: player && {
            vehicle: player.vehicle,
            base: basePoint(readers.coordinates, player.vehicle, playerBase, baseSample),
            shadow: playerShadow,
            set: player.set,
          },
          terrainParameters,
          worldSprites,
          walls: renderData.walls,
        },
        { ground: renderData.ground, workspace: renderWorkspace },
        measurements,
      );
    },
  });
}

/** How far along the road a square of side `side` reaches from its centre whichever way it turns: its half diagonal. */
function squareReach(side: number): number {
  return (side * Math.SQRT2) / 2;
}
