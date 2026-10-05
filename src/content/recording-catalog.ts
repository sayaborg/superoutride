import { AdmissionError, admit, type AdmissionResult } from '../core/admission.js';
import { compileMusicDocument, type MusicTrack } from '../audio/music-document.js';
import {
  EFFECT_RECORDINGS,
  IMPACT_RECORDINGS,
  RECORDING_GROUPS,
  recordingId,
  type RecordingGroup,
} from '../audio/recordings.js';
import type { ContentDelivery } from './content-manifest.js';
import { requireLoaded } from './content-load-error.js';
import type { DocumentSource } from './document-catalog.js';
import { readMp4Audio, type Mp4AudioFacts } from './mp4-audio.js';

/** One authored recording file: its manifest ID (`<group>/<name>`), path and exact bytes, delivered unchanged. */
export interface RecordingSource {
  readonly id: string;
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** An admitted recording: its authored path and what its container states. */
export interface AdmittedRecording extends Mp4AudioFacts {
  readonly path: string;
}

/** Admitted recordings by manifest ID. */
export type RecordingCatalog = ReadonlyMap<string, AdmittedRecording>;

/** The admitted tracks in selection order. */
export type MusicCatalog = readonly MusicTrack[];

/** The names each fixed group requires, exactly. */
const REQUIRED: Readonly<Partial<Record<RecordingGroup, readonly string[]>>> = Object.freeze({
  effects: EFFECT_RECORDINGS,
  impacts: IMPACT_RECORDINGS,
});

/**
 * Admit the recordings: every file is an MP4 container with one AAC-LC audio track, and the effect and impact groups
 * hold exactly the names the game plays, with no fallback. Music recordings are matched to their documents by
 * {@link compileMusicCatalog}.
 */
export function compileRecordings(sources: readonly RecordingSource[]): AdmissionResult<RecordingCatalog> {
  const catalog = new Map<string, AdmittedRecording>();
  for (const source of sources) {
    const admitted = admit(source.path, () => {
      const [group, name, ...rest] = source.id.split('/');
      if (!RECORDING_GROUPS.includes(group as RecordingGroup) || !name || rest.length)
        throw new AdmissionError('invalid_value', '', `Not a recording ID: ${source.id}`);
      const required = REQUIRED[group as RecordingGroup];
      if (required && !required.includes(name))
        throw new AdmissionError('unresolved_reference', '', `No ${group} recording is named ${name}`);
      if (!source.path.endsWith('.m4a')) throw new AdmissionError('unsupported_format', '', 'Expected an .m4a file');
      return Object.freeze({ path: source.path, ...readMp4Audio(source.bytes) });
    });
    if (!admitted.ok) return admitted;
    catalog.set(source.id, admitted.value);
  }
  for (const [group, names] of Object.entries(REQUIRED))
    for (const name of names!) {
      const id = recordingId(group as RecordingGroup, name);
      if (!catalog.has(id))
        return admit(`content/${group}/`, () => {
          throw new AdmissionError('unresolved_reference', '', `Missing ${group} recording ${name}`);
        });
    }
  return Object.freeze({ ok: true as const, value: catalog });
}

/**
 * Admit the music documents. Each document compiles alone; then the tracks' selection orders are unique, there is at
 * least one track and each title fits one menu line of `titleColumns`. With `recordings`, each track has its
 * recording, each music recording has its document and each loop ends within its recording.
 */
export function compileMusicCatalog(
  sources: readonly DocumentSource[],
  titleColumns: number,
  recordings?: RecordingCatalog,
): AdmissionResult<MusicCatalog> {
  const tracks: MusicTrack[] = [];
  for (const [id, recording] of recordings ?? []) {
    const [group, name] = id.split('/');
    if (group === 'music' && !sources.some((source) => source.id === name))
      return admit(recording.path, () => {
        throw new AdmissionError('unresolved_reference', '', `No music document for recording ${id}`);
      });
  }
  for (const source of sources) {
    const track = compileMusicDocument(source.value, source.id, source.path, source.sha256);
    if (!track.ok) return track;
    const checked = admit(source.path, () => {
      const { title, selectionOrder, loop } = track.value;
      if (title.length > titleColumns)
        throw new AdmissionError('resource_limit', '/title', `The title exceeds one menu line (${titleColumns})`);
      if (tracks.some((other) => other.selectionOrder === selectionOrder))
        throw new AdmissionError('duplicate_id', '/selectionOrder', `Duplicate selection order ${selectionOrder}`);
      if (recordings) {
        const recording = recordings.get(recordingId('music', source.id));
        if (!recording) throw new AdmissionError('unresolved_reference', '', `No recording music/${source.id}`);
        if (loop.end > recording.durationSeconds)
          throw new AdmissionError(
            'invalid_value',
            '/loop/end',
            `The loop ends after its recording (${recording.durationSeconds} s)`,
          );
      }
      return track.value;
    });
    if (!checked.ok) return checked;
    tracks.push(checked.value);
  }
  return admit(sources[0]?.path ?? 'content/music', () => {
    if (!tracks.length) throw new AdmissionError('invalid_value', '', 'Expected at least one track');
    return Object.freeze(tracks.sort((a, b) => a.selectionOrder - b.selectionOrder));
  });
}

/** The delivered tracks: their documents admitted again, as other delivered documents are. */
export async function loadMusic(content: ContentDelivery, titleColumns: number): Promise<MusicCatalog> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'music'))
    sources.push({ id: file.id, path: file.path, value: await content.json('music', file.id), sha256: file.sha256 });
  return requireLoaded(compileMusicCatalog(sources, titleColumns));
}
