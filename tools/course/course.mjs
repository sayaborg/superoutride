import path from 'node:path';
import { PNG } from 'pngjs';
import { createCourseScene } from '../../dist/runtime/course-scene.js';
import { createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { deriveVehicleSpriteFamily } from '../../dist/render/vehicle-presentation.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { courseReport } from './course-report.mjs';
import { options, loadCourse, requireInput, finite, atomicWrite, reportError } from './authoring-io.mjs';

const [verb, file, ...args] = process.argv.slice(2);
try {
  requireInput(
    ['compile', 'render', 'report'].includes(verb) && file,
    '/arguments',
    'Usage: course.mjs compile|render|report course.json [options]',
  );
  const flags =
    verb === 'compile'
      ? ['--images']
      : verb === 'report'
        ? ['--images', '--section', '--out', '--step']
        : ['--images', '--section', '--s', '--l', '--vehicle', '--out', '--start', '--end', '--step', '--exit'];
  const opts = options(args, flags),
    { course } = await loadCourse(file, opts.get('--images'));
  const result = {
    ok: true,
    course: course.id,
    identity: course.identity,
    reference: course.reference,
    sections: course.sections.map((s) => ({
      id: s.id,
      length: s.raster.length,
      scenery: s.presentation?.scenery.length ?? 0,
    })),
  };
  const section = opts.has('--section') ? course.sections.find((s) => s.id === opts.get('--section')) : course.entry;
  requireInput(section, '/section', 'Unknown Section');
  if (verb === 'render') {
    const entry = opts.has('--vehicle')
      ? VEHICLE_CATALOG.find((e) => e.profile.id === opts.get('--vehicle'))
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
      const start = finite(Number(opts.get('--start')), '/start', 0, section.raster.length),
        end = finite(Number(opts.get('--end')), '/end', start, section.raster.length),
        step = finite(Number(opts.get('--step')), '/step', 0.01);
      const count = Math.floor((end - start) / step + 1e-10) + 1;
      requireInput(count <= 240, '/sequence', 'At most 240 frames per command');
      stations = Array.from({ length: count }, (_, i) => start + i * step);
    } else stations = [finite(Number(opts.get('--s') ?? 45), '/s', 0, section.raster.length)];
    const l = finite(Number(opts.get('--l') ?? 0), '/l', -1000, 1000),
      scene = createCourseScene(section);
    if (opts.has('--exit')) {
      const link = section.outgoing.find((l) => l.id === opts.get('--exit'));
      requireInput(link, '/exit', 'Exit must name a canonical outgoing Link');
      scene.session.prepareChoice(link).commit();
    }
    const destination = path.resolve(opts.get('--out') ?? (sequence ? 'frames' : 'frame.png'));
    const frames = [];
    for (const [i, s] of stations.entries()) {
      const vehicle = createArcadeVehicle(entry.profile, scene.world, {
        s,
        l,
        initialSpeed: 0,
        torqueProtection: entry.torqueProtection,
      });
      const camera = updateCamera(createCameraRig(), scene.world, vehicle, CURRENT_CAMERA_PROFILE, 1 / 60),
        target = new SoftwareSurface(320, 240);
      const stats = scene.render(target, vehicle, camera, deriveVehicleSpriteFamily(entry)),
        png = new PNG({ width: 320, height: 240 });
      png.data = Buffer.from(target.pixels.buffer);
      const output = sequence ? path.join(destination, `${String(i).padStart(4, '0')}.png`) : destination;
      await atomicWrite(output, PNG.sync.write(png));
      frames.push({
        output,
        section: section.id,
        s: vehicle.course.s,
        l: vehicle.course.l,
        vehicle: entry.profile.id,
        stats,
      });
    }
    result.render = sequence ? { frames } : frames[0];
  } else if (verb === 'report') {
    requireInput(section.presentation, '/section', 'Report needs explicit saved presentation');
    result.report = await courseReport(
      course,
      section,
      path.resolve(opts.get('--out') ?? 'course-report'),
      Number(opts.get('--step') ?? 10),
    );
  }
  console.log(JSON.stringify(result));
} catch (error) {
  reportError(error);
}
