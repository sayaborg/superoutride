import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {compileTireCharacteristics as compile} from '../dist/physics/tire-friction-calibration.js';
import {DEFAULT_BROWSER_TIRE_CHARACTERISTICS as seed,BROWSER_TIRE_AXES} from '../dist/browser/tire-friction-selection.js';
import {BROWSER_CAMERA_YAW_TOGGLE_CODE} from '../dist/browser/camera-yaw-mode-selection.js';
import {evaluateTireForce as force,solveWheelOmega,wheelRequiredNetTorque,usefulLateralCapacity,radialC1Magnitude as H} from '../dist/physics/tire-wheel.js';
import {limitWheelTorques,ROAD_TORQUE_POLICY} from '../dist/physics/torque-protection.js';
import {createFlatProbe,runProbe,directInput} from '../tools/drift-control-probe.mjs';
const tire=createFlatProbe().vehicle.profile.rearStation.tire,R=.3;
const ps=Array.from({length:13},(_,i)=>2+i/2);
const near=(a,b,e=1e-10)=>assert.ok(Math.abs(a-b)<=e*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const at=(p,sx,sy,N=8000,m=1)=>force((30+sx*Math.hypot(30,1))/R,R,30,-sy*Math.hypot(30,1),N,m,tire,compile({...seed,combinedSlipExponent:p}));
const wheel=(p,more={})=>({omegaPrevious:100,inertia:3.4,rollingRadius:R,longitudinalVelocity:30,lateralVelocity:8,
 normalLoad:8000,gripFactor:1,characteristics:compile({...seed,combinedSlipExponent:p}),rollingResistance:.015,
 driveTorque:30000,brakeTorque:0,dt:1/720,tire,...more});

test('M9.23 p=2 reproduces the pre-change protected vehicle transient exactly, including wheel speeds/rho/forces',async()=>{
 const old=JSON.parse(await readFile(new URL('./fixtures/m9-23-p2-baseline.json',import.meta.url)));
 const probe=createFlatProbe({torqueProtection:ROAD_TORQUE_POLICY});
 assert.deepEqual(runProbe(probe,3,t=>directInput(t<2?.35:-.2,t<1?.6:0,t>=1&&t<2?.35:0),{hz:120}),old.trace);
});
test('M9.23 p=2 force is exactly the former ellipse expression in every region',()=>{
 for(const sx of [-2,-.04,0,.001,.02,.1,3])for(const sy of [-1,-.01,0,.003,.1,2]){
  const c=compile(seed),f=at(2,sx,sy),x=c.kX*f.sx/c.muX,y=c.kY*f.sy/c.muY,r=Math.hypot(x,y);
  assert.equal(f.rho,r);
  const fx=r===0?0:r<=c.rhoKnee?f.dx:f.capacityX*H(r,c.rhoKnee)*(x/r);
  const fy=r===0?0:r<=c.rhoKnee?f.dy:f.capacityY*H(r,c.rhoKnee)*(y/r);
  assert.equal(f.fx,fx);assert.equal(f.fy,fy);
 }
});
test('M9.23 compiler rejects absent, sub-two or nonfinite exponent and allows continuous finite >=2',()=>{
 for(const p of [undefined,0,1,1.99,NaN,Infinity])assert.throws(()=>compile({...seed,combinedSlipExponent:p}),RangeError);
 for(const p of [2,2.13,8,32])assert.equal(compile({...seed,combinedSlipExponent:p}).combinedSlipExponent,p);
 assert.notEqual(BROWSER_TIRE_AXES.find(x=>x.id==='LP').code,BROWSER_CAMERA_YAW_TOGGLE_CODE);
});
for(const p of ps){
 test(`M9.23 LP${p}: pure axes are exactly invariant, including zero and both signs`,()=>{
  for(const s of [-5,-.1,-.04,-.001,0,.001,.04,.1,5])for(const m of [.2,1,1.6]){
   assert.deepEqual(at(p,s,0,8000,m),at(2,s,0,8000,m));
   assert.deepEqual(at(p,0,s,8000,m),at(2,0,s,8000,m));
  }
 });
 test(`M9.23 LP${p}: capacity, passivity, symmetry, homogeneity and no-contact hold`,()=>{
  let state=173;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
  for(let n=0;n<500;n++){
   const c=compile({...seed,gripX:.5+3.5*rand(),gripY:.5+3.5*rand(),peakSlipX:.01+.59*rand(),peakSlipY:.01+.59*rand(),knee:.1+.85*rand(),combinedSlipExponent:p});
   const vx=100*rand()-50,vy=80*rand()-40,omega=400*rand()-200,N=15000*rand(),m=.1+1.5*rand();
   const f=force(omega,R,vx,vy,N,m,tire,c),scaled=force(omega,R,vx,vy,3*N,m,tire,c);
   const norm=(Math.abs(f.fx/f.capacityX)**p+Math.abs(f.fy/f.capacityY)**p)**(1/p);
   near(norm,H(f.rho,c.rhoKnee));assert.ok(norm<=1+2e-14);
   assert.ok(f.fx*(vx-R*omega)+f.fy*vy<=1e-8);
   near(scaled.fx,3*f.fx);near(scaled.fy,3*f.fy);
   const mirror=force(-omega,R,-vx,-vy,N,m,tire,c);near(mirror.fx,-f.fx);near(mirror.fy,-f.fy);
  }
  for(const [N,m]of [[0,1],[100,0]]){const f=at(p,1,2,N,m);assert.equal(f.fx,0);assert.equal(f.fy,0);}
  const side=force(0,R,0,30,8000,1,tire,compile({...seed,combinedSlipExponent:p}));
  assert.equal(side.fx,0);assert.ok(side.fy<0); // 90-degree slide creates no heading force.
 });
 test(`M9.23 LP${p}: signed residual/root/bracket and Coulomb stop remain valid`,()=>{
  for(const vx of [-30,0,30])for(const sy of [-20,0,20])for(const N of [0,100,8000]){
   const i=wheel(p,{longitudinalVelocity:vx,lateralVelocity:sy,normalLoad:N,omegaPrevious:vx/R});
   let previous=-Infinity;
   for(let w=-200;w<=200;w+=5){const q=wheelRequiredNetTorque(i,w);assert.ok(q>previous);previous=q;}
   for(const drive of [-30000,0,30000])for(const brake of [0,50000]){
    const input={...i,driveTorque:drive,brakeTorque:brake},out=solveWheelOmega(input);
    assert.ok(Number.isFinite(out.omega));
    const q=wheelRequiredNetTorque(input,out.omega)-drive;
    if(out.omega===0)assert.ok(Math.abs(q)<=brake);else near(q+Math.sign(out.omega)*brake,0,2e-7);
   }
  }
 });
 test(`M9.23 LP${p}: protection uses updated force inverse and reserve uses the same norm`,()=>{
  const i=wheel(p),c=i.characteristics;
  for(const sign of [-1,1]){
   const x=sign*.5*c.rhoKnee*c.muX*8000,reserve=usefulLateralCapacity(x,8000,1,tire,c);
   near(reserve,c.muY*8000*(c.rhoKnee**p-Math.abs(x/(c.muX*8000))**p)**(1/p));
  }
  for(const vx of [-30,30])for(const drive of [0,30000])for(const brake of [0,30000]){
   const input=wheel(p,{longitudinalVelocity:vx,omegaPrevious:vx/R,driveTorque:drive,brakeTorque:brake});
   const limited=limitWheelTorques(input),out=solveWheelOmega(limited);
   assert.ok(limited.driveTorque>=0&&limited.driveTorque<=drive);assert.ok(limited.brakeTorque>=0&&limited.brakeTorque<=brake);
   if(vx>0||drive===0)assert.ok(Math.abs(out.tire.sx)<=.08+1e-10);
  }
 });
}
test('M9.23 fixed combined demand expands quantitatively with p while pure capacities do not',()=>{
 const fs=[2,3,4,6,8].map(p=>at(p,1,1));
 for(let j=1;j<fs.length;j++){
  assert.ok(fs[j].fx>fs[j-1].fx);assert.ok(fs[j].fy>fs[j-1].fy);
  assert.equal(fs[j].capacityX,fs[0].capacityX);assert.equal(fs[j].capacityY,fs[0].capacityY);
  assert.ok(limitWheelTorques(wheel([2,3,4,6,8][j])).driveTorque>limitWheelTorques(wheel([2,3,4,6,8][j-1])).driveTorque);
 }
 for(const p of [2,3,4]){
  const f=at(p,.08,.1);near(f.fx/f.capacityX,2**(-1/p));near(f.fy/f.capacityY,2**(-1/p));
 }
});

test('M9.23 differing front/rear exponents compile without identity branches or affecting other actors',async()=>{
 const {compileArcadeVehicleProfile}=await import('../dist/physics/vehicle-profiles.js');
 const {FERRARI_TESTAROSSA_VEHICLE_AUTHORING}=await import('../dist/vehicle/production-vehicle-profiles.js');
 const {VEHICLE_CATALOG}=await import('../dist/vehicle/vehicle-catalog.js');
 const profile=compileArcadeVehicleProfile({...FERRARI_TESTAROSSA_VEHICLE_AUTHORING,
  frontTire:{...seed,combinedSlipExponent:3},rearTire:{...seed,combinedSlipExponent:6}});
 assert.equal(profile.frontStation.tire.combinedSlipExponent,3);assert.equal(profile.rearStation.tire.combinedSlipExponent,6);
 for(const e of VEHICLE_CATALOG)for(const station of ['frontStation','rearStation'])assert.equal(e.profile[station].tire.combinedSlipExponent,2);
 const {createArcadeTireFrictionCalibration}=await import('../dist/physics/tire-friction-calibration.js');
 for(const e of VEHICLE_CATALOG)for(const p of [2,4,8]){
  const probe=createFlatProbe({profile:e.profile,torqueProtection:e.torqueProtection,
   calibration:createArcadeTireFrictionCalibration(compile({...seed,combinedSlipExponent:p})),initialSpeed:30});
  const trace=runProbe(probe,.5,t=>directInput(.25,t<.25?.5:0,t>=.25?.2:0),{hz:120});
  assert.ok(trace.rows.every(r=>[r.speed,r.beta,r.frontRho,r.rearRho].every(Number.isFinite)));
 }
});
