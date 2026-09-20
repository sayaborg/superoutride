import { loadCourse, options, finite, reportError } from '../course/authoring-io.mjs';
import { compileBandTrial, courseTrialBands } from './band-ground-prototype.mjs';
import { compileCrossSectionPyramids } from './band-cross-section.mjs';

try {
  const flags = options(process.argv.slice(2), ['--mode', '--minimum-width', '--maximum-footprint']);
  const minimumWidth = finite(Number(flags.get('--minimum-width') ?? 1.6), '/minimumWidth', 0.001, 1000);
  const maximumFootprint = finite(
    Number(flags.get('--maximum-footprint') ?? (200 * 200) / (200 * 2.85)),
    '/maximumFootprint',
    minimumWidth,
    100000,
  );
  const modes = flags.has('--mode') ? [flags.get('--mode')] : ['linear', 'seam', 'circuit', 'branch'];
  const reports = [];
  for (const mode of modes) {
    if (!['linear', 'seam', 'circuit', 'branch'].includes(mode)) throw new RangeError('Unknown course mode');
    const { course } = await loadCourse(`content/courses/${mode}.course.json`);
    const sources = course.sections.map((section) => ({
      id: section.id,
      length: section.raster.length,
      ...compileBandTrial(courseTrialBands(section)),
    }));
    const pyramid = compileCrossSectionPyramids(sources, { minimumWidth, maximumFootprint });
    const maximumActive = Math.max(...sources.map((source) => source.maximumActive));
    reports.push({
      mode,
      maximumActive,
      maximumIntervals: pyramid.maximumIntervals,
      dictionaryEntries: pyramid.dictionary.length,
      dictionaryJsonBytes: pyramid.dictionaryBytes,
      directoryUint32Bytes: pyramid.directoryBytes,
      budgets: { activeBands: 64, crossSectionIntervals: 32 },
      withinInitialBudgets: maximumActive <= 64 && pyramid.maximumIntervals <= 32,
      sections: pyramid.sections.map((section, index) => ({
        section: section.id,
        bandCount: sources[index].bandCount,
        maximumActive: sources[index].maximumActive,
        activeDistributionMetres: sources[index].distributionMetres,
        maximumIntervals: section.maximumIntervals,
        levels: section.levels.map(({ width, indices, maximumIntervals, distribution }) => ({
          width,
          buckets: indices.length,
          maximumIntervals,
          distribution,
        })),
        flatRowProbes: [50, 100, 200].map((distance) => {
          const deltaS = (distance * distance) / (200 * 2.85);
          const level = section.selectLevel(deltaS);
          return {
            distance,
            deltaS,
            level,
            maximumIntervals: level < 0 ? null : section.levels[level].maximumIntervals,
          };
        }),
      })),
    });
  }
  const report = {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    scope: 'Offline representation diagnostic, not renderer timing or device qualification.',
    representation:
      'Exact affine opaque and expanded 8-bit color moments; no quantization or fuzzy dictionary merging.',
    bytes: 'Unoptimized dictionary JSON excludes VM overhead; directories count packed Uint32 indices.',
    flatRowProbe: 'deltaS = d*d/(200*2.85), illustrative flat-ground footprints, not measured terrain rows.',
    reports,
  };
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  reportError(error);
}
