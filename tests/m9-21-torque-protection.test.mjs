import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { limitWheelTorques, ROAD_TORQUE_POLICY, TWO_WHEEL_TORQUE_POLICY,
  resolveTorqueProtectionPolicy, supportCompressionMargin } from '../dist/physics/torque-protection.js';
import { solveWheelOmega, wheelRequiredNetTorque } from '../dist/physics/tire-wheel.js';
import { compileTireCharacteristics } from '../dist/physics/tire-friction-calibration.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { createFlatProbe, forkProbe, runProbe, directInput } from '../tools/drift-control-probe.mjs';
import { runProtectionProbe } from '../tools/torque-protection-probe.mjs';
import { arcadeBodyKinematics, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { deriveContactObservation } from '../dist/physics/vehicle-dynamics.js';
import { createM5RecoveryState, recoverM5Vehicle } from '../dist/gameplay/recovery.js';
import { setEngineTorqueMultiplier } from '../dist/physics/automatic-powertrain.js';
import { evaluateVehicleWrench } from '../dist/physics/vehicle-wrench.js';
const car=VEHICLE_CATALOG[0],bike=VEHICLE_CATALOG[5],R=car.profile.rearWheelRadius;
const close=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const tire=compileTireCharacteristics({gripX:2.5,peakSlipX:.08,gripY:2.2,peakSlipY:.1,knee:.74});
const wheel=(more={})=>({omegaPrevious:30/R,inertia:3.4,rollingRadius:R,longitudinalVelocity:30,
 lateralVelocity:0,normalLoad:8000,gripFactor:1,characteristics:tire,rollingResistance:.015,
 driveTorque:0,brakeTorque:0,dt:1/720,tire:car.profile.rearStation.tire,...more});
const policyFor=e=>e.torqueProtection;
let seed=3217;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};

