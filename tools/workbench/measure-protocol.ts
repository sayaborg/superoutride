import type { MeasureJob, MeasureResult } from '../authoring/measure.js';

type StoreChanges = readonly (readonly [string, Uint8Array<ArrayBuffer> | null])[];

/** To the coordinator: plan the store's measurement, and with `run` measure it. */
export interface MeasureRequest {
  readonly role: 'coordinator';
  readonly root: string;
  readonly changes: StoreChanges;
  readonly everything: boolean;
  readonly run: boolean;
  /** Workers to measure on at once. */
  readonly workers: number;
}

/** To a job worker: one vehicle's job on the same store. */
export interface JobRequest {
  readonly role: 'job';
  readonly root: string;
  readonly changes: StoreChanges;
  readonly job: MeasureJob;
}

export type JobMessage =
  | { readonly type: 'progress'; readonly phase: string }
  | { readonly type: 'result'; readonly result: MeasureResult }
  | { readonly type: 'error'; readonly message: string };

/** From the coordinator. */
export type MeasureMessage =
  | {
      readonly type: 'plan';
      /** Each job: its vehicle, whether its envelope is measured, and its courses. */
      readonly jobs: readonly {
        readonly vehicle: string;
        readonly envelope: boolean;
        readonly courses: readonly string[];
      }[];
      readonly extra: readonly string[];
    }
  | { readonly type: 'progress'; readonly vehicle: string; readonly phase: string; readonly done: number }
  | {
      readonly type: 'done';
      readonly seconds: number;
      /** The files to save: new texts, and null for saved products no one owns. */
      readonly files: readonly (readonly [string, string | null])[];
      readonly report: readonly unknown[];
    }
  | { readonly type: 'error'; readonly message: string };
