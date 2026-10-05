import { PNG } from 'pngjs';
import { replaceDocument } from '../authoring/content-store.js';
import { createNodeContentStore } from './node-content-store.js';
import { options, reportError, requireInput } from '../course/authoring-io.js';
import { NO_ADJUSTMENT } from '../graphics/oklab.js';
import { courseImageFile, importSpriteSource } from '../graphics/sprite-import.js';
import {
  addSetSprite,
  adjustSetPalette,
  bindSetCell,
  createSpriteSet,
  replaceSetSprite,
  type VehicleSpriteSetDocument,
} from '../graphics/sprite-set-operations.js';

/**
 * The sprite command: the workbench's sprite operations over `content/`. `import` makes a master from a saved source
 * and recipe (`content/sprite-sources/<name>.png` and `.json`): a course image is written as its content-addressed
 * file; a vehicle image replaces the set's image of that name or is added, shown in the given cells. `new-set` starts
 * a set from one imported image. `adjust` derives a named palette in Oklab for every image of a set.
 */
const USAGE = [
  'Usage: npm run sprite -- import <name> [--set <set> [--cells yaw:bank,...]]',
  '       npm run sprite -- new-set <set> --image <name> --yaw <n> --bank <n> [--bank-degrees <d>] --lamp <off>,<on>',
  '       npm run sprite -- adjust --set <set> --from <palette> --to <palette> --slots <s,...> [--hue <deg>]',
  '                         [--saturation <s>] [--lightness <l>] [--tint-hue <deg>] [--tint-amount <a>]',
].join('\n');
const store = createNodeContentStore();
const setPath = (name: string) => `sprites/${name}.json`;
const readSet = async (name: string) =>
  JSON.parse(new TextDecoder().decode(await store.read(setPath(name)))) as VehicleSpriteSetDocument;
const numbers = (text: string | undefined, location: string) => {
  const values = (text ?? '').split(',').map(Number);
  requireInput(text && values.every(Number.isFinite), location, `Expected numbers separated by commas`);
  return values;
};

const [verb, subject, ...args] = process.argv.slice(2);
try {
  if (verb === 'import') {
    requireInput(subject, '/arguments', USAGE);
    const opts = options(args, ['--set', '--cells']);
    const { recipe, master } = await importSpriteSource(store, subject, PNG);
    if (recipe.target === 'course') {
      requireInput(!opts.size, '/arguments', 'A course image belongs to no set');
      const file = await courseImageFile(master);
      await store.write(file.path, file.bytes);
      console.log(JSON.stringify({ ok: true, image: `content/${file.path}`, sha256: file.sha256 }));
    } else {
      requireInput(opts.has('--set'), '/arguments', 'A vehicle image names its --set');
      const name = opts.get('--set')!;
      let set = await readSet(name);
      const existing = set.sprites.findIndex((sprite) => sprite.name === subject);
      set = existing >= 0 ? replaceSetSprite(set, existing, master) : addSetSprite(set, master);
      const index = existing >= 0 ? existing : set.sprites.length - 1;
      for (const cell of opts.get('--cells')?.split(',') ?? []) {
        const [yaw, bank] = numbers(cell.replace(':', ','), '/cells');
        set = bindSetCell(set, yaw!, bank!, index);
      }
      await replaceDocument(store, setPath(name), set);
      console.log(JSON.stringify({ ok: true, set: `content/${setPath(name)}`, image: index, replaced: existing >= 0 }));
    }
  } else if (verb === 'new-set') {
    requireInput(subject, '/arguments', USAGE);
    const opts = options(args, ['--image', '--yaw', '--bank', '--bank-degrees', '--lamp']);
    requireInput(
      ['--image', '--yaw', '--bank', '--lamp'].every((o) => opts.has(o)),
      '/arguments',
      USAGE,
    );
    const { recipe, master } = await importSpriteSource(store, opts.get('--image')!, PNG);
    requireInput(recipe.target === 'vehicle', '/image', 'A set holds vehicle images');
    const [off, on] = numbers(opts.get('--lamp'), '/lamp');
    const set = createSpriteSet(
      {
        yawVariants: Number(opts.get('--yaw')),
        bankVariants: Number(opts.get('--bank')),
        ...(opts.has('--bank-degrees') ? { bankDegrees: Number(opts.get('--bank-degrees')) } : {}),
      },
      { off: off!, on: on! },
      master,
    );
    await replaceDocument(store, setPath(subject), set);
    console.log(JSON.stringify({ ok: true, set: `content/${setPath(subject)}` }));
  } else if (verb === 'adjust') {
    const opts = options(subject === undefined ? [] : [subject, ...args], [
      '--set',
      '--from',
      '--to',
      '--slots',
      '--hue',
      '--saturation',
      '--lightness',
      '--tint-hue',
      '--tint-amount',
    ]);
    requireInput(
      ['--set', '--from', '--to', '--slots'].every((o) => opts.has(o)),
      '/arguments',
      USAGE,
    );
    const value = (option: string) => (opts.has(option) ? numbers(opts.get(option), option)[0]! : 0);
    const name = opts.get('--set')!;
    const set = adjustSetPalette(
      await readSet(name),
      opts.get('--from')!,
      opts.get('--to')!,
      numbers(opts.get('--slots'), '/slots'),
      {
        ...NO_ADJUSTMENT,
        hue: value('--hue'),
        saturation: value('--saturation'),
        lightness: value('--lightness'),
        tint: { hue: value('--tint-hue'), amount: value('--tint-amount') },
      },
    );
    await replaceDocument(store, setPath(name), set);
    console.log(JSON.stringify({ ok: true, set: `content/${setPath(name)}`, palette: opts.get('--to') }));
  } else requireInput(false, '/arguments', USAGE);
} catch (error) {
  // An operation's or the PNG decoder's refusal is the caller's input error.
  reportError(
    error instanceof RangeError
      ? { diagnostics: [{ kind: 'tool', code: 'invalid_input', path: '/arguments', message: error.message }] }
      : error,
  );
}
