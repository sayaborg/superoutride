import { PNG } from 'pngjs';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { writeZip, type ZipEntry } from '../browser-shared/zip.js';
import { GENERATION_PROMPT, generationInput, generationPrompt } from '../graphics/sprite-generation.js';
import { encodeSpritePng } from '../graphics/sprite-png.js';
import { placedPicture, type UsedPicture } from './sprite-pictures.js';

/** The browser's memory of the prompt template and of K's note for each original picture. */
const TEMPLATE = 'superoutride.sprite-editor.prompt';
const NOTE = 'superoutride.sprite-editor.note.';

/**
 * Generation input of original and product pictures, named from each one's original: `<name>-input.png` (picture 3
 * enlarged by nearest neighbour to about 1024 px, transparent), `<name>-guide.png` (the input with the ground row, the
 * base point and the collision lines) and `<name>-prompt.txt` (the prompt template and K's note). One picture or every
 * one the course uses goes out as a zip. The template is K's to edit and the browser keeps it, with each note.
 */
export function createExport(context: EditorContext, all: () => readonly UsedPicture[]) {
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

  /** The three files of one picture, or none when it has no picture 3. */
  const files = async (chosen: UsedPicture): Promise<ZipEntry[]> => {
    const placed = await placedPicture(context, chosen);
    if (!placed || !chosen.original) return [];
    const { input, guide } = generationInput(placed.frame, placed.colors, chosen.widths);
    const name = chosen.original;
    return [
      { name: `${name}-input.png`, bytes: encodeSpritePng(input, PNG) },
      { name: `${name}-guide.png`, bytes: encodeSpritePng(guide, PNG) },
      {
        name: `${name}-prompt.txt`,
        bytes: new TextEncoder().encode(generationPrompt(template.value, stored(NOTE + name) ?? '')),
      },
    ];
  };
  const save = (entries: readonly ZipEntry[], name: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([writeZip(entries)], { type: 'application/zip' }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  one.addEventListener('click', async () => {
    if (!picture?.original) return;
    const entries = await files(picture);
    save(entries, `${picture.original}-generation.zip`);
    status.textContent = `Exported ${entries.length} files of ${picture.original}.`;
  });
  every.addEventListener('click', async () => {
    const chosen = all().filter((entry) => entry.kind !== 'general');
    const entries: ZipEntry[] = [];
    for (const [i, entry] of chosen.entries()) {
      status.textContent = `Exporting ${i + 1} of ${chosen.length}…`;
      entries.push(...(await files(entry)));
    }
    save(entries, 'generation-input.zip');
    status.textContent = `Exported ${entries.length} files of ${chosen.length} pictures.`;
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
