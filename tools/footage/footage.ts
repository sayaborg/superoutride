/**
 * The footage tool: `npm run footage -- <command>` ([Development](../../docs/development.md#footage-commands)). Each
 * command prints one JSON result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { reportError, requireInput } from '../course/authoring-io.js';
import { writeFakeFootage } from './fake-footage.js';
import { FRAMES_DIRECTORY, ingestVideo } from './ingest.js';
import { colorCensus } from './census.js';
import { measureFeatures, type HudTemplates } from './features.js';
import { EXACT_DIRECTORY, exactIndices, measureNoise } from './noise.js';
import { loadFootageModel } from './footage-model.js';
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
      const written = await writeFakeFootage(root, options.get('--video') ?? [], {
        seconds: Number(options.get('--seconds')?.[0] ?? Infinity),
        exact: Number(options.get('--exact')?.[0] ?? 0),
        encode: !options.has('--no-video'),
      });
      await writeFakeModelDraft(root);
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
    default:
      requireInput(false, '/arguments', `Unknown footage command ${command ?? ''}`);
  }
} catch (error) {
  reportError(error);
}
