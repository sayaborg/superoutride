import { parentPort, workerData } from 'node:worker_threads';
import { compileContent } from '../authoring/compile-content.js';
import { runMeasureJob, type MeasureJob, type MeasureResult } from '../authoring/measure.js';
import { createNodeContentStore } from '../build/node-content-store.js';
import { requireCompiled } from './authoring-io.js';

/** The measurement tool's worker: one job on the content compiled through the authoring core. */
const content = requireCompiled(await compileContent(createNodeContentStore(), { measured: false }));
parentPort!.postMessage(runMeasureJob(content, workerData as MeasureJob) satisfies MeasureResult);
