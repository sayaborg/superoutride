import type { WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { mountSourceView } from './sprite-source-view.js';

/**
 * The sprite module: import, where a source PNG and its recipe make a course image master. Every edit goes through
 * the sprite operations and is one step of the workbench's history.
 */
export const spriteModule: WorkbenchModule = {
  id: 'sprites',
  title: 'Sprites',
  mount(element: HTMLElement, context: WorkbenchContext) {
    mountSourceView(element, context);
  },
};
