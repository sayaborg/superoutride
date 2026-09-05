import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createFlatProbe,forkProbe,runProbe,directInput,cycleInput,researchCycleInput,
 summarizeWindow,runThrottleSweep} from '../tools/drift-control-probe.mjs';
import {compileTireCharacteristics,createArcadeTireFrictionCalibration}
 from '../dist/physics/tire-friction-calibration.js';
import {setEngineTorqueMultiplier} from '../dist/physics/automatic-powertrain.js';
import {VEHICLE_CATALOG} from '../dist/vehicle/vehicle-catalog.js';
import {updateArcadeVehicle} from '../dist/physics/arcade-vehicle-physics.js';
import {createM5RecoveryState,updateM5Recovery} from '../dist/gameplay/recovery.js';
const c=values=>createArcadeTireFrictionCalibration(compileTireCharacteristics(values));
const research=c({gripX:.75,peakSlipX:.02,gripY:3,peakSlipY:.08,knee:.74});
function runReference(hz,direction,calibration=research){
 const p=createFlatProbe({calibration,initialSpeed:200/3.6});setEngineTorqueMultiplier(p.vehicle.powertrain,3);
 return runProbe(p,44,t=>researchCycleInput(t,direction),{hz});
}
for(const hz of [60,120,240])test(`M9.20 no-TCS research reference at ${hz}Hz enters, traverses and exits in both directions`,()=>{
 for(const sign of [-1,1]){
 const t=runReference(hz,sign);assert.equal(t.brakeTicks,0);assert.equal(t.rearLockTicks,0);assert.equal(t.unsupportedTicks,0);
 assert.ok(t.maxAbsBeta<28);
 for(const [a,b,angle]of [[16,19,15],[27,30,25],[38,41,15]]){
 const w=summarizeWindow(t,a,b);assert.ok(Math.abs(w.beta.mean+sign*angle)<1);
 assert.ok(w.speed.min>52&&w.speed.max<59);
 }
 assert.ok(t.rows.filter(r=>r.t>=30&&r.t<=41).every(r=>Math.abs(r.beta)>12));
 assert.ok(t.rows.filter(r=>r.t>=42).every(r=>Math.abs(r.beta)<1&&Math.abs(r.yawRate)<.05));
 assert.ok(t.rows.every(r=>r.deliveredDriveTorque===r.requestedDriveTorque));
 }
});
test('M9.20 research default-control comparison is not mistaken for a browser drift guarantee',()=>{
 const equal=c({gripX:3,peakSlipX:.08,gripY:3,peakSlipY:.08,knee:.74});
 const t=runReference(60,1,equal);assert.ok(t.maxAbsBeta<4);
});
test('M9.20 transient diagnostics are deterministic and preserve finite physical observations',()=>{
 const a=runProbe(createFlatProbe(),13,t=>cycleInput(t));
 const b=runProbe(createFlatProbe(),13,t=>cycleInput(t));assert.deepEqual(a,b);
 assert.equal(a.brakeTicks,0);assert.ok(a.distance>=a.netDisplacement-1e-6);
 assert.ok(a.rows.every(r=>[r.speed,r.beta,r.frontCapacityX,r.rearCapacityY,r.slipPower].every(Number.isFinite)));
 assert.ok(a.rows.every(r=>r.slipPower>=-1e-8&&r.requestedDriveTorque===r.deliveredDriveTorque));
 assert.ok(a.rows.at(-1).speed===a.exitSpeed);
});
test('M9.20 up/down sweep retains history and per-window ranges rather than claiming equilibria',()=>{
 const p=createFlatProbe({initialSpeed:30});const s=runThrottleSweep(p,{levels:[.1,.3,.5],dwell:1});
 assert.deepEqual(s.samples.map(x=>x.leg),['up','up','up','down','down','down']);
 for(let i=0;i<s.samples.length;i++){
 const x=s.samples[i];assert.ok(x.window.beta.min<=x.window.beta.mean&&x.window.beta.mean<=x.window.beta.max);
 if(i)assert.equal(x.metrics.initialSpeed,s.samples[i-1].metrics.exitSpeed);
 assert.equal(x.metrics.brakeTicks,0);
 }
});
test('M9.20 comparison forks copy normally reached state without mutable calibration sharing',()=>{
 const p=createFlatProbe();runProbe(p,1,()=>directInput(.2,.3));const q=forkProbe(p);
 assert.deepEqual(JSON.parse(JSON.stringify(p.vehicle)),JSON.parse(JSON.stringify(q.vehicle)));
 assert.equal(p.vehicle.tireFrictionCalibration,q.vehicle.tireFrictionCalibration);
 assert.notEqual(p.vehicle.actuator,q.vehicle.actuator);
 const before=p.vehicle.velocityX;runProbe(q,.2,()=>directInput(-.4,.5));assert.equal(p.vehicle.velocityX,before);
});
test('M9.20 browser default remains finite for all nine profiles through ordinary input and recovery',()=>{
 for(const {profile}of VEHICLE_CATALOG){
 const p=createFlatProbe({profile,initialSpeed:30});const v=p.vehicle,recovery=createM5RecoveryState(v);
 for(let tick=0;tick<360;tick++){
 const input={steering:tick<120?0:tick<240?.3:-.3,throttle:tick<300,brake:tick>=300};
 updateArcadeVehicle(p.guide,p.height,p.surface,v,input,1/60);
 assert.ok([v.x,v.y,v.z,v.speed,v.yawRate,v.frontWheelOmega,v.rearWheelOmega].every(Number.isFinite),profile.id);
 assert.equal(v.control.deliveredDriveTorque,v.powertrain.outputDriveTorque);
 updateM5Recovery(recovery,p.guide,p.height,p.surface,v,1/60);
 }
 }
});
test('M9.20 diagnostics add no feedback, state seeding, gear lock or browser dependency',async()=>{
 const src=await readFile(new URL('../tools/drift-control-probe.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/\.gear\s*=|\.yaw\s*=|\.velocity[XYZ]\s*=|sCut|targetBeta/);
 assert.match(src,/curvature:/);assert.match(src,/forwardDisplacement/);assert.match(src,/runThrottleSweep/);
});
