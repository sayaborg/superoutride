/** SHA-256 without an extra caller-side copy. Web Crypto's validation workspace is budgeted separately. */
export async function groundMapDigest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
