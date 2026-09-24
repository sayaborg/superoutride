import { browserSessionVehicle } from '../../src/shell/session-vehicle.js';
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CourseGround } from '../../src/course/compiler/course-ground.js';
interface RenderFrame {
  output: string;
  section: string;
  s: number;
  l: number;
  vehicle: string;
  stats: ReturnType<ReturnType<typeof createCourseScene>['render']>;
}
import { readVehicleSprites } from './read-vehicle-sprites.js';
import { referenceCommand } from './reference-command.js';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createCourseScene } from '../../src/shell/course-scene.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { VEHICLE_CATALOG } from '../../src/vehicle/vehicle-catalog.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../src/view/current-camera-profile.js';
import { deriveVehicleSpriteFamily } from '../../src/view/vehicle-visuals.js';
import { SoftwareSurface } from '../../src/view/software-surface.js';
import { courseReport } from './course-report.js';
import {
  options,
  loadCourse,
  loadCourseGround,
  requireInput,
  finite,
  atomicWrite,
  reportError,
} from './authoring-io.js';
const spriteAssets = await readVehicleSprites();

const [verb, file, ...args] = process.argv.slice(2);
try {
  if (['envelope', 'reference'].includes(verb!)) {
    console.log(JSON.stringify(await referenceCommand(verb!, file!, args)));
  } else {
    requireInput(
      ['compile', 'render', 'report'].includes(verb!) && file,
      '/arguments',
      'Usage: npm run course -- compile|render|report course.json [options]',
    );
    const flags =
      verb === 'compile'
        ? ['--images']
        : verb === 'report'
          ? ['--images', '--section', '--out', '--step']
          : ['--images', '--section', '--s', '--l', '--vehicle', '--out', '--start', '--end', '--step', '--exit'];
    const opts = options(args, flags),
      { course } = await loadCourse(file, opts.get('--images'));
    const result: {
      ok: boolean;
      course: string;
      identity: CompiledCourse['identity'];
      sections: { id: string; length: number; sprites: number }[];
      ground?: CourseGround['metrics'];
      render?: RenderFrame | { frames: RenderFrame[] };
      report?: Awaited<ReturnType<typeof courseReport>>;
    } = {
      ok: true,
      course: course.id,
      identity: course.identity,
      sections: course.sections.map((s) => ({
        id: s.id,
        length: s.coordinates.domain.end,
        sprites: s.appearance?.sprites.length ?? 0,
      })),
    };
    const section = opts.has('--section') ? course.sections.find((s) => s.id === opts.get('--section')) : course.entry;
    requireInput(section, '/section', 'Unknown Section');
    if (verb === 'compile') {
      result.ground = (await loadCourseGround(course)).metrics;
    } else if (verb === 'render') {
      const entry = opts.has('--vehicle')
        ? VEHICLE_CATALOG.find((e) => e.compiledVehicle.id === opts.get('--vehicle'))
        : VEHICLE_CATALOG[0];
      requireInput(entry, '/vehicle', 'Unknown vehicle');
      const sequence = ['--start', '--end', '--step'].some((f) => opts.has(f));
      let stations;
      if (sequence) {
        requireInput(
          !opts.has('--s') && ['--start', '--end', '--step'].every((f) => opts.has(f)),
          '/sequence',
          'Specify start/end/step together, separately from s',
        );
        const start = finite(Number(opts.get('--start')), '/start', 0, section.coordinates.domain.end),
          end = finite(Number(opts.get('--end')), '/end', start, section.coordinates.domain.end),
          step = finite(Number(opts.get('--step')), '/step', 0.01);
        const count = Math.floor((end - start) / step + 1e-10) + 1;
        requireInput(count <= 240, '/sequence', 'At most 240 frames per command');
        stations = Array.from({ length: count }, (_, i) => start + i * step);
      } else stations = [finite(Number(opts.get('--s') ?? 45), '/s', 0, section.coordinates.domain.end)];
      const l = finite(Number(opts.get('--l') ?? 0), '/l', -1000, 1000),
        scene = createCourseScene(section, await loadCourseGround(course), spriteAssets, course.gates);
      if (opts.has('--exit')) {
        const link = section.outgoing.find((l) => l.id === opts.get('--exit'));
        requireInput(link, '/exit', 'Exit must name a canonical outgoing Link');
        scene.runtime.route.append(link);
        scene.runtime.refresh(0, Math.max(...stations));
      }
      const destination = path.resolve(opts.get('--out') ?? (sequence ? 'frames' : 'frame.png'));
      const frames: RenderFrame[] = [];
      for (const [i, s] of stations.entries()) {
        const vehicle = createVehicle(entry.compiledVehicle, scene.world, {
          s,
          l,
          initialSpeed: 0,
          ...browserSessionVehicle(entry),
        });
        const camera = updateCamera(createCameraRig(), scene.world, vehicle, CURRENT_CAMERA_PROFILE, 1 / 60),
          target = new SoftwareSurface(320, 240);
        const stats = scene.render(target, vehicle, camera, deriveVehicleSpriteFamily(entry), []),
          png = new PNG({ width: 320, height: 240 });
        png.data = Buffer.from(target.pixels.buffer);
        const output = sequence ? path.join(destination, `${String(i).padStart(4, '0')}.png`) : destination;
        await atomicWrite(output, PNG.sync.write(png));
        frames.push({
          output,
          section: section.id,
          s: vehicle.course.s,
          l: vehicle.course.l,
          vehicle: entry.compiledVehicle.id,
          stats,
        });
      }
      result.render = sequence ? { frames } : frames[0];
    } else if (verb === 'report') {
      requireInput(section.appearance, '/section', 'Report needs explicit saved appearance');
      result.report = await courseReport(
        course,
        section,
        path.resolve(opts.get('--out') ?? 'course-report'),
        Number(opts.get('--step') ?? 10),
      );
    }
    console.log(JSON.stringify(result));
  }
} catch (error) {
  reportError(error);
}
