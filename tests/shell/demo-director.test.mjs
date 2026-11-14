import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createRenderMeasurements } from '../../src/view/renderer.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';
import { courseStartGrid } from '../../src/course/compiler/course-rules.js';
import { gridRouteS } from '../../src/course/course-route.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { createCourseFilm, createDemoDirector, DEMO_FILM, tickerSteps } from '../../src/shell/demo-director.js';
import { RENDER_FAR_DEPTH_METERS } from '../../src/view/camera.js';
import { routeCamera } from '../../src/view/route-camera.js';

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
const { vehicles } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const WORDS = 'A COURSE';
const INTRO = tickerSteps(WORDS);

// The shown vehicle driven along the road's centre at `speed`, standing in READY for its first second; its finishing
// line `finish` metres from its start, after the course film. Every step draws the shown camera: the course film's, or
// the director's (in CHASE, a camera 6 m behind the vehicle standing for the player's) over the run's world.
async function film(id, { speed, finish, steps }) {
  const course = await loadDeliveredCourse(content, id, materials);
  const courseFilm = createCourseFilm(course, vehicles, CAMERA_DEFINITION, WORDS);
  const director = createDemoDirector(CAMERA_DEFINITION);
  const scene = createCourseScene(course.entry, course.gates, vehicles);
  const slot = courseStartGrid(course.gates, false).at(-1);
  const start = gridRouteS(scene.runtime.route, slot);
  const vehicle = vehicles[0];
  const sprites = createRaceSprites(vehicles, () => true);
  const target = createLogicalFrame();
  const shots = [];
  const shown = {
    id: 'PLAYER',
    vehicleId: vehicle.compiledVehicle.id,
    color: Object.keys(vehicle.listing.visuals.colorNames)[0],
    course: { s: start, l: slot.l },
    renderY: 0,
    yaw: 0,
    brakeLampOn: false,
    contactResponse: null,
    longitudinalSpeed: 0,
    lateralSpeed: 0,
  };
  const chase = () =>
    routeCamera(
      scene.world,
      { s: shown.course.s - 6, l: shown.course.l, height: 2, aim: shown.course.l },
      CAMERA_DEFINITION,
    );
  const frame = (step) => {
    if (!courseFilm.ended) {
      target.pixels.fill(0);
      courseFilm.draw(target);
      return assert.ok(
        target.pixels.some((pixel) => pixel !== 0),
        `${id} step ${step} (INTRO) drew`,
      );
    }
    const measurements = createRenderMeasurements();
    const camera = director.camera ?? chase();
    shown.yaw = scene.world.coordinates.toWorld(shown.course.s, shown.course.l, {}).heading;
    shown.renderY = scene.world.height.sample(shown.course.s);
    scene.render(target, null, camera, sprites([shown], camera, scene.world), [], [], measurements);
    assert.ok(measurements.stripGround.outputPixels > 0, `${id} step ${step} (${director.shot}) drew its ground`);
  };
  for (let step = 0; step < steps; step++) {
    if (!courseFilm.ended) courseFilm.step();
    else {
      const ready = shots.filter((s) => s === 'START').length < 60;
      if (!ready) shown.course = { s: shown.course.s + speed * SIM_DT, l: shown.course.l };
      scene.runtime.refresh(shown.course.s, shown.course.s);
      director.step({
        status: ready ? 'READY' : 'RUNNING',
        shown,
        next: { s: start + finish, finish: true },
        rearmost: shown.course.s,
        world: scene.world,
        retainedFrom: scene.runtime.window.occurrences[0].start,
      });
      // A camera looking back reads the route the other way, as far back as it draws.
      const { camera } = director;
      if (camera)
        assert.ok(
          (camera.reversed ? -camera.s - RENDER_FAR_DEPTH_METERS : camera.s) >=
            scene.runtime.window.occurrences[0].start - 1e-6,
          `${id} ${director.shot} camera within the route`,
        );
    }
    shots.push(courseFilm.ended ? director.shot : 'INTRO');
    if (step % 15 === 0) frame(step);
  }
  return shots;
}

// The shots in the order they came, each once for every run of it.
const order = (shots) => shots.filter((shot, i) => shot !== shots[i - 1]);

test('the demo introduces the course, then starts behind the grid and takes the race in turns to the goal', async () => {
  const seconds = (s) => Math.round(s / SIM_DT);
  const shots = await film('tsukuba', { speed: 40, finish: 3200, steps: INTRO + seconds(85) });
  assert.deepEqual(shots.slice(0, INTRO), Array(INTRO).fill('INTRO'));
  assert.deepEqual(order(shots).slice(0, 6), ['INTRO', 'START', 'FIXED', 'PASSED', 'LEFT', 'CHASE']);
  assert.equal(order(shots).filter((shot) => shot === 'GOAL').length, 1);
  // Each shot after START lasts at most a cut; the goal stays to the end.
  const runs = [];
  shots.forEach((shot, i) => (shot === shots[i - 1] ? runs[runs.length - 1]++ : runs.push(1)));
  assert.ok(runs.slice(2, -1).every((n) => n <= seconds(DEMO_FILM.cut) + 1));
  assert.equal(shots.at(-1), 'GOAL');
});

test('a course without laps is introduced past its forks along their first exits', async () => {
  const shots = await film('outrun-a', { speed: 60, finish: 1e6, steps: INTRO + 1200 });
  assert.equal(shots[INTRO], 'START');
  assert.ok(shots.includes('PASSED'));
});
