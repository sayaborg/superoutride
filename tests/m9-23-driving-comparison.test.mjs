import assert from 'node:assert/strict';
import test from 'node:test';
import {SCENARIOS,EXPONENTS,replay} from '../tools/combined-slip-probe.mjs';
for(const scenario of SCENARIOS.slice(0,2))test(`M9.23 ${scenario.name} trajectory and telemetry are exactly p-invariant`,()=>{
 const base=replay(scenario,2);
 for(const p of EXPONENTS.slice(1))assert.deepEqual({...replay(scenario,p,{inputs:base.inputs}),p:2},base);
});
test('M9.23 protected combined-input replay holds the captured requests fixed while LP changes the response',()=>{
 const s=SCENARIOS.find(s=>s.name==='power-on-corner'),base=replay(s,2),expanded=replay(s,4,{inputs:base.inputs});
 assert.equal(base.error,null);assert.equal(expanded.error,null);
 assert.deepEqual(expanded.inputs,base.inputs);
 assert.notEqual(expanded.finalX,base.finalX);assert.notEqual(expanded.exitSpeed,base.exitSpeed);
 assert.ok(expanded.rows.every(r=>[r.frontBrakeTorque,r.rearBrakeTorque,r.lateralAcceleration,r.frontRho,r.rearRho].every(Number.isFinite)));
 assert.deepEqual(replay(s,4,{inputs:base.inputs}),expanded);
});
