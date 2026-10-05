import type { WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { mountSourceView } from './sprite-source-view.js';
import { make } from './dom.js';

/** Lamp colors the import preview shows a vehicle image with: the provisional coupe's. */
const PREVIEW_LAMP = { off: 12321, on: 32038 } as const;

/**
 * The sprite module: import (a source PNG and its recipe make a master). Every edit goes through the sprite
 * operations and is one step of the workbench's history.
 */
export const spriteModule: WorkbenchModule = {
  id: 'sprites',
  title: 'Sprites',
  mount(element: HTMLElement, context: WorkbenchContext) {
    const importPane = make('section');
    element.append(importPane);
    mountSourceView(
      importPane,
      context,
      () => {},
      () => PREVIEW_LAMP,
    );
  },
};
