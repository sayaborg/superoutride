import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {BROWSER_TIRE_AXES,DEFAULT_BROWSER_TIRE_CHARACTERISTICS} from '../dist/browser/tire-friction-selection.js';
import {compileTireCharacteristics} from '../dist/physics/tire-friction-calibration.js';
test('tire calibration exposes the ellipse axes with no hidden exponent',async()=>{
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
