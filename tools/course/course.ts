import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import { createSessionVehicle } from '../../src/content/session-vehicle.js';
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
interface RenderFrame {
  output: string;
  section: string;
  s: number;
  l: number;
  vehicle: string;
  stats: ReturnType<ReturnType<typeof createCourseScene>['render']>;
}
import { referenceCommand } from './reference-command.js';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { readDeliveredContent } from './read-content.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../src/view/current-camera-profile.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { expandRgb555Pixels } from '../../src/image/rgb555.js';
import { courseReport } from './course-report.js';
import { options, loadCourse, requireInput, finite, atomicWrite, reportError } from './authoring-io.js';

const [verb, file, ...args] = process.argv.slice(2);
try {
  if (verb === 'envelope') {
    // An envelope names no course; every argument is an option.
    console.log(JSON.stringify(await referenceCommand(verb, null, file === undefined ? [] : [file, ...args])));
  } else if (verb === 'reference') {
    requireInput(file, '/arguments', 'Usage: npm run course -- reference course.json --vehicle ID --out file');
    console.log(JSON.stringify(await referenceCommand(verb, file, args)));
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
      { course, materials } = await loadCourse(file, opts.get('--images'));
    const result: {
      ok: boolean;
      course: string;
      identity: CompiledCourse['identity'];
      sections: { id: string; length: number; sprites: number }[];
      ground?: Record<string, number>;
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
      // The report sums each Section's color ground metrics; the maximum is the course maximum.
      const metrics = course.sections.map((s) => s.color.metrics);
      const sum = (key: 'expandedStrips' | 'preblendCells' | 'lateralFields' | 'coefficientBytes' | 'directoryBytes') =>
        metrics.reduce((n, m) => n + m[key], 0);
      result.ground = {
        sectionCount: metrics.length,
        expandedStrips: sum('expandedStrips'),
        maxActiveStrips: Math.max(...metrics.map((m) => m.maxActiveStrips)),
        preblendCells: sum('preblendCells'),
        lateralFields: sum('lateralFields'),
        coefficientBytes: sum('coefficientBytes'),
        directoryBytes: sum('directoryBytes'),
      };
    } else if (verb === 'render') {
      const content = await readDeliveredContent();
      const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
      const entry = opts.has('--vehicle')
        ? definitions.vehicles.find((e) => e.compiledVehicle.id === opts.get('--vehicle'))
        : definitions.vehicles[0];
      requireInput(entry, '/vehicle', 'Unknown vehicle');
      const sprites = createVehicleSprites(entry);
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
        scene = createCourseScene(section, course.gates, definitions.vehicles);
      if (opts.has('--exit')) {
        const link = section.outgoing.find((l) => l.id === opts.get('--exit'));
        requireInput(link, '/exit', 'Exit must name a canonical outgoing Link');
        scene.runtime.selectSuccessor(link);
        scene.runtime.refresh(0, Math.max(...stations));
      }
      const destination = path.resolve(opts.get('--out') ?? (sequence ? 'frames' : 'frame.png'));
      const frames: RenderFrame[] = [];
      for (const [i, s] of stations.entries()) {
        const vehicle = createVehicle(
          createVehicleModel(createSessionVehicle(entry, definitions.driving, materials), SIM_DT),
          scene.world,
          {
            s,
            l,
            initialSpeed: 0,
          },
        );
        const camera = updateCamera(createCameraRig(), scene.world, vehicle, CURRENT_CAMERA_PROFILE),
          target = createLogicalFrame();
        const stats = scene.render(target, vehicle, camera, sprites.off, []),
          png = new PNG({ width: target.width, height: target.height });
        const rgba = new Uint32Array(target.pixels.length);
        expandRgb555Pixels(target.pixels, rgba);
        png.data = Buffer.from(rgba.buffer);
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
