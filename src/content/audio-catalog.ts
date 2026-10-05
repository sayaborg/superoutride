import type { AdmissionResult } from '../core/admission.js';
import { compileAudioDocument, type CompiledAudioSettings } from '../audio/audio-document.js';
import type { ContentDelivery } from './content-delivery.js';
import { requireLoaded } from './content-load-error.js';
import { admitSingleDocument, type DocumentSource } from './document-catalog.js';

/** The single audio document's identifier: its file name and manifest ID. */
export const AUDIO_SETTINGS_ID = 'default';

/** Admit the game-wide sound settings, from the build's file or delivery's manifest alike: one document, `default`. */
export function compileAudioSettings(sources: readonly DocumentSource[]): AdmissionResult<CompiledAudioSettings> {
  const single = admitSingleDocument(sources, AUDIO_SETTINGS_ID, 'audio document');
  if (!single.ok) return single;
  return compileAudioDocument(single.value.value, single.value.path, single.value.sha256);
}

/** Transport verifies the saved bytes before admission; each composition loads the settings once. */
export async function loadAudioSettings(content: ContentDelivery): Promise<CompiledAudioSettings> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'audio'))
    sources.push({ id: file.id, path: file.path, value: await content.json('audio', file.id), sha256: file.sha256 });
  return requireLoaded(compileAudioSettings(sources));
}
