import { mkdir, writeFile } from 'node:fs/promises';
import { compileContent } from '../authoring/compile-content.js';
import { createNodeContentStore } from './node-content-store.js';
import { requireCompiled, reportError } from '../course/authoring-io.js';
import { measureRacingVehicle } from '../course/racing-vehicle-check.js';
import { RACING_PICTURES } from '../graphics/racing-vehicle-shapes.js';

try {
  const { definitions } = requireCompiled(await compileContent(createNodeContentStore(), { measured: false }));
  const measurements = Object.keys(RACING_PICTURES).map((id) => {
    const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === id);
    if (!entry) throw new Error(`The admitted vehicle catalog is missing ${id}`);
    const result = measureRacingVehicle(entry, definitions.driving);
    console.log(JSON.stringify({ id, terminal: result.samples.at(-1), braking: result.braking }));
    return result;
  });
  const directory = new URL('../../dist/racing-validation/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('measurements.json', directory), JSON.stringify(measurements, null, 2) + '\n');
} catch (error) {
  reportError(error);
}
