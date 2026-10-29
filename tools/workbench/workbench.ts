import { startEditorPage } from '../browser-shared/editor-frame.js';
import { WORKBENCH_MODULES } from './modules.js';

/** The workbench page: the editing frame with the workbench's modules. */
await startEditorPage('Workbench', WORKBENCH_MODULES);
