import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { readCourseDocument } from '../../dist/course/course-document.js';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { createCourseScene } from '../../dist/runtime/course-scene.js';
import { createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { deriveVehicleSpriteFamily } from '../../dist/render/vehicle-presentation.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { readCourseImages } from './read-course-images.mjs';

const [verb, file, ...args] = process.argv.slice(2);
try {
  if (!['compile', 'render'].includes(verb) || !file || args.length % 2)
    throw new Error(
      'Usage: course.mjs compile|render course.json [--images directory] [--section id] [--s metres] [--l metres] [--vehicle id] [--out frame.png]',
    );
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--images', '--section', '--s', '--l', '--vehicle', '--out'].includes(args[i]) || options.has(args[i]))
      throw new Error(`Unknown or repeated option: ${args[i]}`);
    options.set(args[i], args[i + 1]);
  }
  const document = readCourseDocument(JSON.parse(await readFile(file, 'utf8')));
  if (!document.ok) {
    console.log(JSON.stringify(document));
    process.exitCode = 1;
  } else {
    const images = await readCourseImages(
      document.value.assets,
      options.get('--images') ?? path.resolve(path.dirname(file), '../images'),
    );
    const compiled = await compileCourseDocument(document.value, images);
    if (!compiled.ok) {
      console.log(JSON.stringify(compiled));
      process.exitCode = 1;
    } else {
      const course = compiled.value;
      const result = {
        ok: true,
        course: course.id,
        identity: course.identity,
        sections: course.sections.map((s) => ({
          id: s.id,
          length: s.raster.length,
          scenery: s.presentation?.scenery.length ?? 0,
        })),
      };
      if (verb === 'render') {
        const section = options.has('--section')
          ? course.sections.find((s) => s.id === options.get('--section'))
          : course.entry;
        const entry = options.has('--vehicle')
          ? VEHICLE_CATALOG.find((e) => e.profile.id === options.get('--vehicle'))
          : VEHICLE_CATALOG[0];
        if (!section || !entry) throw new Error('Unknown Section or vehicle');
        const scene = createCourseScene(section);
        const vehicle = createArcadeVehicle(entry.profile, scene.world, {
          s: Number(options.get('--s') ?? 45),
          l: Number(options.get('--l') ?? 0),
          initialSpeed: 0,
          torqueProtection: entry.torqueProtection,
        });
        const camera = updateCamera(createCameraRig(), scene.world, vehicle, CURRENT_CAMERA_PROFILE, 1 / 60);
        const target = new SoftwareSurface(320, 240);
        const stats = scene.render(target, vehicle, camera, deriveVehicleSpriteFamily(entry));
        const png = new PNG({ width: target.width, height: target.height });
        png.data = Buffer.from(target.pixels.buffer);
        const output = path.resolve(options.get('--out') ?? 'frame.png');
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, PNG.sync.write(png));
        result.render = {
          output,
          section: section.id,
          s: vehicle.course.s,
          l: vehicle.course.l,
          vehicle: entry.profile.id,
          stats,
        };
      }
      console.log(JSON.stringify(result));
    }
  }
} catch (error) {
  console.log(JSON.stringify({ ok: false, diagnostics: [{ kind: 'tool', message: error.message }] }));
  process.exitCode = 1;
}
