import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {compileTireCharacteristics as compile, readTireCharacteristics as read,
 createArcadeTireFrictionCalibration as pair, setArcadeVehicleTireFrictionCalibration as set}
 from '../dist/physics/tire-friction-calibration.js';
import {evaluateTireForce as force, tireLinearDemand, deriveTireSlip, radialC1Magnitude as H,
 solveWheelOmega, rollingResistanceTorque, usefulLateralCapacity} from '../dist/physics/tire-wheel.js';
import {FERRARI_TESTAROSSA_VEHICLE_PROFILE as car, compileArcadeVehicleProfile}
 from '../dist/physics/vehicle-profiles.js';
import {VEHICLE_CATALOG} from '../dist/vehicle/vehicle-catalog.js';
const seed={gripX:2.5,peakSlipX:.08,gripY:2.2,peakSlipY:.10,knee:.74};
const tire=car.rearStation.tire,R=car.rearWheelRadius;
const near=(x,y,e=1e-10)=>assert.ok(Math.abs(x-y)<=e*Math.max(1,Math.abs(y)),`${x} != ${y}`);
function at(c,sx,sy,N=10000,m=1,vx=30) {
 const ref=Math.hypot(vx,tire.lowSpeedRegularization);
 return force((vx+sx*ref)/R,R,vx,-sy*ref,N,m,tire,c);
}
function legacyH(r,a){ if(r<=a)return r;if(r>=2-a)return 1;
 const w=2-2*a,t=(r-a)/w;return (2*t**3-3*t**2+1)*a+(t**3-2*t**2+t)*w+(-2*t**3+3*t**2); }
let n=123456789; const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/2**32;};

