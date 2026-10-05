import type { WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { mountPaletteView } from './sprite-palette-view.js';
import { mountSetView } from './sprite-set-view.js';
import { mountSourceView, type ImportedMaster } from './sprite-source-view.js';
import { make } from './dom.js';

/**
 * The sprite module: import (a source PNG and its recipe make a master), vehicle sprite sets (the yaw × bank grid
 * and its preview) and their named palettes. Every edit goes through the sprite operations and is one step of the
 * workbench's history.
 */
export const spriteModule: WorkbenchModule = {
  id: 'sprites',
  title: 'Sprites',
  mount(element: HTMLElement, context: WorkbenchContext) {
    const importPane = make('section'),
      setPane = make('section'),
      palettePane = make('section');
    element.append(importPane, setPane, palettePane);
    let imported: ImportedMaster | null = null;
    // The palette view follows the open set, shown after it.
    let palettes: { show(): void } | null = null;
    const sets = mountSetView(
      setPane,
      context,
      () => imported,
      () => palettes?.show(),
    );
    palettes = mountPaletteView(palettePane, context, () => sets.current());
    mountSourceView(
      importPane,
      context,
      (master) => (imported = master),
      () => sets.lamp(),
    );
  },
};
