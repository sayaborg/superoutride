/**
 * The footage tool: `npm run footage -- <command>` ([Development](../../docs/development.md#footage-commands)). Each
 * command prints one JSON result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite, reportError, requireInput } from '../course/authoring-io.js';
import { FRAMES_DIRECTORY, ingestVideo, type CaptureValues } from './ingest.js';
import { colorCensus } from './census.js';
import { measureFeatures, type HudTemplates } from './features.js';
import { EXACT_DIRECTORY, exactIndices, measureNoise, readFeatures } from './noise.js';
import { calibrateCamera, playerColumn } from './calibrate.js';
import { fitPlan, framePoints, solvePlans } from './plan.js';
import { loadFootageModel, TIMING_KINDS, type PitchRule } from './footage-model.js';
import { access, readFile } from 'node:fs/promises';

const [command, ...rest] = process.argv.slice(2);

/** A video's features within the stretch its capture values mark where the player drives: all of them when unmarked. */
async function drivenFeatures(directory: string) {
  const capture = JSON.parse(await readFile(path.join(directory, 'capture.json'), 'utf8')) as CaptureValues;
  const features = await readFeatures(path.join(directory, 'features.jsonl'));
  const drive = capture.drive;
  return drive ? features.filter((f) => f.t >= drive.from && f.t <= drive.to) : features;
}
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
 * beside its footage (`<root>/<game>/`).
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
    case 'ingest': {
      const directory = videoDirectory(root, options);
      const file = path.resolve(options.get('--file')?.[0] ?? path.join(directory, 'video.mp4'));
      console.log(JSON.stringify({ ok: true, capture: await ingestVideo(file, directory) }));
      break;
    }
    case 'drive': {
      // What a person marks in the frames: the stretch where the player drives and the timing events the HUD does not
      // read, seconds on the frames' timestamps.
      const directory = videoDirectory(root, options);
      const file = path.join(directory, 'capture.json');
      const capture = JSON.parse(await readFile(file, 'utf8')) as CaptureValues;
      const { duration } = capture.frames;
      const times = (option: string) =>
        (options.get(option) ?? []).map((value) => {
          const t = Number(value);
          requireInput(t >= 0 && t <= duration, `/arguments/${option}`, `${option} takes times within 0–${duration} s`);
          return t;
        });
      const [from = 0] = times('--from'),
        [to = duration] = times('--to');
      requireInput(from < to, '/arguments/--to', '--to lies after --from');
      const events = TIMING_KINDS.flatMap((kind) => times(`--${kind}`).map((t) => ({ kind, t }))).sort(
        (a, b) => a.t - b.t,
      );
      requireInput(
        events.every(({ t }) => t >= from && t <= to),
        '/arguments',
        'Timing events lie within the stretch',
      );
      const drive = { from, to, events };
      await atomicWrite(file, JSON.stringify({ ...capture, drive }, null, 2) + '\n');
      console.log(JSON.stringify({ ok: true, drive }));
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
      // A video's capture noise: the features of its exact frames (`exact/`) against the video's.
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
          return { id, features: await drivenFeatures(directory) };
        }),
      );
      const { camera, evidence } = calibrateCamera(videos, model);
      await atomicWrite(file, JSON.stringify({ ...model, camera }, null, 2) + '\n');
      console.log(JSON.stringify({ ok: true, camera, evidence }));
      break;
    }
    case 'solve': {
      // Every named video of the course, with the calibrated footage model: so far each video's plan and profile under
      // the model's pitch rule, and the rows' check of that rule.
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
        const features = await drivenFeatures(directory);
        const fit = (rule: PitchRule | null) => fitPlan(framePoints(features, camera, column), camera, rule);
        fits.push({ id, directory, flat: fit(null), level: fit('level') });
      }
      // The pitch rule is the person's, written in the footage model; the rows' own preference checks it.
      requireInput(model.pitch, '/pitch', 'The footage model names the pitch rule (level or road) before solve');
      const { plans, check } = solvePlans(fits, camera, model.pitch);
      const videos = [];
      for (const [v, { id, directory }] of fits.entries()) {
        const plan = plans[v]!;
        await atomicWrite(path.join(directory, 'plan.json'), JSON.stringify(plan) + '\n');
        const { cell, gradeWeight, residual, rounds, converged } = plan;
        videos.push({ id, cell, gradeWeight, residual, rounds, converged });
      }
      console.log(JSON.stringify({ ok: true, pitch: { rule: model.pitch, check }, videos }));
      break;
    }
    default:
      requireInput(false, '/arguments', `Unknown footage command ${command ?? ''}`);
  }
} catch (error) {
  reportError(error);
}
