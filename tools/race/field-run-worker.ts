import { parentPort, workerData } from 'node:worker_threads';
import { runField, type FieldRunJob } from './field-run.js';

/** The field runs' worker: one course's run. */
parentPort!.postMessage(await runField(workerData as FieldRunJob));
