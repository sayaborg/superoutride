import { compileAudioDocument } from '../../src/audio/audio-document.js';
import { createRecordingPlayback, type RecordingPlayback } from '../../src/audio/recording-playback.js';
import { contentDigest } from '../../src/core/content-digest.js';
import type { WorkbenchContext, WorkbenchModule } from './workbench-context.js';
import { make } from './dom.js';

/** Seconds before `loop.end` that listening to the seam starts. */
const SEAM_LEAD_SECONDS = 3;
/** The recording groups, each an authored directory of `.m4a` files. */
const GROUPS = ['music', 'effects', 'impacts'] as const;

interface MusicDocument {
  readonly format: string;
  readonly version: number;
  readonly title: string;
  readonly selectionOrder: number;
  readonly loop: { readonly start: number; readonly end: number };
}

/**
 * The music module: a track's recording played by the product's recording playback, its loop points set by number or
 * on the waveform and heard across the seam, its title and selection order, and recordings added or replaced. Every
 * change is a document replacement or a file's bytes: one edit. Decoding is the browser's (`decodeAudioData`).
 */
export const musicModule: WorkbenchModule = {
  id: 'music',
  title: 'Music',
  mount(element: HTMLElement, context: WorkbenchContext) {
    const track = make('select');
    const title = make('input', '', { size: '32' });
    const order = make('input', '', { type: 'number', step: '1' });
    const start = make('input', '', { type: 'number', step: 'any' });
    const end = make('input', '', { type: 'number', step: 'any' });
    const wave = make('canvas', '', { width: '1000', height: '120', class: 'waveform' });
    const fromStart = make('button', 'Play from the start', { type: 'button' });
    const seam = make('button', `Play the seam (from ${SEAM_LEAD_SECONDS} s before the end)`, { type: 'button' });
    const stop = make('button', 'Stop', { type: 'button' });
    const note = make('p', '', { role: 'status' });
    const group = make('select');
    for (const name of GROUPS) group.append(make('option', name, { value: name }));
    const name = make('input', '', { placeholder: 'name', list: 'recording-names' });
    const names = make('datalist', '', { id: 'recording-names' });
    const file = make('input', '', { type: 'file', accept: '.m4a,audio/mp4' });
    const field = (text: string, control: HTMLElement) => {
      const label = make('label', `${text} `);
      label.append(control);
      return label;
    };
    element.append(
      make('h2', 'Music'),
      field('Track', track),
      make('p'),
      field('Title', title),
      ' ',
      field('Selection order', order),
      make('p'),
      field('Loop start (s)', start),
      ' ',
      field('Loop end (s)', end),
      make('p', 'On the waveform, a click or drag moves the nearer loop point.', { class: 'hint' }),
      wave,
      make('p'),
      fromStart,
      ' ',
      seam,
      ' ',
      stop,
      note,
      make('h2', 'Add or replace a recording'),
      field('Group', group),
      ' ',
      field('Name', name),
      names,
      ' ',
      file,
    );

    let audio: AudioContext | null = null;
    let playback: RecordingPlayback | null = null;
    // The selected track's document as it stands, and its decoded recording.
    let path: string | null = null,
      value: MusicDocument | null = null,
      buffer: AudioBuffer | null = null,
      decoded: string | null = null;
    // A loop point being dragged, shown before it is saved.
    let dragging: { readonly point: 'start' | 'end'; seconds: number } | null = null;

    const halt = () => {
      playback?.stop();
      playback = null;
    };
    const loop = () => ({
      start: dragging?.point === 'start' ? dragging.seconds : value!.loop.start,
      end: dragging?.point === 'end' ? dragging.seconds : value!.loop.end,
    });
    const replace = (next: MusicDocument, label: string) => context.replace(path!, next, label);

    const draw = () => {
      const graphics = wave.getContext('2d')!;
      graphics.fillStyle = '#0b0f14';
      graphics.fillRect(0, 0, wave.width, wave.height);
      if (!buffer || !value) return;
      const samples = buffer.getChannelData(0),
        middle = wave.height / 2;
      graphics.fillStyle = '#6cb6ff';
      const step = samples.length / wave.width;
      for (let x = 0; x < wave.width; x++) {
        let low = 0,
          high = 0;
        for (let i = Math.floor(x * step); i < Math.floor((x + 1) * step); i++) {
          low = Math.min(low, samples[i]!);
          high = Math.max(high, samples[i]!);
        }
        graphics.fillRect(x, middle - high * middle, 1, Math.max(1, (high - low) * middle));
      }
      const { start: from, end: to } = loop();
      const xOf = (seconds: number) => (seconds / buffer!.duration) * wave.width;
      graphics.fillStyle = 'rgba(126, 231, 135, 0.15)';
      graphics.fillRect(xOf(from), 0, xOf(to) - xOf(from), wave.height);
      graphics.fillStyle = '#7ee787';
      graphics.fillRect(xOf(from) - 1, 0, 2, wave.height);
      graphics.fillStyle = '#ff7b72';
      graphics.fillRect(xOf(to) - 1, 0, 2, wave.height);
    };

    // The selected track's document and recording, read again after every change of state.
    const show = async () => {
      const tracks = context
        .paths()
        .filter((p) => p.startsWith('music/') && p.endsWith('.json'))
        .map((p) => p.slice('music/'.length, -'.json'.length));
      if (tracks.join() !== [...track.options].map((option) => option.value).join()) {
        const chosen = track.value;
        track.replaceChildren(...tracks.map((id) => make('option', id, { value: id })));
        if (tracks.includes(chosen)) track.value = chosen;
      }
      names.replaceChildren(
        ...context
          .paths()
          .filter((p) => p.startsWith(`${group.value}/`) && p.endsWith('.m4a'))
          .map((p) => make('option', '', { value: p.slice(group.value.length + 1, -'.m4a'.length) })),
      );
      const id = track.value;
      if (!id) return;
      const documentPath = `music/${id}.json`;
      let next: MusicDocument | null = null;
      try {
        next = JSON.parse(new TextDecoder().decode(await context.store.read(documentPath))) as MusicDocument;
      } catch {
        next = null;
      }
      if (documentPath !== path) halt();
      path = documentPath;
      value = next;
      for (const [input, text] of [
        [title, next?.title],
        [order, next?.selectionOrder],
        [start, next?.loop?.start],
        [end, next?.loop?.end],
      ] as const)
        if (document.activeElement !== input) input.value = text === undefined ? '' : String(text);
      // The recording decodes again only when its path or bytes change.
      const bytes = await context.store.read(`music/${id}.m4a`).catch(() => null);
      const key = bytes && `${id} ${await contentDigest(bytes)}`;
      if (!bytes) {
        buffer = decoded = null;
        note.textContent = `music/${id}.m4a is missing.`;
      } else if (key !== decoded) {
        decoded = key;
        buffer = null;
        note.textContent = 'Decoding…';
        try {
          audio ??= new AudioContext();
          buffer = await audio.decodeAudioData(bytes.slice().buffer);
          note.textContent = `${buffer.duration.toFixed(3)} s, ${buffer.numberOfChannels} channels.`;
        } catch (error) {
          note.textContent = `This browser cannot decode music/${id}.m4a: ${error instanceof Error ? error.message : error}`;
        }
      }
      fromStart.disabled = seam.disabled = !buffer || !value?.loop;
      draw();
    };
    let showing = Promise.resolve();
    const refresh = () => (showing = showing.then(show));
    context.subscribe(() => void refresh());
    track.addEventListener('change', () => void refresh());
    group.addEventListener('change', () => void refresh());
    void refresh();

    // Numbers are saved when confirmed: Enter or leaving the field.
    const confirm = (input: HTMLInputElement, apply: (document: MusicDocument, text: string) => MusicDocument | null) =>
      input.addEventListener('change', () => {
        if (!value) return;
        const next = apply(value, input.value);
        if (next) replace(next, `Edit ${path} ${input.title || input.parentElement?.textContent?.trim() || ''}`);
      });
    const number = (text: string) => (text.trim() === '' || !Number.isFinite(Number(text)) ? null : Number(text));
    confirm(title, (document, text) => ({ ...document, title: text }));
    confirm(order, (document, text) => (number(text) === null ? null : { ...document, selectionOrder: number(text)! }));
    confirm(start, (document, text) =>
      number(text) === null ? null : { ...document, loop: { ...document.loop, start: number(text)! } },
    );
    confirm(end, (document, text) =>
      number(text) === null ? null : { ...document, loop: { ...document.loop, end: number(text)! } },
    );

    // On the waveform, a press moves the nearer loop point, a drag follows it, and the release saves it.
    const secondsAt = (event: PointerEvent) => {
      const box = wave.getBoundingClientRect();
      const seconds = ((event.clientX - box.left) / box.width) * buffer!.duration;
      return Math.round(Math.min(buffer!.duration, Math.max(0, seconds)) * 1000) / 1000;
    };
    wave.addEventListener('pointerdown', (event) => {
      if (!buffer || !value) return;
      const seconds = secondsAt(event);
      const point = Math.abs(seconds - value.loop.start) <= Math.abs(seconds - value.loop.end) ? 'start' : 'end';
      dragging = { point, seconds };
      wave.setPointerCapture(event.pointerId);
      draw();
    });
    wave.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      dragging.seconds = secondsAt(event);
      draw();
    });
    wave.addEventListener('pointerup', () => {
      if (!dragging || !value) return;
      const { point, seconds } = dragging;
      dragging = null;
      replace({ ...value, loop: { ...value.loop, [point]: seconds } }, `Move ${path} loop ${point}`);
    });

    // Listening uses the product's playback with the authored sound settings' timing.
    const play = async (from: number) => {
      halt();
      if (!buffer || !value || !audio) return;
      const bytes = await context.store.read('audio/default.json');
      const settings = compileAudioDocument(
        JSON.parse(new TextDecoder().decode(bytes)),
        'content/audio/default.json',
        await contentDigest(bytes),
      );
      if (!settings.ok) {
        note.textContent = 'The audio document does not admit; fix it to listen.';
        return;
      }
      await audio.resume();
      playback = createRecordingPlayback(audio, audio.destination, buffer, () => settings.value.control, {
        loop: loop(),
        from,
      });
      playback.play();
    };
    fromStart.addEventListener('click', () => void play(0));
    seam.addEventListener('click', () => void play(Math.max(0, loop().end - SEAM_LEAD_SECONDS)));
    stop.addEventListener('click', halt);

    // A chosen file is the recording's new bytes at `<group>/<name>.m4a`: one edit. Admission checks its name and
    // format with the next compile.
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      file.value = '';
      if (!chosen || !name.value.trim()) {
        note.textContent = 'Name the recording before choosing its file.';
        return;
      }
      const target = `${group.value}/${name.value.trim()}.m4a`;
      context.setFile(target, new Uint8Array(await chosen.arrayBuffer()), `Set ${target}`);
      note.textContent = `${target} set from ${chosen.name}.`;
    });
  },
};
