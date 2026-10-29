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
import { drawSky } from './background-transition.js';

/** The scene's loading window: the product camera stands `cameraDistance` behind the player's route position. */
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
  // The standing movable placements' pictures at their base points, each with its shadow on the road beneath it;
  // rebuilt with the sprite lists.
  let standingMovables: readonly { readonly key: string; readonly sprite: CourseSprite }[] = [];
  const playerBase: BasePoint = { x: 0, y: 0, z: 0, s: 0 },
    playerShadow = { y: 0 },
    baseSample = createPlanCoordinateSample();
  let lastRenderData: ReturnType<typeof rendering.read> | null = null;
  let lastSelection: typeof runtime.route.occurrences | null = null;
  let staticSpriteCount = 0;
  let terrainParameters: Parameters<typeof renderDriving>[1]['terrainParameters'];
  return Object.freeze({
    runtime,
    get world() {
      return runtime.readers;
    },
    render(
      target: Parameters<typeof renderDriving>[0],
      /**
       * The player the viewer follows and its pictures in its color and lamp state; null draws the course without one.
       */
      player: {
        readonly vehicle: VehicleRenderRead & BaseBody;
        readonly set: VehicleSpriteImages;
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
            shadow: Object.freeze({ y: readers.height.sample(footprint.s) }),
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
        // A knocked object's picture stands at its square's centre at its own height, its shadow on the road beneath.
        const show = (s: number, l: number, asset: SpriteAsset) => {
          const position = readers.coordinates.toWorld(s, l, sample);
          const shadow = { y: readers.height.sample(s) };
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
      if (player) playerShadow.y = readers.height.sample(player.vehicle.course.s);
      return renderDriving(
        target,
        {
          // The sky at the point the camera follows, by its place alone: a still frame shows what a run shows there.
          background: {
            draw: (surface, view) =>
              drawSky(surface, renderData.skyAt(camera.follows), view, renderData.skyYawAt(camera.follows, camera.yaw)),
          },
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
