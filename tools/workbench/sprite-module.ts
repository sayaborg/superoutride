import type { WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { mountSetView } from './sprite-set-view.js';
import { mountSourceView, type ImportedMaster } from './sprite-source-view.js';
import { make } from './dom.js';

/**
 * The sprite module: import (a source PNG and its recipe make a master) and vehicle sprite sets (the yaw × bank grid
 * and its preview). Every edit goes through the sprite operations and is one step of the workbench's history.
 */
export const spriteModule: WorkbenchModule = {
  id: 'sprites',
  title: 'Sprites',
  mount(element: HTMLElement, context: WorkbenchContext) {
    const importPane = make('section'),
      setPane = make('section');
    element.append(importPane, setPane);
    let imported: ImportedMaster | null = null;
    const sets = mountSetView(setPane, context, () => imported);
    mountSourceView(
      importPane,
      context,
      (master) => (imported = master),
      () => sets.lamp(),
    );
  },
};
