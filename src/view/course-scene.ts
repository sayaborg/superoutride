import { createCourseRouteVisualReaders } from './course-route-visual-readers.js';
import { selectedSuccessor } from '../course/course-route.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { createDisplaySettings, type DisplaySettings } from './display-settings.js';
import { LOGICAL_HEIGHT } from './display-scale.js';
import { RENDER_NEAR_DEPTH_METERS, RENDER_FAR_DEPTH_METERS } from './camera.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { cameraBehindPlayer, type CameraDefinition, type CameraState } from './camera.js';
import type { VehicleRenderRead } from '../vehicle/physics/vehicle-contract.js';
import { createRenderWorkspace, renderDriving, type RenderMeasurements } from './renderer.js';
import type { CourseSprite } from './course-sprite.js';
import type { VehicleSpriteSet } from '../vehicle/vehicle-sprite-set.js';
import { createCourseWorld } from '../race/course-world.js';
import type { CourseLoadingWindow } from '../race/loading-coverage.js';
import type { KnockedObjectObservation } from '../race/object-contacts.js';
import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import { createVehicleShadows, type ShadowSquare, type ShadowedVehicle } from './vehicle-shadow.js';
import { standingPoint, type StandingBody, type StandingPoint } from './standing-point.js';

/**
 * Who views a scene: the camera and the square footprint of the player it follows, whose picture stands on that
 * footprint's near edge.
 */
export interface CourseViewer {
  readonly camera: Pick<CameraDefinition, 'focalLength'>;
  readonly footprint: number;
}

/** A viewer's loading window: the camera stands `cameraBehindPlayer` behind the player's route position. */
function courseLoadingWindow({ camera, footprint }: CourseViewer): CourseLoadingWindow {
  return Object.freeze({
    cameraDistance: cameraBehindPlayer(camera, footprint),
    near: RENDER_NEAR_DEPTH_METERS,
    far: RENDER_FAR_DEPTH_METERS,
  });
}

/** The race's course world plus its rendering, shared by browser, tools, scenarios and smoke checks. */
export function createCourseScene(
  section: CompiledSection,
  gates: CompiledCourse['gates'],
  vehicles: readonly CompiledVehicleDefinition[],
  /** Who views the scene; the race's loading window and view follow its camera's distance behind the player. */
  viewer: CourseViewer,
  displaySettings: DisplaySettings = createDisplaySettings(),
) {
  const runtime = createCourseWorld(section, gates, vehicles, courseLoadingWindow(viewer));
  const rendering = createCourseRouteVisualReaders(runtime.window);
  rendering.read();
  const renderWorkspace = createRenderWorkspace();
  const worldSprites: CourseSprite[] = [];
  const sample = createPlanCoordinateSample();
  const shadows = createVehicleShadows(vehicles);
  // The movable objects' square footprints for this frame's shadows: standing, flying and landed alike.
  const objectSquares: ShadowSquare[] = [];
  // The standing movable placements' pictures on their footprints' near edges, rebuilt with the sprite lists.
  let standingMovables: readonly {
    readonly key: string;
    readonly sprite: CourseSprite;
    readonly footprint: ShadowSquare;
  }[] = [];
  const playerStanding: StandingPoint = { x: 0, y: 0, z: 0, s: 0 },
    standingSample = createPlanCoordinateSample();
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
      /** The player the viewer follows; its picture stands on its footprint's near edge. */
      vehicle: VehicleRenderRead & StandingBody,
      camera: CameraState,
      playerSet: VehicleSpriteSet,
      others: readonly CourseSprite[],
      /** Every vehicle whose shadow the frame draws, the player included. */
      shadowed: readonly ShadowedVehicle[],
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
        // A movable object's picture stands on its square's near edge, at the road height there plus its ground offset.
        standingMovables = renderData.movableSprites.map(({ section, index, sprite, footprint }) => {
          const s = footprint.s - footprint.side / 2;
          const position = readers.coordinates.toWorld(s, footprint.l, sample);
          const y = sprite.y - readers.height.sample(footprint.s) + readers.height.sample(s);
          return {
            key: `${section.id} ${index}`,
            sprite: Object.freeze({ ...sprite, x: position.x, y, z: position.z, sRender: s }),
            footprint,
          };
        });
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
      objectSquares.length = 0;
      const down = knocked.length ? new Set(knocked.map((k) => `${k.section.id} ${k.sprite}`)) : null;
      for (const movable of standingMovables)
        if (!down?.has(movable.key)) {
          worldSprites.push(movable.sprite);
          objectSquares.push(movable.footprint);
        }
      for (const k of knocked) {
        const pictures = renderData.knockedPictures(k.section, k.sprite);
        const side = renderData.movableBody(k.section, k.sprite).width;
        // A knocked object's picture stands on its square's near edge at its own height.
        const show = (s: number, l: number, asset: CourseSprite['asset']) => {
          const position = readers.coordinates.toWorld(s - side / 2, l, sample);
          worldSprites.push({ name: asset.name, x: position.x, y: k.y, z: position.z, sRender: s - side / 2, asset });
          objectSquares.push({ s, l, side });
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
      for (const sprite of others) worldSprites.push(sprite);
      return renderDriving(
        target,
        {
          background: renderData.backgroundAt(camera.s),
          guide: readers,
          camera,
          vehicle,
          playerStanding: standingPoint(readers.coordinates, vehicle, viewer.footprint, playerStanding, standingSample),
          terrainParameters,
          worldSprites,
          walls: renderData.walls,
          playerSet,
          shadows: shadows(shadowed, objectSquares),
        },
        { ground: renderData.ground, workspace: renderWorkspace, stripMethod: displaySettings.stripMethod },
        measurements,
      );
    },
  });
}