test('M9.21 policy is immutable composition data, with pitch protection only on the four bikes',()=>{
 for(const [i,e]of VEHICLE_CATALOG.entries()){
  assert.equal(e.torqueProtection.wheelSlip,true);
  assert.equal(e.torqueProtection.supportReserve,i<5?null:.08);
  const p=resolveTorqueProtectionPolicy(e.torqueProtection);assert.ok(Object.isFrozen(p));
 }
 for(const supportReserve of [0,1,-1,NaN,Infinity])assert.throws(()=>resolveTorqueProtectionPolicy({wheelSlip:true,supportReserve}));
});
test('M9.21 inverse torque equals the existing signed wheel equation and is strictly increasing',()=>{
 for(let n=0;n<500;n++){
  const i=wheel({omegaPrevious:300*random()-150,longitudinalVelocity:60*random()-30,
   lateralVelocity:30*random()-15,normalLoad:15000*random(),gripFactor:.2+random(),
   driveTorque:2000*random(),dt:1/(60+1000*random())});
  const a=wheelRequiredNetTorque(i,-20),b=wheelRequiredNetTorque(i,0),c=wheelRequiredNetTorque(i,20);
  assert.ok(a<b&&b<c);
  const o=solveWheelOmega(i);close(wheelRequiredNetTorque(i,o.omega),i.driveTorque,2e-7);
 }
});
test('M9.21 TCS and ABS project simultaneous requested torques into feasible local bounds',()=>{
 for(let n=0;n<2000;n++){
  const vx=5+65*random(),m=.2+random(),slip=m*.08,ref=Math.hypot(vx,1),s0=(2*random()-1)*slip;
  const i=wheel({longitudinalVelocity:vx,omegaPrevious:(vx+s0*ref)/R,
   lateralVelocity:30*random()-15,gripFactor:m,normalLoad:100+15000*random(),
   driveTorque:30000*random(),brakeTorque:30000*random()});
  const original={...i},p=limitWheelTorques(i),o=solveWheelOmega(p);
  assert.deepEqual(i,original);
  assert.ok(p.driveTorque>=0&&p.driveTorque<=i.driveTorque);
  assert.ok(p.brakeTorque>=0&&p.brakeTorque<=i.brakeTorque);
  const lo=wheelRequiredNetTorque(i,(vx-slip*ref)/R),hi=wheelRequiredNetTorque(i,(vx+slip*ref)/R);
  // Torque reduction cannot repair arbitrary outside states; assert the bound only when reachable.
  if(lo<=i.driveTorque&&hi>=-i.brakeTorque){
   assert.ok(o.tire.sx<=slip+1e-10&&o.tire.sx>=-slip-1e-10,JSON.stringify({sx:o.tire.sx,slip}));
  }
 }
});
test('M9.21 independent AWD reduction changes actual split without reallocating removed torque',()=>{
 const request=5000,f=.47;
 const front=wheel({normalLoad:1000,driveTorque:request*f,omegaPrevious:(30+.08*Math.hypot(30,1))/R});
 const rear=wheel({normalLoad:12000,driveTorque:request*(1-f)});
 const a=limitWheelTorques(front),b=limitWheelTorques(rear);
 assert.ok(a.driveTorque<front.driveTorque);assert.equal(b.driveTorque,rear.driveTorque);
 assert.ok(a.driveTorque/(a.driveTorque+b.driveTorque)<f);
 assert.ok(a.driveTorque+b.driveTorque<request);
});
test('M9.21 independent ABS releases the overloaded station without reducing the other',()=>{
 const a=limitWheelTorques(wheel({normalLoad:500,brakeTorque:2500,omegaPrevious:(30-.08*Math.hypot(30,1))/R}));
 const b=limitWheelTorques(wheel({normalLoad:10000,brakeTorque:2500}));
 assert.ok(a.brakeTorque<2500);assert.equal(b.brakeTorque,2500);
 assert.ok(solveWheelOmega(a).tire.sx>=-.080000001);
});
test('M9.21 brake release handles reverse, while low-speed stopping and zero-contact wheels stay physical',()=>{
 for(const vx of [-30,30]){
  const i=wheel({omegaPrevious:vx/R,longitudinalVelocity:vx,brakeTorque:50000});
  const p=limitWheelTorques(i),o=solveWheelOmega(p);
  assert.ok(Math.sign(o.omega)===Math.sign(vx));assert.ok(Math.abs(o.tire.sx)<.080000001);
 }
 const stationary=wheel({omegaPrevious:0,longitudinalVelocity:0,driveTorque:0,brakeTorque:1000});
 assert.equal(limitWheelTorques(stationary).brakeTorque,1000);
 assert.equal(solveWheelOmega(limitWheelTorques(stationary)).omega,0);
 const airborne=wheel({normalLoad:0,driveTorque:5000});
 assert.equal(limitWheelTorques(airborne),airborne);
 close(solveWheelOmega(airborne).omega,airborne.omegaPrevious+5000*airborne.dt/airborne.inertia,1e-8);
 for(const bad of [NaN,Infinity])assert.throws(()=>limitWheelTorques(wheel({normalLoad:bad})));
});
test('M9.21 already overspinning wheel is not snapped to the target or given an unrequested brake',()=>{
 const i=wheel({omegaPrevious:180/R,driveTorque:10000});
 const p=limitWheelTorques(i),o=solveWheelOmega(p);
 assert.equal(p.driveTorque,0);assert.equal(p.brakeTorque,0);
 assert.ok(o.tire.sx>.08);assert.ok(o.omega<i.omegaPrevious);
});
test('M9.21 actual per-station torque telemetry conserves requested budget, not fixed delivered AWD split',()=>{
 const e=VEHICLE_CATALOG[4],p=createFlatProbe({profile:e.profile,initialSpeed:2,torqueProtection:e.torqueProtection});
 setEngineTorqueMultiplier(p.vehicle.powertrain,4);let changed=false;
 for(let n=0;n<240;n++){
  updateArcadeVehicle(p.guide,p.height,p.surface,p.vehicle,{steering:.3,throttle:true,brake:false},1/120);
  const c=p.vehicle.control,req=p.vehicle.powertrain.outputDriveTorque;
  close(c.requestedFrontDriveTorque+c.requestedRearDriveTorque,req);
  close(c.deliveredDriveTorque,c.frontDriveTorque+c.rearDriveTorque);
  for(const side of ['Front','Rear'])assert.ok(c[side.toLowerCase()+'DriveTorque']<=c['requested'+side+'DriveTorque']+1e-10);
  if(req>0&&c.deliveredDriveTorque>0&&Math.abs(c.frontDriveTorque/c.deliveredDriveTorque-.47)>1e-5)changed=true;
 }
 assert.ok(changed);
});
for(const hz of [60,120,240])test(`M9.21 all four bikes prevent repeated powered lift and braking overturn at ${hz} Hz`,()=>{
 for(const e of VEHICLE_CATALOG.slice(5))for(const kind of ['drive','brake']){
  const x=runProtectionProbe(e,{hz,kind,seconds:6});
  assert.equal(x.error,null,e.profile.id);assert.equal(x.overturned,false,e.profile.id);
  assert.equal(x.frontLiftTime,0,JSON.stringify(x));assert.equal(x.rearLiftTime,0,JSON.stringify(x));
  assert.equal(x.infeasibleTime,0,JSON.stringify(x));
  if(kind==='drive')assert.ok(x.finalSpeed>20,e.profile.id);
  else {assert.ok(x.finalSpeed<.5);assert.ok(x.distance<30);assert.ok(x.supportLimitedTime>0);}
 }
});
test('M9.21 the unprotected bike failure remains reproducible and slip-only protection is not pitch protection',()=>{
 const raw=runProtectionProbe(bike,{kind:'brake',protectedRun:false});assert.equal(raw.overturned,true);
 const slipOnly={...bike,torqueProtection:ROAD_TORQUE_POLICY};
 const stillLifts=runProtectionProbe(slipOnly,{kind:'brake'});assert.ok(stillLifts.rearLiftTime>0);
 const full=runProtectionProbe(bike,{kind:'brake'});assert.equal(full.rearLiftTime,0);
});
test('M9.21 all nine protected profiles launch, brake, switch pedals and recover without policy loss',()=>{
 for(const e of VEHICLE_CATALOG){
  const p=createFlatProbe({profile:e.profile,initialSpeed:0,torqueProtection:policyFor(e)}),v=p.vehicle;
  const before=v.torqueProtection;
  for(let n=0;n<720;n++){
   const t=n/120;
   updateArcadeVehicle(p.guide,p.height,p.surface,v,{steering:0,throttle:t<3,brake:t>=3},1/120);
   assert.ok([v.speed,v.pitch,v.frontWheelOmega,v.rearWheelOmega].every(Number.isFinite));
   assert.ok(arcadeBodyKinematics(v).up.y>0,e.profile.id);
  }
  assert.ok(v.speed<1,e.profile.id);
  recoverM5Vehicle(createM5RecoveryState(v),p.guide,p.height,p.surface,v);
  assert.equal(v.torqueProtection,before);assert.equal(v.control.supportTorqueScale,1);
 }
});
test('M9.21 neutral coasting is byte-identical physics, and support control does not glue an airborne body',()=>{
 const p=createFlatProbe({initialSpeed:200/3.6});
 const q=createFlatProbe({initialSpeed:200/3.6,torqueProtection:ROAD_TORQUE_POLICY});
 const a=runProbe(p,2,()=>directInput(.65,0)),b=runProbe(q,2,()=>directInput(.65,0));assert.deepEqual(a,b);
 const air=createFlatProbe({profile:bike.profile,initialSpeed:30,torqueProtection:TWO_WHEEL_TORQUE_POLICY});
 air.vehicle.y+=3;const y=air.vehicle.y;
 runProbe(air,.2,()=>directInput(0,0));assert.ok(air.vehicle.y<y);assert.equal(air.vehicle.frontNormalLoad,0);
 assert.equal(air.vehicle.rearNormalLoad,0);
});
test('M9.21 compression barrier uses fresh geometry, velocity and the retained wrench rather than telemetry',()=>{
 const p=createFlatProbe({profile:bike.profile,initialSpeed:15,torqueProtection:TWO_WHEEL_TORQUE_POLICY});
 runProbe(p,.5,()=>directInput(0,0));const q=forkProbe(p);
 q.vehicle.frontNormalLoad=1e12;q.vehicle.rearNormalLoad=0;q.vehicle.control.supportFeasible=false;
 runProbe(p,.2,()=>directInput(0,1));runProbe(q,.2,()=>directInput(0,1));
 close(p.vehicle.pitch,q.vehicle.pitch);close(p.vehicle.speed,q.vehicle.speed);
 const body=arcadeBodyKinematics(p.vehicle),v=p.vehicle;
 const contact=deriveContactObservation(p.guide,p.height,p.surface,body,v.profile.frontStation,v.frontSteerAngle,v.course.segmentIndex);
 const r=deriveContactObservation(p.guide,p.height,p.surface,body,v.profile.rearStation,0,v.course.segmentIndex);
 const zero={omega:0,omegaDot:0,tire:{fx:0,fy:0}};
 const wrench=evaluateVehicleWrench(v.profile,body,contact,r,zero,zero);
 const a=supportCompressionMargin(v.profile,body,contact,wrench,.08);
 const rising={...contact,reachVelocity:{x:contact.reachVelocity.x,y:contact.reachVelocity.y+1,z:contact.reachVelocity.z}};
 assert.ok(supportCompressionMargin(v.profile,body,rising,wrench,.08)<a);
});
test('M9.21 every browser actor and vehicle replacement explicitly receives catalog protection',async()=>{
 for(const name of ['main','main-linear','main-circuit']){
  const s=await readFile(new URL(`../src/${name}.ts`,import.meta.url),'utf8');
  const calls=[...s.matchAll(/createArcadeVehicle\(\n([\s\S]*?)\n\s*\)/g)];
  assert.ok(calls.length>=2);
  for(const x of calls)assert.match(x[1],/\.torqueProtection,/);
  assert.match(s,/vehicleCatalogEntryForId\(profile.id\).torqueProtection/);
 }
});
test('M9.21 protection adds no vehicle kind, target beta, body overwrite, or duplicated tire law',async()=>{
 const s=await readFile(new URL('../src/physics/torque-protection.ts',import.meta.url),'utf8');
 assert.doesNotMatch(s,/presentationFamily|\.id\s*===|targetBeta|\.yaw\s*=|\.pitch\s*=|\.velocity[XYZ]\s*=/);
 assert.match(s,/wheelRequiredNetTorque/);assert.match(s,/evaluateVehicleWrench/);
 const root=await readFile(new URL('../src/physics/arcade-vehicle-physics.ts',import.meta.url),'utf8');
 assert.doesNotMatch(root,/profile\.presentationFamily/);
 assert.match(root,/frontDriveTorque = driveTorque \* profile.frontDriveTorqueFraction/);
});
