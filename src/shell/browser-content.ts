import { loadContentManifest, type ContentDelivery } from '../core/content-manifest.js';
let delivery: Promise<ContentDelivery> | undefined;
export function browserContent() {
  return (delivery ??= loadContentManifest(new URL('../content/', import.meta.url)));
}
