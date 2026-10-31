import type { EditorContext, EditorModule } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { createBakeView } from './sprite-bake-view.js';
import { createComparison, type OpenSource } from './sprite-comparison.js';
import { createExport } from './sprite-export.js';
import { createSpriteImporter } from './sprite-importer.js';
import { createPaletteSheet } from './sprite-palette-sheet.js';
import { createPictureList } from './sprite-picture-list.js';
import { createPictureLooks } from './sprite-picture-looks.js';
import { createPngImport } from './sprite-png-import.js';
import type { UsedPicture } from './sprite-pictures.js';
import { createRoadPreview } from './sprite-preview.js';
import { createProductControls } from './sprite-product-controls.js';
import { mountSourceView } from './sprite-source-view.js';

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * The sprite module: the chosen product course's pictures and the other sprite sources beside an original or product
 * picture's comparison, controls, generation input, road preview and palettes, baking, and the import, where a
 * source PNG and its recipe make a course image master. Every edit goes through the sprite operations and is one step
 * of the page's history.
 */
export const spriteModule: EditorModule = {
  id: 'sprites',
  title: 'Sprites',
  mount(element: HTMLElement, context: EditorContext) {
    const side = make('div'),
      main = make('div', '', { class: 'sprite-main', tabindex: '-1' }),
      note = make('p', '', { role: 'status', class: 'hint' });
    // Imports run in a worker, shared by the import screen, the controls and the palettes.
    const importer = createSpriteImporter();
    const controls = createProductControls(
      context,
      importer,
      (name) => void list.chooseUsed(name),
      () => showPicture(shownSource),
    );
    // The list's looks and the comparison's board shadows are worked out off the page's thread.
    const looks = createPictureLooks();
    const comparison = createComparison(
      context,
      (dx, dy) => controls.move(dx, dy),
      (width) => controls.resize(width),
      looks.shadow,
    );
    const road = createRoadPreview();
    const sheet = createPaletteSheet(importer);
    const exporter = createExport(context, () => list.used());
    const pngImport = createPngImport(context, importer, controls);
    const bakeView = createBakeView(
      context,
      importer,
      () => list.course(),
      (name) => void list.chooseUsed(name),
    );
    const views = make('div', '', { class: 'product-views' });
    views.append(road.element, sheet.element);
    element.classList.add('sprite-editor');
    element.append(side, main);
    main.append(
      bakeView.element,
      note,
      comparison.element,
      controls.element,
      pngImport.element,
      exporter.element,
      views,
    );
    // The chosen entry of the course's list (null for another sprite source), the course it was chosen in, and the
    // source the import screen last showed for it.
    let chosen: { readonly picture: UsedPicture; readonly course: string } | null = null,
      shownSource: OpenSource | null = null;
    const showPicture = (source: OpenSource | null) => {
      shownSource = source;
      const palette = controls.palette();
      void comparison.show(chosen?.picture ?? null, source, palette);
      void controls.show(chosen && { ...chosen, source });
      exporter.show(chosen?.picture ?? null);
      pngImport.show(chosen?.picture ?? null, chosen?.course ?? null);
      const product = chosen?.picture.kind === 'product' ? source?.made : null;
      views.hidden = !product;
      if (product)
        road.draw(product.asset, palette && product.master.palettes[palette] ? palette : product.master.defaultPalette);
      void sheet.show(product ? source : null);
    };
    const view = mountSourceView(
      main,
      context,
      importer,
      (name) => void list.choose(name),
      (source) => {
        const picture = chosen?.picture ?? null;
        if (!picture || source?.name === picture.source || (!source && !picture.source)) showPicture(source);
      },
    );
    const list = createPictureList(
      context,
      looks,
      ({ source, picture, course }) => {
        chosen = picture && course ? { picture, course } : null;
        // The source shown was the last picture's; this one's comes when the import screen has read it. Until then the
        // controls take nothing, so no edit reaches the last picture.
        shownSource = null;
        void controls.show(null);
        // An original picture has no source: it opens none.
        note.textContent =
          picture?.kind === 'original'
            ? `${picture.name} is an original picture, which no page edits; the course shows it until it has a product picture.`
            : '';
        void view.open(source);
      },
      // The chosen entry read again (its widths and marks) after an edit.
      (picture) => {
        if (!chosen || chosen.picture.name !== picture.name) return;
        chosen = { ...chosen, picture };
        showPicture(shownSource);
      },
    );
    side.append(list.element);
    // PNGs dropped on a picture of the list go to it; elsewhere on the page, to the picture their names start with.
    element.addEventListener('dragover', (event) => event.preventDefault());
    element.addEventListener('drop', (event) => {
      event.preventDefault();
      const files = [...(event.dataTransfer?.files ?? [])];
      const key = (event.target as HTMLElement).closest<HTMLElement>('li[data-key^="used "]')?.dataset.key;
      const onto = key ? (list.used().find((picture) => `used ${picture.name}` === key) ?? null) : null;
      void pngImport.drop(files, list.used(), list.course(), onto);
    });
    // The arrow keys move the base point or the collision lines one texel, outside a field.
    main.addEventListener('keydown', (event) => {
      const step = ARROWS[event.key];
      if (!step || (event.target as HTMLElement).closest('input, select, textarea')) return;
      event.preventDefault();
      controls.arrow(...step);
    });
  },
};
