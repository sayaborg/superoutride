import assert from 'node:assert/strict';
import { GroundMapHttpSession } from '../../dist/browser/ground-map-http.js';
import { PRODUCT_GROUND_LIMITS } from '../../dist/browser/ground-presentation.js';

const [site, sha] = process.argv.slice(2);
if (!site || !/^[0-9a-f]{40}$/.test(sha ?? ''))
  throw new Error('usage: verify-published-ground.mjs <Pages URL> <commit>');
const root = new URL(site.endsWith('/') ? site : site + '/');
let failure;
for (let attempt = 1; attempt <= 10; attempt++) {
  const headers = new Set();
  const session = new GroundMapHttpSession(
    {
      ...PRODUCT_GROUND_LIMITS,
      buildRoot: new URL(`build/${sha}/`, root).href,
      buildSha: sha,
      payloadEncoding: 'gzip',
    },
    async (url, options) => {
      const response = await fetch(url, options);
      if (url.endsWith('.bin.gz'))
        headers.add(
          JSON.stringify({
            contentType: response.headers.get('content-type'),
            contentEncoding: response.headers.get('content-encoding'),
          }),
        );
      return response;
    },
  );
  try {
    const version = await fetch(new URL(`version.txt?verify=${sha}`, root), {
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(version.status, 200);
    assert.equal((await version.text()).trim(), sha);
    const catalog = await session.catalog();
    assert.equal(Object.keys(catalog).length, 14);
    for (const [id, digest] of Object.entries(catalog)) {
      const asset = await session.open(digest);
      assert.equal(asset.manifest.identity.sourceId, id);
      const samples = [
        { s: 0, deltaSEffective: asset.manifest.layout.qSAuthority },
        { s: asset.manifest.layout.courseLength, deltaSEffective: 100 },
      ];
      const frame = await session.acquire(asset, asset.rowDemand(samples));
      try {
        for (const sample of samples) frame.reader.sample(sample.s, 0, sample.deltaSEffective);
      } finally {
        frame.release();
      }
    }
    console.log(
      JSON.stringify({
        publishedCommit: sha,
        sources: Object.keys(catalog).length,
        payloadHeaders: [...headers].map((value) => JSON.parse(value)),
        verified: true,
      }),
    );
    failure = null;
    break;
  } catch (error) {
    failure = error;
    console.log(`Published GroundMap attempt ${attempt}: ${error.message}`);
    if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 5000));
  } finally {
    session.dispose();
  }
}
if (failure) throw failure;
