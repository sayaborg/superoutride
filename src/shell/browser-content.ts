import { loadContentManifest, type ContentDelivery } from '../content/content-manifest.js';
let delivery: Promise<ContentDelivery> | undefined;
export function browserContent() {
  return (delivery ??= loadContentManifest(new URL('../delivery/', import.meta.url)));
}
