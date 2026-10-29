import { startEditorPage } from '../browser-shared/editor-frame.js';
import { spriteModule } from './sprite-module.js';

/** The sprite editor page: the editing frame with the Sprites module alone. */
await startEditorPage('Sprite editor', [spriteModule]);
