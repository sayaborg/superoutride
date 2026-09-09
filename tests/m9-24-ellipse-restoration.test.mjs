import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BROWSER_TIRE_AXES,DEFAULT_BROWSER_TIRE_CHARACTERISTICS} from '../dist/browser/tire-friction-selection.js';
import {compileTireCharacteristics} from '../dist/physics/tire-friction-calibration.js';
// M9.25 supersedes selector/style/tool hashes; retained tire mechanics remain exact.
// Original blobs from d5fc817f3be6301a0328d8621e8c1197bfe035c3, not hashes of a retuned candidate.
const restored={
  "src/physics/tire-wheel.ts": "08761ed81ec3a16be22eee46e0f88254a64251a7c5a48107d945ad661d8f6a23",
  "src/physics/tire-friction-calibration.ts": "3ecd6b1122d83008730ba6dfd44d52878a7060aae4cff91cee3fe31eb119c10a",
  "src/browser/tire-friction-controls.ts": "96dc25ab534bd65a74a8710e1d6c66c590737e4f34b90ab26c0d397dea1eab7e",
  "src/browser/mobile-selector-controls.ts": "27e5cfba3eaea6f8cbeb51ebf3abd8f7c78c5f088165eb1f9aa0f72d5eedd1c7",
  "src/vehicle/production-vehicle-profiles.ts": "4e230e329b9d0884e86d6017cb14a5b13f30dd948fe9302bb540455fa0eeb438",
  "src/physics/torque-protection.ts": "410e83761e08461d220d1b86fc91d205cea6b059f8fa73b7285ac92416bfb04e",
  "src/physics/vehicle-wrench.ts": "1094c5c58efe7a6b255d50816a7dfb1b06749842e54f80853ed8bbcefd38507b",
};
test('M9.24 restores exact pre-LP tire, selectors, profiles, protection and diagnostics',async()=>{
 for(const [path,expected] of Object.entries(restored)){
  const bytes=await readFile(new URL('../'+path,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,path);
 }
});
test('M9.24 removes LP rather than retaining a hidden exponent or key',async()=>{
 assert.deepEqual(BROWSER_TIRE_AXES.map(a=>a.id),['GX','PX','GY','PY','KNEE']);
 assert.ok(BROWSER_TIRE_AXES.every(a=>a.code!=='KeyB'));
 assert.deepEqual(Object.keys(compileTireCharacteristics(DEFAULT_BROWSER_TIRE_CHARACTERISTICS)).sort(),['kX','kY','muX','muY','rhoKnee']);
 async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){
  const path=new URL(e.name+(e.isDirectory()?'/':''),dir);
  if(e.isDirectory())await scan(path);
  else if(e.name.endsWith('.ts')||e.name.endsWith('.mjs'))assert.doesNotMatch(await readFile(path,'utf8'),/combinedSlipExponent|combinedSlipNorm/,path.pathname);
 }}
 await scan(new URL('../src/',import.meta.url));await scan(new URL('../tools/',import.meta.url));
});
