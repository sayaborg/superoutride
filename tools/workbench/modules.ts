import type { WorkbenchModule } from './workbench-context.js';
import { changesModule } from './changes-module.js';

/** The workbench's modules, in tab order: the one place a module is added. */
export const WORKBENCH_MODULES: readonly WorkbenchModule[] = Object.freeze([changesModule]);
