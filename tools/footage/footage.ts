/**
 * The footage tool: `npm run footage -- <command>` ([Development](../../docs/development.md#footage-commands)). Each
 * command prints one JSON result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite, reportError, requireInput } from '../course/authoring-io.js';
import { writeFakeFootage } from './fake-footage.js';
import { FRAMES_DIRECTORY, ingestVideo } from './ingest.js';
import { colorCensus } from './census.js';
import { measureFeatures, type HudTemplates } from './features.js';
import { EXACT_DIRECTORY, exactIndices, measureNoise, readFeatures } from './noise.js';
import { calibrateCamera, playerColumn } from './calibrate.js';
import { fitPlan, framePoints, solvePlans } from './plan.js';
import { loadFootageModel, type PitchRule } from './footage-model.js';
import { writeFakeModelDraft } from './fake-model.js';
import { access, readFile } from 'node:fs/promises';

const [command, ...rest] = process.argv.slice(2);
/** Options as `--name value...`: every value up to the next option. */
function parse(args: readonly string[]) {
  const options = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const arg of args)
    if (arg.startsWith('--')) options.set(arg, (current = []));
    else {
      requireInput(current, '/arguments', `Unexpected argument ${arg}`);
      current.push(arg);
    }
  return options;
}

/** A video's directory, `<root>/<game>/<course>/<video>/`, from `--game`, `--course` and `--video`. */
function videoDirectory(root: string, options: Map<string, string[]>) {
  const name = (option: string) => {
    const value = options.get(option)?.[0];
    requireInput(value && /^[a-z0-9][a-z0-9-]*$/.test(value), `/arguments/${option}`, `${option} names an id`);
    return value;
  };
  return path.join(root, name('--game'), name('--course'), name('--video'));
}

/**
 * The footage model's file: `--model`, else the original's committed one (`content/footage/<game>/`), else a draft
 * beside its footage (`<root>/<game>/`), as the fake original's is.
 */
async function footageModelFile(root: string, game: string, options: Map<string, string[]>) {
  const named = options.get('--model')?.[0];
  if (named) return path.resolve(named);
  const committed = path.resolve('content/footage', game, 'footage-model.json');
  try {
    await access(committed);
    return committed;
  } catch {
    return path.join(root, game, 'footage-model.json');
  }
}

try {
  const options = parse(rest);
  const root = path.resolve(options.get('--out')?.[0] ?? 'reference-media');
  switch (command) {
    case 'fake': {
      const { written, gauge } = await writeFakeFootage(root, options.get('--video') ?? [], {
        seconds: Number(options.get('--seconds')?.[0] ?? Infinity),
        exact: Number(options.get('--exact')?.[0] ?? 0),
        encode: !options.has('--no-video'),
      });
      await writeFakeModelDraft(root, gauge.gaugeWidth);
      console.log(JSON.stringify({ ok: true, written }));
      break;
    }
    case 'ingest': {
      const directory = videoDirectory(root, options);
      const file = path.resolve(options.get('--file')?.[0] ?? path.join(directory, 'video.mp4'));
      console.log(JSON.stringify({ ok: true, capture: await ingestVideo(file, directory) }));
      break;
    }
    case 'colors': {
      const directory = videoDirectory(root, options);
      const colors = await colorCensus(directory, Number(options.get('--step')?.[0] ?? 30));
      console.log(JSON.stringify({ ok: true, colors }));
      break;
    }
    case 'features': {
      const directory = videoDirectory(root, options);
      const game = options.get('--game')![0]!;
      const model = await loadFootageModel(await footageModelFile(root, game, options));
      const templates = JSON.parse(await readFile(path.join(root, game, 'hud-templates.json'), 'utf8')) as HudTemplates;
      console.log(JSON.stringify({ ok: true, ...(await measureFeatures(directory, model, templates)) }));
      break;
    }
    case 'noise': {
      // The fake original's capture noise: the features of its exact frames (`fake --exact`) against the video's.
      const directory = videoDirectory(root, options);
      const game = options.get('--game')![0]!;
      const model = await loadFootageModel(await footageModelFile(root, game, options));
      const templates = JSON.parse(await readFile(path.join(root, game, 'hud-templates.json'), 'utf8')) as HudTemplates;
      // The same features on the video's frames and on the exact frames, at the exact frames' indices.
      const indices = await exactIndices(directory);
      await measureFeatures(directory, model, templates, {
        frames: FRAMES_DIRECTORY,
        indices,
        out: 'exact-video-features.jsonl',
      });
      await measureFeatures(directory, model, templates, {
        frames: EXACT_DIRECTORY,
        indices,
        out: 'exact-features.jsonl',
      });
      console.log(JSON.stringify({ ok: true, noise: await measureNoise(directory, 'exact-video-features.jsonl') }));
      break;
    }
    case 'calibrate': {
      // Every named video of the original's first course, calibrated together.
      const game = options.get('--game')?.[0] ?? '';
      const names = options.get('--video') ?? [];
      requireInput(names.length > 0, '/arguments/--video', '--video names one or more videos');
      const file = await footageModelFile(root, game, options);
      const model = await loadFootageModel(file);
      const videos = await Promise.all(
        names.map(async (id) => {
          const directory = videoDirectory(root, new Map([...options, ['--video', [id]]]));
          return { id, features: await readFeatures(path.join(directory, 'features.jsonl')) };
        }),
      );
      const { camera, evidence } = calibrateCamera(videos, model);
      await atomicWrite(file, JSON.stringify({ ...model, camera }, null, 2) + '\n');
      console.log(JSON.stringify({ ok: true, camera, evidence }));
      break;
    }
    case 'solve': {
      // Every named video of the course, with the calibrated footage model: so far the pitch rule (into the model, or
      // checked against the rule it holds) and each video's plan and profile under it.
      const game = options.get('--game')?.[0] ?? '';
      const names = options.get('--video') ?? [];
      requireInput(names.length > 0, '/arguments/--video', '--video names one or more videos');
      const file = await footageModelFile(root, game, options);
      const model = await loadFootageModel(file);
      const camera = model.camera;
      requireInput(camera, '/camera', 'The footage model is calibrated first (calibrate)');
      const column = playerColumn(model);
      const fits = [];
      for (const id of names) {
        const directory = videoDirectory(root, new Map([...options, ['--video', [id]]]));
        const features = await readFeatures(path.join(directory, 'features.jsonl'));
        const fit = (rule: PitchRule | null) => fitPlan(framePoints(features, camera, column), camera, rule);
        fits.push({ id, directory, flat: fit(null), level: fit('level') });
      }
      const { plans, ...judged } = solvePlans(fits, camera);
      // A frozen model's rule is checked: a contradiction stops the work.
      requireInput(
        model.pitch === null || model.pitch === judged.rule,
        '/pitch',
        `The rows prefer the pitch rule ${judged.rule}, the footage model holds ${model.pitch}`,
      );
      if (!model.pitch) await atomicWrite(file, JSON.stringify({ ...model, pitch: judged.rule }, null, 2) + '\n');
      const videos = [];
      for (const [v, { id, directory }] of fits.entries()) {
        const plan = plans[v]!;
        await atomicWrite(path.join(directory, 'plan.json'), JSON.stringify(plan) + '\n');
        const { cell, gradeWeight, residual, rounds, converged } = plan;
        videos.push({ id, cell, gradeWeight, residual, rounds, converged });
      }
      console.log(JSON.stringify({ ok: true, ...judged, videos }));
      break;
    }
    default:
      requireInput(false, '/arguments', `Unknown footage command ${command ?? ''}`);
  }
} catch (error) {
  reportError(error);
}