test('M9.20 five authoring axes compile into five resolved coefficients, with no duplicate P',()=>{
 const c=compile(seed); assert.deepEqual(Object.keys(c).sort(),['kX','kY','muX','muY','rhoKnee']);
 near(c.kX,39.375);near(c.kY,27.72);
 const a=read(c);for(const key of Object.keys(seed))near(a[key],seed[key]);assert.ok(Object.isFrozen(c));
});
test('M9.20 equality of stiffness is a calibration choice, not a lower-law constraint',()=>{
 const c=compile({gripX:.75,gripY:3,peakSlipX:.02,peakSlipY:.08,knee:.74});
 near(c.kX,47.25);near(c.kY,47.25);
 const d=compile({...seed,gripX:.75,gripY:3,peakSlipX:.08,peakSlipY:.08});
 near(d.kX,11.8125);near(d.kY,47.25);
});
for(const field of Object.keys(seed)) test(`M9.20 ${field} rejects bad compilation atomically`,()=>{
 const owner={tireFrictionCalibration:pair(compile(seed))},before=owner.tireFrictionCalibration;
 const invalid=field==='knee'?[0,1,-1,NaN,Infinity]:[0,-1,NaN,Infinity];
 for(const bad of invalid){assert.throws(()=>set(owner,{...seed,[field]:bad}),RangeError);assert.equal(owner.tireFrictionCalibration,before);}
});
test('M9.20 derived coefficient overflow is rejected before calibration replacement',()=>{
 assert.throws(()=>compile({...seed,peakSlipX:Number.MIN_VALUE}),RangeError);
});
test('M9.20 linked editing has one immutable atomic pair, with independent owner lifecycle',()=>{
 const a={tireFrictionCalibration:pair(compile(seed))},b={tireFrictionCalibration:pair(compile(seed))};
 const old=a.tireFrictionCalibration;set(a,{...seed,gripX:3});
 assert.notEqual(a.tireFrictionCalibration,old);assert.equal(a.tireFrictionCalibration.front,a.tireFrictionCalibration.rear);
 assert.ok(Object.isFrozen(a.tireFrictionCalibration.front));assert.equal(b.tireFrictionCalibration.front.muX,2.5);
 assert.throws(()=>{a.tireFrictionCalibration.front.kX=1;},TypeError);
});
test('M9.20 compiler supports differing station tires without vehicle or station branches',()=>{
 const p=compileArcadeVehicleProfile({...car,frontTire:seed,rearTire:{...seed,gripX:.75}});
 near(p.frontStation.tire.muX,2.5);near(p.rearStation.tire.muX,.75);
 const c=pair(p.frontStation.tire,p.rearStation.tire);assert.notEqual(c.front,c.rear);
});
test('M9.20 all nine stock references retain old non-dropping capacities and initial response',()=>{
 for(const {profile:p}of VEHICLE_CATALOG)for(const t of [p.frontStation.tire,p.rearStation.tire]){
 near(t.muX,1.35);near(t.muY,1.35);near(t.kX,9.75);near(t.kY,9.75);near(t.rhoKnee,.74);
 for(const [sx,sy]of [[.01,.02],[.2,.3],[1,-.4]]){
 const N=4321,ref=Math.hypot(30,t.lowSpeedRegularization),f=force((30+sx*ref)/R,R,30,-sy*ref,N,1,t);
 const d=Math.hypot(sx,sy),gain=N*1.35*legacyH(9.75*d/1.35,.74)/d;
 near(f.fx,sx*gain);near(f.fy,sy*gain);
 }
 }
});
for(const a of [.10,.5,.74,.90,.95]) test(`M9.20 H at knee ${a} equals the former Hermite shoulder`,()=>{
 let previous=0;
 for(let i=0;i<=1000;i++){
 const r=i*2/1000,h=H(r,a);near(h,legacyH(r,a),1e-14);assert.ok(h>=previous-1e-14&&h<=1&&h<=r+1e-14);previous=h;
 }
 for(const r of [a,2-a]){
 const d=1e-6,left=(H(r,a)-H(r-d,a))/d,right=(H(r+d,a)-H(r,a))/d;near(left,right,6e-6);
 }
});
for(const axis of ['X','Y']) test(`M9.20 pure ${axis} capacity onset is P at every positive load`,()=>{
 for(const a of [.1,.74,.95])for(const N of [1,100,10000])for(const m of [.3,1,1.6]){
 const c=compile({...seed,knee:a}),P=seed[axis==='X'?'peakSlipX':'peakSlipY'],G=seed[axis==='X'?'gripX':'gripY'];
 for(const multiple of [1,1.2,4]){
 const f=at(c,axis==='X'?m*P*multiple:0,axis==='Y'?m*P*multiple:0,N,m);
 near(axis==='X'?f.fx:f.fy,m*G*N);
 }
 const f=at(c,axis==='X'?m*P*.9:0,axis==='Y'?m*P*.9:0,N,m);assert.ok((axis==='X'?f.fx:f.fy)<m*G*N);
 }
});
test('M9.20 knee changes at fixed G/P alter initial slopes but not capacity onset',()=>{
 const cs=[.1,.74,.95].map(knee=>compile({...seed,knee}));
 assert.ok(cs[0].kX>cs[1].kX&&cs[1].kX>cs[2].kX);
 for(const c of cs){near(at(c,.08,0).fx,25000);near(at(c,0,.1).fy,22000);}
});
test('M9.20 independent small-slip longitudinal and lateral demand scales with actual N',()=>{
 const c=compile(seed),f=at(c,.001,.001,7000);
 near(f.fx,7000*c.kX*.001);near(f.fy,7000*c.kY*.001);
 const d=tireLinearDemand(110,R,30,-5,7000,tire,c);near(d.dx,7000*c.kX*d.sx);near(d.dy,7000*c.kY*d.sy);
});
test('M9.20 pure/combined forces remain bounded, dissipative, symmetric and load-homogeneous',()=>{
 for(let i=0;i<20000;i++){
 const c=compile({gripX:.5+3.5*random(),gripY:.5+3.5*random(),peakSlipX:.01+.59*random(),peakSlipY:.01+.59*random(),knee:.1+.85*random()});
 const sx=4*random()-2,sy=4*random()-2,N=.01+15000*random(),m=.1+1.5*random();
 const f=at(c,sx,sy,N,m),f2=at(c,sx,sy,2*N,m),mirror=at(c,-sx,-sy,N,m);
 assert.ok((f.fx/f.capacityX)**2+(f.fy/f.capacityY)**2<=1+2e-14);
 assert.ok(f.fx*sx+f.fy*sy>=-1e-9);near(f2.fx,2*f.fx);near(f2.fy,2*f.fy);
 near(mirror.fx,-f.fx);near(mirror.fy,-f.fy);
 }
});
test('M9.20 fixed lateral slip has monotone Fx and combined-slip allocation without a second falloff',()=>{
 for(const a of [.1,.74,.95])for(const py of [.01,.1,.6])for(const sy of [-1,-.1,0,.1,1]){
 const c=compile({...seed,knee:a,peakSlipY:py});let previous=-Infinity,lastFy=Infinity;
 for(let i=0;i<=400;i++){
 const sx=(i-200)/100,f=at(c,sx,sy);assert.ok(f.fx>=previous-1e-8);previous=f.fx;
 if(i>=200){assert.ok(Math.abs(f.fy)<=lastFy+1e-8);lastFy=Math.abs(f.fy);}
 }
 }
});
test('M9.20 absent contact and zero-grip road release exact force without a friction/load floor',()=>{
 const c=compile(seed);
 for(const [N,m]of [[0,1],[-1,1],[10,0],[1e-100,0]]){
 const f=at(c,3,-2,N,m);assert.equal(f.fx,0);assert.equal(f.fy,0);assert.equal(f.capacityX,0);assert.equal(f.capacityY,0);
 }
 const f=at(c,3,2,1e-100);assert.ok(f.fx>0&&f.fx<1e-99);
});
test('M9.20 invalid slip/load/material inputs reject instead of manufacturing finite force',()=>{
 for(const bad of [NaN,Infinity]){
 assert.throws(()=>at(compile(seed),.1,.2,bad));assert.throws(()=>at(compile(seed),.1,.2,100,bad));
 assert.throws(()=>deriveTireSlip(bad,R,30,0,1));assert.throws(()=>deriveTireSlip(1,0,30,0,1));
 }
});
test('M9.20 shared slip observation is finite at zero and signed forward/reverse velocity',()=>{
 for(const vx of [-30,0,30]){
 const s=deriveTireSlip(10,R,vx,-2,1);near(s.sx,(R*10-vx)/Math.hypot(vx,1));near(s.sy,2/Math.hypot(vx,1));
 }
});
test('M9.20 useful lateral reserve uses both elliptical capacities',()=>{
 const c=compile(seed),N=7000,x=.25*c.muX*N;
 near(usefulLateralCapacity(x,N,1,tire,c),c.muY*N*Math.sqrt(c.rhoKnee**2-.25**2));
 assert.equal(usefulLateralCapacity(c.muX*N,N,1,tire,c),0);
});
test('M9.20 signed wheel roots balance actual delivered torque and the elliptical tire force',()=>{
 for(const vx of [-30,0,30])for(const N of [0,100,10000])for(const drive of [-15000,0,15000])for(const dt of [1/720,1/1440]){
 const i={omegaPrevious:vx/R,inertia:3.4,rollingRadius:R,longitudinalVelocity:vx,lateralVelocity:3,
 normalLoad:N,gripFactor:1,characteristics:compile(seed),rollingResistance:.015,driveTorque:drive,brakeTorque:0,dt,tire};
 const out=solveWheelOmega(i),res=i.inertia*out.omegaDot-drive+R*out.tire.fx+rollingResistanceTorque(out.omega,R,N,.015,1);
 near(res,0,2e-7);assert.deepEqual(out,solveWheelOmega(i));
 }
});
test('M9.20 Coulomb brake atom and free airborne wheel rotation remain ordinary wheel mechanics',()=>{
 const i={omegaPrevious:0,inertia:3.4,rollingRadius:R,longitudinalVelocity:0,lateralVelocity:0,
 normalLoad:0,gripFactor:1,characteristics:compile(seed),rollingResistance:0,driveTorque:100,brakeTorque:200,dt:.01,tire};
 const locked=solveWheelOmega(i);assert.equal(locked.omega,0);assert.equal(locked.locked,true);
 const free=solveWheelOmega({...i,brakeTorque:0});near(free.omega,100*.01/3.4);assert.equal(free.tire.fx,0);
});
test('M9.20 tire authority remains per-station while M9.21 owns delivered torque separately',async()=>{
 const src=await readFile(new URL('../src/physics/tire-wheel.ts',import.meta.url),'utf8');
 assert.doesNotMatch(src,/lateralPostPeakScale|slidingFrictionRatio|referenceFrictionMultiplier|linearStiffnessMultiplier|driftMode|targetBeta|sCut|TCS_GAIN/);
 const body=await readFile(new URL('../src/physics/arcade-vehicle-physics.ts',import.meta.url),'utf8');
 assert.match(body,/characteristics: vehicle\.tireFrictionCalibration\.front/);
 assert.match(body,/characteristics: vehicle\.tireFrictionCalibration\.rear/);
 assert.match(body,/solveProtectedWheelPair/);
 assert.match(body,/resolved\.frontInput\.driveTorque/);
 assert.match(body,/resolved\.rearInput\.driveTorque/);
 assert.doesNotMatch(body,/sCut|TCS_GAIN|torqueScale|gripX.*brake/);
});
