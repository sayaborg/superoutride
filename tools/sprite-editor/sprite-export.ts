import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { imagePathIn } from '../authoring/content-places.js';
import { GENERATION_PROMPT, generationPrompt } from '../graphics/sprite-generation.js';
import { readSpriteRecipe, SPRITE_SOURCES_DIRECTORY } from '../graphics/sprite-import.js';
import type { GenerationPicture } from './sprite-generation-export.js';
import type { SpriteImporter } from './sprite-importer.js';
import type { UsedPicture } from './sprite-pictures.js';

/** The browser's memory of the prompt template and of K's note for each original picture. */
const TEMPLATE = 'superoutride.sprite-editor.prompt';
const NOTE = 'superoutride.sprite-editor.note.';

/**
 * Generation input of original and product pictures, named from each one's original: `<name>-input.png` (picture 3
 * enlarged by nearest neighbour to about 1024 px, transparent), `<name>-guide.png` (the input with the ground row, the
 * base point and the collision lines) and `<name>-prompt.txt` (the prompt template and K's note). One picture or every
 * one the course uses goes out as a zip, made off the page's thread (`generationZip`) from the files' bytes. The
 * template is K's to edit and the browser keeps it, with each note.
 */
export function createExport(
  context: EditorContext,
  importInWorker: SpriteImporter,
  all: () => readonly UsedPicture[],
) {
  const template = make('textarea', '', { rows: '4', cols: '100', class: 'prompt-template' });
  template.value = stored(TEMPLATE) ?? GENERATION_PROMPT;
  const reset = make('button', 'Default prompt', { type: 'button' });
  const note = make('input', '', { size: '60', placeholder: "K's note for this picture" });
  const one = make('button', 'Export picture', { type: 'button' });
  const every = make('button', 'Export all', { type: 'button' });
  const status = make('span', '', { role: 'status', class: 'hint' });
  const element = make('details', '', { class: 'export' });
  const label = make('label', 'Note ');
  label.append(note);
  element.append(
    make('summary', 'Generation input'),
    template,
    make('br'),
    reset,
    ' ',
    label,
    ' ',
    one,
    ' ',
    every,
    ' ',
    status,
  );
  let picture: UsedPicture | null = null;

  template.addEventListener('change', () => keep(TEMPLATE, template.value));
  reset.addEventListener('click', () => {
    template.value = GENERATION_PROMPT;
    keep(TEMPLATE, null);
  });
  note.addEventListener('change', () => picture?.original && keep(NOTE + picture.original, note.value || null));

  /** What the worker makes one picture's files of, or null when it has no picture 3 (a general one, or no image). */
  const input = async (chosen: UsedPicture): Promise<GenerationPicture | null> => {
    const paths = context.paths();
    const imagePath = imagePathIn(paths, chosen.name);
    const name = chosen.original;
    if (!name || chosen.kind === 'general' || !paths.includes(imagePath)) return null;
    const read = (path: string) => context.store.read(path);
    let recipe: Uint8Array<ArrayBuffer> | null = null,
      originals: Uint8Array<ArrayBuffer>[] = [];
    if (chosen.kind === 'product') {
      if (!chosen.source) return null;
      recipe = await read(`${SPRITE_SOURCES_DIRECTORY}/${chosen.source}.json`);
      const pieces = readSpriteRecipe(JSON.parse(new TextDecoder().decode(recipe))).basedOn ?? [];
      originals = await Promise.all(pieces.map((piece) => read(imagePathIn(paths, piece.image))));
    }
    return {
      original: name,
      image: await read(imagePath),
      recipe,
      originals,
      widths: chosen.widths,
      prompt: generationPrompt(template.value, stored(NOTE + name) ?? ''),
    };
  };
  const exportZip = async (chosen: readonly UsedPicture[], name: string) => {
    const pictures = (await Promise.all(chosen.map(input))).filter((picture) => picture !== null);
    const { zip, files } = await importInWorker.generation(pictures);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
    return { files, pictures: pictures.length };
  };
  const exporting = (work: () => Promise<string>) =>
    work()
      .then((said) => void (status.textContent = said))
      .catch((error: Error) => void (status.textContent = `Not exported: ${error.message}`));
  one.addEventListener('click', () => {
    const chosen = picture;
    if (!chosen?.original) return;
    status.textContent = `Exporting ${chosen.original}…`;
    void exporting(async () => {
      const { files } = await exportZip([chosen], `${chosen.original}-generation.zip`);
      return `Exported ${files} files of ${chosen.original}.`;
    });
  });
  every.addEventListener('click', () => {
    const chosen = all().filter((entry) => entry.kind !== 'general');
    status.textContent = `Exporting ${chosen.length} pictures…`;
    void exporting(async () => {
      const { files } = await exportZip(chosen, 'generation-input.zip');
      return `Exported ${files} files of ${chosen.length} pictures.`;
    });
  });

  return {
    element,
    /** Offer the export of `chosen`, an original or product picture, or of none. */
    show(chosen: UsedPicture | null) {
      picture = chosen?.kind === 'general' ? null : chosen;
      one.disabled = note.disabled = !picture?.original;
      if (document.activeElement !== note)
        note.value = picture?.original ? (stored(NOTE + picture.original) ?? '') : '';
    },
  };
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Keep a value in the browser, or forget it with null; without the browser's storage it lasts the page. */
function keep(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Kept for this page only.
  }
}
