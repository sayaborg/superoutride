import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCourse, options } from '../course/authoring-io.mjs';
import { courseTrialBands } from './band-ground-prototype.mjs';
import { compileResolvedBands, packResolvedSlabs } from './band-resolved-slabs.mjs';

const flags = options(process.argv.slice(2), ['--out']);
if (!flags.has('--out')) throw new RangeError('An external output directory is required');
const out = path.resolve(flags.get('--out'));
await mkdir(out, { recursive: true });
const reports = [];
for (const mode of ['linear', 'seam', 'circuit', 'branch']) {
  const { course } = await loadCourse(`content/courses/${mode}.course.json`);
  const sections = [];
  for (const [index, section] of course.sections.entries()) {
    const bands = courseTrialBands(section, true);
    const source = compileResolvedBands(bands, section.raster.length);
    const packed = packResolvedSlabs(source);
    await writeFile(path.join(out, `${mode}-${index}.bin`), packed.bytes);
    sections.push({
      id: section.id,
      bandCount: bands.length,
      slabCount: source.slabs.length,
      dictionaryRows: source.dictionary.length,
      maximumIntervals: source.maximumIntervals,
      distributionMetres: source.distributionMetres,
      openBandCount: bands.filter((b) => b.openLeft || b.openRight).length,
      headerBytes: packed.headerBytes,
      dictionaryBytes: packed.dictionaryBytes,
      directoryBytes: packed.directoryBytes,
      totalBytes: packed.bytes.byteLength,
    });
  }
  reports.push({ mode, sections, totalBytes: sections.reduce((sum, s) => sum + s.totalBytes, 0) });
}
const report = {
  node: process.version,
  scope: 'Near resolved-slab compilation only; no renderer or ground-adoption qualification',
  format:
    'Little-endian: 16-byte header; dictionary offsets and 35-byte affine/color/flags records; 12-byte slab directory entries and final float64 endpoint',
  maximumIntervals: 64,
  qualified: false,
  remaining: [
    'far normalized-u rows and interpolation',
    'whole-plane scene integration',
    'fresh-process three-way performance comparison',
    'subpixel transition/oracle error gates and arrow/cliff distant stills',
  ],
  reports,
};
await writeFile(path.join(out, 'summary.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
