import { AdmissionError } from '../core/admission.js';

/** What a recording's container states: its playable duration, sample rate and channel count. */
export interface Mp4AudioFacts {
  readonly durationSeconds: number;
  readonly sampleRate: number;
  readonly channels: number;
}

interface Box {
  readonly type: string;
  /** Content start and end, after the header. */
  readonly start: number;
  readonly end: number;
}

const fail = (message: string): never => {
  throw new AdmissionError('unsupported_format', '', message);
};

/** The boxes between `start` and `end`; a box that overruns its parent is malformed. */
function readBoxes(view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  for (let at = start; at < end;) {
    if (at + 8 > end) fail('Malformed MP4 box header');
    let size = view.getUint32(at);
    const type = String.fromCharCode(
      view.getUint8(at + 4),
      view.getUint8(at + 5),
      view.getUint8(at + 6),
      view.getUint8(at + 7),
    );
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) fail('Malformed MP4 box header');
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) size = end - at;
    if (size < header || at + size > end) fail(`Malformed MP4 box ${type}`);
    boxes.push({ type, start: at + header, end: at + size });
    at += size;
  }
  return boxes;
}

const only = (boxes: readonly Box[], type: string): Box => {
  const found = boxes.filter((box) => box.type === type);
  if (found.length !== 1) fail(`Expected one MP4 ${type} box`);
  return found[0]!;
};

/** A full box's timescale and duration (mvhd, mdhd): version 0 has 32-bit times, version 1 64-bit. */
function readTimes(view: DataView, box: Box): { timescale: number; duration: number } {
  const version = view.getUint8(box.start);
  const at = box.start + 4 + (version === 1 ? 16 : 8);
  const timescale = view.getUint32(at);
  const duration = version === 1 ? Number(view.getBigUint64(at + 4)) : view.getUint32(at + 4);
  if (timescale === 0) fail('MP4 timescale is zero');
  return { timescale, duration };
}

/** An MPEG-4 descriptor's tag, content start and end (lengths use 7 bits per byte). */
function readDescriptor(view: DataView, at: number, end: number): { tag: number; start: number; end: number } {
  if (at >= end) fail('Malformed MP4 descriptor');
  const tag = view.getUint8(at);
  let length = 0,
    cursor = at + 1;
  for (let i = 0; i < 4; i += 1) {
    if (cursor >= end) fail('Malformed MP4 descriptor');
    const byte = view.getUint8(cursor++);
    length = (length << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) break;
  }
  if (cursor + length > end) fail('Malformed MP4 descriptor');
  return { tag, start: cursor, end: cursor + length };
}

/** The AudioSpecificConfig's audio object type from an `esds` box: 2 is AAC-LC. */
function audioObjectType(view: DataView, esds: Box): number {
  const es = readDescriptor(view, esds.start + 4, esds.end);
  if (es.tag !== 0x03) fail('Expected an MPEG-4 ES descriptor');
  const flags = view.getUint8(es.start + 2);
  let at = es.start + 3;
  if (flags & 0x80) at += 2;
  if (flags & 0x40) at += 1 + view.getUint8(at);
  if (flags & 0x20) at += 2;
  const config = readDescriptor(view, at, es.end);
  if (config.tag !== 0x04) fail('Expected an MPEG-4 decoder configuration');
  if (view.getUint8(config.start) !== 0x40) fail('Expected MPEG-4 audio');
  const specific = readDescriptor(view, config.start + 13, config.end);
  if (specific.tag !== 0x05 || specific.end === specific.start) fail('Expected an AudioSpecificConfig');
  return view.getUint8(specific.start) >> 3;
}

/**
 * Read an MP4 container (`.m4a`) holding exactly one track, an AAC-LC audio track. The duration is the edit list's
 * playable span when the track has one (it excludes the encoder's priming), else the media duration. Any other
 * container or codec is an `unsupported_format` admission error.
 */
export function readMp4Audio(bytes: Uint8Array): Mp4AudioFacts {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(4, 8)) !== 'ftyp') fail('Expected an MP4 container starting with ftyp');
  const top = readBoxes(view, 0, bytes.byteLength);
  const moov = readBoxes(view, only(top, 'moov').start, only(top, 'moov').end);
  const movie = readTimes(view, only(moov, 'mvhd'));
  const trak = only(moov, 'trak');
  const track = readBoxes(view, trak.start, trak.end);
  const mdia = readBoxes(view, only(track, 'mdia').start, only(track, 'mdia').end);
  const hdlr = only(mdia, 'hdlr');
  if (String.fromCharCode(...bytes.subarray(hdlr.start + 8, hdlr.start + 12)) !== 'soun')
    fail('Expected an audio track');
  const media = readTimes(view, only(mdia, 'mdhd'));
  const minf = readBoxes(view, only(mdia, 'minf').start, only(mdia, 'minf').end);
  const stbl = readBoxes(view, only(minf, 'stbl').start, only(minf, 'stbl').end);
  const stsd = only(stbl, 'stsd');
  if (view.getUint32(stsd.start + 4) !== 1) fail('Expected one audio sample description');
  const entry = only(readBoxes(view, stsd.start + 8, stsd.end), 'mp4a');
  if (view.getUint16(entry.start + 8) !== 0) fail('Expected a version 0 audio sample entry');
  const channels = view.getUint16(entry.start + 16);
  const sampleRate = view.getUint32(entry.start + 24) >>> 16;
  const esds = only(readBoxes(view, entry.start + 28, entry.end), 'esds');
  if (audioObjectType(view, esds) !== 2) fail('Expected AAC-LC audio');
  let durationSeconds = media.duration / media.timescale;
  const edts = track.find((box) => box.type === 'edts');
  if (edts) {
    const elst = only(readBoxes(view, edts.start, edts.end), 'elst');
    const version = view.getUint8(elst.start);
    const count = view.getUint32(elst.start + 4);
    const size = version === 1 ? 20 : 12;
    if (elst.start + 8 + count * size > elst.end) fail('Malformed MP4 edit list');
    let span = 0;
    for (let i = 0; i < count; i += 1) {
      const at = elst.start + 8 + i * size;
      const segment = version === 1 ? Number(view.getBigUint64(at)) : view.getUint32(at);
      const mediaTime = version === 1 ? Number(view.getBigInt64(at + 8)) : view.getInt32(at + 4);
      if (mediaTime !== -1) span += segment;
    }
    durationSeconds = span / movie.timescale;
  }
  if (!(durationSeconds > 0) || channels === 0 || sampleRate === 0) fail('Expected a nonempty audio track');
  return Object.freeze({ durationSeconds, sampleRate, channels });
}
