/**
 * The fake original: what the footage tool's fake footage draws, from which camera, along which trajectories, and how
 * each video is captured ([Courses from footage](../../docs/footage.md#fake-footage-and-the-round-trip-test)). Every
 * value here is the truth the round trip must recover, chosen unlike the product's own so that nothing can pass by
 * assuming the product.
 */

/** The fake original's frame and camera: unlike the product's 320×240, f 240, h 2, x₀ 160, y₀ 120, D 6 and a = f. */
export const FAKE_CAMERA = Object.freeze({
  /** The game pixel frame: the top 224 rows of the logical frame. */
  frame: Object.freeze({ width: 320, height: 224 }),
  focalLength: 200,
  height: 1.6,
  centerX: 156,
  horizonRow: 98,
  /** The background scroll, px/rad, unlike the focal length. */
  backgroundScroll: 150,
  /**
   * From the camera to the player along the road, m: to the road under the player picture's lowest row, where an
   * original's player stands and its timing happens. The picture's own base point (the footprint's centre) stands
   * farther, by as much as the picture reaches below it.
   */
  playerDistance: 4,
  /** The pitch rule: the camera pitches with the road's chord from the camera to the player. */
  pitch: 'road',
} as const);

/** The truth course: OUTRUN TEST's stages in this order, chained through each stage's left exit lane. */
export const FAKE_STAGES = Object.freeze(['coastline', 'cliff-road', 'farmland', 'interchange'] as const);
/** The truth course's id: its file name stem under the fake original's directory. */
export const FAKE_COURSE = 'outrun-test-route';
/** The fake original's id: footage of it lives under `reference-media/fake/`. */
export const FAKE_GAME = 'fake';

/** The player's vehicle (the gauge) and the traffic's. */
export const FAKE_PLAYER = 'TESTAROSSA';
export const FAKE_TRAFFIC = Object.freeze(['GOLF_GTI_16V', 'DELTA_HF_INTEGRALE', '911_TURBO_3_3'] as const);

/** The driving every trajectory shares: limits that keep a car on a road of these stages, not physics. */
export const FAKE_DRIVING = Object.freeze({
  /** Top speed, m/s (288 km/h). */
  topSpeed: 80,
  /** The lateral acceleration curves are taken at, m/s². */
  lateralAcceleration: 8.5,
  acceleration: 3.5,
  braking: 7,
  /** Seconds on the grid before GO, at rest. */
  countdown: 3,
  /** After the goal the car slows to this speed, m/s, and the video ends this far before the course's end, m. */
  runoutSpeed: 30,
  runoutEnd: 60,
  /** Traffic: vehicles per kilometre and their speed range, m/s. */
  trafficPerKilometer: 2.2,
  trafficSpeed: Object.freeze([27, 36] as const),
});

/** One video of the fake original: its trajectory's seed and how it was captured. */
export interface FakeVideo {
  readonly id: string;
  readonly seed: number;
  /** The video's frame rate; the original updates at 60 Hz, so a 30 fps video keeps every other frame. */
  readonly fps: 60 | 30;
  /** Each game pixel becomes `scale` × `scale` video pixels by nearest neighbour. */
  readonly scale: number;
  /** The video's size and the scaled frame's top-left corner in it; the rest is black margin. */
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  /** H.264 constant rate factor: about a video site's compression. */
  readonly crf: number;
  /** How RGB became YUV: the range and matrix the ingest must find. */
  readonly range: 'limited' | 'full';
  readonly matrix: 'bt601' | 'bt709';
  /** A corrupted version: rows moved over hills, or the player laid over at a fixed size. */
  readonly corruption: 'hills' | 'player' | null;
}

export const FAKE_VIDEOS: readonly FakeVideo[] = Object.freeze([
  {
    id: 'a',
    seed: 1,
    fps: 60,
    scale: 3,
    width: 1280,
    height: 720,
    left: 160,
    top: 24,
    crf: 23,
    range: 'limited',
    matrix: 'bt709',
    corruption: null,
  },
  {
    id: 'b',
    seed: 2,
    fps: 60,
    scale: 2,
    width: 854,
    height: 480,
    left: 107,
    top: 16,
    crf: 27,
    range: 'limited',
    matrix: 'bt601',
    corruption: null,
  },
  {
    id: 'c',
    seed: 3,
    fps: 30,
    scale: 4,
    width: 1440,
    height: 1080,
    left: 80,
    top: 92,
    crf: 25,
    range: 'full',
    matrix: 'bt709',
    corruption: null,
  },
  {
    id: 'hills',
    seed: 4,
    fps: 60,
    scale: 3,
    width: 1280,
    height: 720,
    left: 160,
    top: 24,
    crf: 23,
    range: 'limited',
    matrix: 'bt709',
    corruption: 'hills',
  },
  {
    id: 'player',
    seed: 5,
    fps: 60,
    scale: 3,
    width: 1280,
    height: 720,
    left: 160,
    top: 24,
    crf: 23,
    range: 'limited',
    matrix: 'bt709',
    corruption: 'player',
  },
]);

/** The corrupted versions' amounts: rows below the horizon moved, and the player's fixed size against the road's. */
export const FAKE_CORRUPTION = Object.freeze({
  /** Rows below the horizon move down by up to this many game pixels while the camera passes a vertical curve. */
  hillRows: 10,
  /** The player's picture drawn this many times the road's scale at its depth, at one fixed size. */
  playerScale: 1.3,
});
