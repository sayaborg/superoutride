/** Caller-owned output storage. Published value/reader contracts remain readonly. */
export type Writable<T> = { -readonly [K in keyof T]: T[K] };
