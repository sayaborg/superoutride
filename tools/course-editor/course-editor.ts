import { startEditorPage } from '../browser-shared/editor-frame.js';
import { courseModule } from './course-module.js';

/** The course editor page: the editing frame with the Course module alone. */
await startEditorPage('Course editor', [courseModule]);
