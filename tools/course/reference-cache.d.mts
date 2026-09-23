export function digest(value: unknown): string;
export function referenceCacheKey(
  courseBuildSha256: string | null,
  vehicleSha256: string,
  driver: unknown,
  physicsSha256: string,
): string;
export function cachedReference<T>(
  kind: string,
  key: string,
  generate: () => T | Promise<T>,
  root?: URL,
): Promise<{ value: T; hit: boolean }>;
