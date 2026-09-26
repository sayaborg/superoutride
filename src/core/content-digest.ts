/** SHA-256 without an extra caller-side copy. Web Crypto owns its validation workspace. */
export async function contentDigest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/** The text form of a content digest, as admitted from documents and generated products. */
export const SHA256_TEXT = Object.freeze({ pattern: /^[a-f0-9]{64}$/, patternMessage: 'Expected lowercase SHA-256' });
