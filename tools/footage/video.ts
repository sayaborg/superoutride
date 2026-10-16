import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** What ffprobe reports of a video's first video stream, and every frame's timestamp. */
export interface VideoProbe {
  readonly width: number;
  readonly height: number;
  /** The stream's pixel format, which decoding keeps (YUV 4:2:0 for footage). */
  readonly pixelFormat: string;
  /** Each frame's timestamp, seconds, in decoding order. */
  readonly times: readonly number[];
  /** The stream's own color tags, which capture never trusts: it measures range and matrix. */
  readonly tags: { readonly range: string | null; readonly matrix: string | null };
}

export async function probeVideo(file: string): Promise<VideoProbe> {
  const { stdout } = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,pix_fmt,color_range,color_space',
      '-of',
      'json',
      file,
    ],
    { maxBuffer: 1 << 20 },
  );
  const stream = (JSON.parse(stdout) as { streams: Record<string, unknown>[] }).streams[0];
  if (!stream) throw new RangeError(`${file} has no video stream`);
  const frames = await run(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file],
    { maxBuffer: 1 << 28 },
  );
  const times = frames.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseFloat(line));
  return {
    width: stream.width as number,
    height: stream.height as number,
    pixelFormat: stream.pix_fmt as string,
    times,
    tags: {
      range: (stream.color_range as string | undefined) ?? null,
      matrix: (stream.color_space as string | undefined) ?? null,
    },
  };
}

/** One decoded frame's planes as stored: Y at full size, U and V at half size in each direction (4:2:0). */
export interface YuvFrame {
  readonly index: number;
  readonly y: Uint8Array;
  readonly u: Uint8Array;
  readonly v: Uint8Array;
}

/** The 8-bit 4:2:0 formats footage comes in: `yuvj420p` is the same planes, tagged full range. */
export const YUV420_FORMATS = Object.freeze(['yuv420p', 'yuvj420p'] as const);

/**
 * Decode every frame (or every `step`th) as raw 8-bit YUV 4:2:0 in the video's own format (`pixelFormat`), without any
 * conversion, so that range and matrix are chosen by measurement, and hand each to `each` in order. Resolves when the
 * video ends.
 */
export async function decodeYuv(
  file: string,
  width: number,
  height: number,
  pixelFormat: (typeof YUV420_FORMATS)[number],
  each: (frame: YuvFrame) => void | Promise<void>,
  step = 1,
): Promise<number> {
  if (width % 2 || height % 2) throw new RangeError('4:2:0 footage has even dimensions');
  const ySize = width * height,
    cSize = ySize / 4,
    frameSize = ySize + 2 * cSize;
  const args = ['-v', 'error', '-i', file];
  if (step > 1) args.push('-vf', `select=not(mod(n\\,${step}))`, '-fps_mode', 'passthrough');
  args.push('-f', 'rawvideo', '-pix_fmt', pixelFormat, '-');
  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  let buffer: Buffer = Buffer.alloc(0),
    index = 0;
  const failed = new Promise<never>((_, reject) => child.on('error', reject));
  const closed = new Promise<number | null>((resolve) => child.on('close', resolve));
  for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    while (buffer.length >= frameSize) {
      const frame = buffer.subarray(0, frameSize);
      await each({
        index: index * step,
        y: new Uint8Array(frame.subarray(0, ySize)),
        u: new Uint8Array(frame.subarray(ySize, ySize + cSize)),
        v: new Uint8Array(frame.subarray(ySize + cSize, frameSize)),
      });
      index++;
      buffer = buffer.subarray(frameSize);
    }
  }
  const code = await Promise.race([closed, failed]);
  if (code !== 0) throw new Error(`ffmpeg exited with ${code} decoding ${file}`);
  return index;
}
