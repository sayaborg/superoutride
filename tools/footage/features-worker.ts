import { parentPort, workerData } from 'node:worker_threads';
import { measureFrames, type FeatureJob } from './features.js';

/** The feature measurement's worker: one contiguous chunk of frames, its lines posted back in order. */
parentPort!.postMessage(await measureFrames(workerData as FeatureJob));
