import { ORIGINALS_PLACE } from '../authoring/content-places.js';
import { PNG } from 'pngjs';
import { decodeSpritePng } from '../graphics/sprite-png.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { contentDigest } from '../../src/core/content-digest.js';
import { readSpriteLodAsset } from '../../src/image/sprite.js';
import { createNodeContentStore } from '../build/node-content-store.js';
import { derivePublicPictures } from './derive.js';
import { spriteLayers } from '../graphics/sprite-layers.js';
import { PUBLIC_TABLE_PATH, readPublicPictureTable } from './table.js';
import {
  bodyDigest,
  generationPrompt,
  GENERATION_DIRECTORY,
  picturePng,
  readGenerationRecord,
  readGeneratedSource,
} from './generation.js';

const root = new URL('../../', import.meta.url),
  store = createNodeContentStore();
const table = readPublicPictureTable(JSON.parse(new TextDecoder().decode(await store.read(PUBLIC_TABLE_PATH))));
const [verb, ...args] = process.argv.slice(2);
const usage =
  'Usage: public-picture-inputs prepare [enduror-ID ...] | accept enduror-ID image.png [model version usage] | build';
const readOriginal = async (name: string) => {
  const files = await store.list(`${ORIGINALS_PLACE}/images`),
    mirrored = !files.includes(`${name}.json`);
  const asset = readSpriteLodAsset(
    JSON.parse(
      new TextDecoder().decode(
        await store.read(`${ORIGINALS_PLACE}/images/${name}${mirrored ? '-mirrored' : ''}.json`),
      ),
    ),
  );
  return { asset, ...spriteLayers(asset.levels[0]!, mirrored) };
};
const folder = (name: string) => new URL(`reference-media/public-picture-generation/${name}/`, root);
if (verb === 'prepare') {
  const names = args.length ? args : Object.keys(table.pictures);
  const completed = await store.list(GENERATION_DIRECTORY);
  for (const name of names) {
    if (!table.pictures[name]) throw new RangeError(`Unknown picture: ${name}`);
    if (!args.length && completed.includes(`${name}.json`)) {
      console.log(`${name}: complete; skipped`);
      continue;
    }
    const { asset, body, master } = await readOriginal(name),
      palette = asset.palettes[asset.defaultPalette]!.colors;
    const out = folder(name);
    await mkdir(out, { recursive: true });
    const enlargement = Math.max(1, Math.min(8, Math.floor(1536 / Math.max(body.width, body.height))));
    const input = picturePng(body, palette, enlargement);
    await writeFile(new URL('input.png', out), input);
    await writeFile(new URL('body.png', out), picturePng(body, palette));
    await writeFile(new URL('master.png', out), picturePng(master, palette));
    await writeFile(new URL('prompt.txt', out), generationPrompt(table.pictures[name]!.description));
    await writeFile(
      new URL('input.json', out),
      JSON.stringify(
        { inputDigest: await contentDigest(input), bodyDigest: await bodyDigest(body, palette) },
        null,
        2,
      ) + '\n',
    );
    console.log(`${name}: ${out.pathname} (use built-in imagegen; save generated.png, then accept)`);
  }
} else if (verb === 'accept') {
  const [name, file, model, modelVersion, reportedUsage] = args;
  if (!name || !table.pictures[name] || !file || args.length > 5) throw new TypeError(usage);
  const previous = (await store.list(GENERATION_DIRECTORY)).includes(`${name}.json`)
    ? readGenerationRecord(
        JSON.parse(new TextDecoder().decode(await store.read(`${GENERATION_DIRECTORY}/${name}.json`))),
      )
    : null;
  const attempts = previous ? [...previous.attempts] : [];
  if (attempts.length >= 3) throw new RangeError('Three attempts used: stop for K before generating more');
  const input = JSON.parse(await readFile(new URL('input.json', folder(name)), 'utf8')) as {
    inputDigest: string;
    bodyDigest: string;
  };
  if ((await contentDigest(new Uint8Array(await readFile(new URL('input.png', folder(name)))))) !== input.inputDigest)
    throw new RangeError('Prepared input digest differs');
  const png = new Uint8Array(await readFile(file));
  await decodeSpritePng(png, PNG);
  attempts.push({
    attempt: attempts.length + 1,
    savedAt: new Date().toISOString(),
    prompt: await readFile(new URL('prompt.txt', folder(name)), 'utf8'),
    ...input,
    generatedDigest: await contentDigest(png),
    model: model ?? null,
    modelVersion: modelVersion ?? null,
    reportedUsage: reportedUsage ?? null,
    calls: 1,
  });
  const record = readGenerationRecord({
    format: 'superoutride.public-picture-generation',
    version: 1,
    picture: name,
    complete: true,
    attempts,
  });
  await store.write(`${GENERATION_DIRECTORY}/${name}.attempt-${attempts.length}.png`, png);
  await store.write(`${GENERATION_DIRECTORY}/${name}.png`, png);
  await store.write(
    `${GENERATION_DIRECTORY}/${name}.json`,
    new TextEncoder().encode(JSON.stringify(record, null, 2) + '\n'),
  );
  await readGeneratedSource(store, name);
  console.log(
    `${name}: completed attempt ${attempts.length}; model/version/usage not supplied are recorded unavailable`,
  );
} else if (verb === 'build' && !args.length) {
  const files = await derivePublicPictures(store);
  for (const [path, bytes] of files) if (path.startsWith('images/') && bytes) await store.write(path, bytes);
  console.log('Rebuilt public images from saved inputs; no generation invoked');
} else throw new TypeError(usage);
