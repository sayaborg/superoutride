import { rm } from 'node:fs/promises';

// `dist` is a complete derived ESM tree. Clean it before rebuilding from source authority so deleted
// modules can never survive as publishable historical artifacts.
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
