import type { EditorModule } from '../browser-shared/editor-context.js';
import { createDocumentsModule } from './documents-module.js';
import { changesModule } from './changes-module.js';
import { measureModule } from './measure-module.js';
import { runModule } from './run-module.js';
import { musicModule } from './music-module.js';
import { courseModule } from '../course-editor/course-module.js';

/** The workbench's modules, in tab order: the one place a module is added. */
export const WORKBENCH_MODULES: readonly EditorModule[] = Object.freeze([
  createDocumentsModule(),
  changesModule,
  measureModule,
  runModule,
  musicModule,
  courseModule,
]);
