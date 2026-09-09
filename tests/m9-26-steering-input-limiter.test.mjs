import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {limitSteeringInput as limit} from '../dist/physics/steering-input-limiter.js';
import {deriveContactObservation,reorientContactObservation} from '../dist/physics/vehicle-dynamics.js';
import {arcadeBodyKinematics,updateArcadeVehicle} from '../dist/physics/arcade-vehicle-physics.js';
import {compileTireCharacteristics} from '../dist/physics/tire-friction-calibration.js';
import {createFlatProbe} from '../tools/drift-control-probe.mjs';
import {setArcadeVehicleSteeringOffsetMax} from '../dist/physics/vehicle-calibration.js';
import {VEHICLE_CATALOG} from '../dist/vehicle/vehicle-catalog.js';
import {createVehicleDebugHudModel,drawVehicleControlGraphics} from '../dist/browser/vehicle-debug-hud.js';
const DEG=Math.PI/180,M=60*DEG;
const p=createFlatProbe(),v=p.vehicle;
const tire=compileTireCharacteristics({gripX:4,gripY:2.5,peakSlipX:.08,peakSlipY:.08,knee:.74});
function fixture(speed=30,lateral=0,pitch=0){
 v.y=2;v.pitch=pitch;v.yaw=0;v.yawRate=0;v.pitchRate=0;v.velocityX=lateral;v.velocityY=0;v.velocityZ=speed;
 const body=arcadeBodyKinematics(v);
 const contact=deriveContactObservation(p.guide,p.height,p.surface,body,v.profile.frontStation,0,v.course.segmentIndex);
 return {body,contact:{...contact,normalLoad:4000,forceTransmitting:true}};
}
function slip(body,c,angle){const f=reorientContactObservation(c,body,angle);return Math.abs(f.lateralVelocity)/Math.hypot(f.longitudinalVelocity,c.profile.tire.lowSpeedRegularization);}

test('M9.26 high-speed input stops at pure lateral onset, D stays sensitivity and zero-speed permits full request',()=>{
 for(const speed of [0,.01,1,30])for(const sign of [-1,1]){
  const {body,contact}=fixture(speed),request=sign*20*DEG;
  const got=limit(0,request,M,body,contact,tire);
  if(speed<=.01)assert.equal(got,request);
  else{assert.ok(Math.abs(got)<Math.abs(request));assert.ok(Math.abs(slip(body,contact,got)-.08)<1e-10);}
  assert.equal(limit(0,0,M,body,contact,tire),0);
 }
 const {body,contact}=fixture(30);
 assert.equal(limit(0,.01,M,body,contact,tire),.01);
});
test('M9.26 closed-form component matches independently reprojected slip on tilted surfaces and signed velocities',()=>{
 let seed=9123;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let i=0;i<500;i++){
  const {body,contact:c}=fixture((rng()-.5)*100,(rng()-.5)*60,(rng()-.5)*.8);
  const nx=(rng()-.5)*.5,nz=(rng()-.5)*.5,norm=Math.hypot(nx,1,nz);
  const contact={...c,surface:{...c.surface,normal:{x:nx/norm,y:1/norm,z:nz/norm},material:{...c.surface.material,gripFactor:.25+rng()*2}}};
  const automatic=(rng()-.5)*70*DEG,request=(rng()-.5)*40*DEG;
  const got=limit(automatic,request,M,body,contact,tire);
  assert.ok(got*request>=-1e-14);assert.ok(Math.abs(got)<=Math.abs(request)+1e-14);
  const bound=Math.max(slip(body,contact,automatic),contact.surface.material.gripFactor*.08);
  for(let j=0;j<=30;j++)assert.ok(slip(body,contact,automatic+got*j/30)<=bound+1e-8,JSON.stringify({i,got,request,bound}));
  if(Math.abs(got-request)>1e-6){
   const next=got+Math.sign(request)*1e-6;
   assert.ok(slip(body,contact,automatic+next)>bound-1e-10,JSON.stringify({i,got,request,bound}));
  }
 }
});
test('M9.26 frame reorientation exactly matches full contact observation without another surface sample',()=>{
 const {body}=fixture(20,5,.2);
 for(const d of [-M,-.1,0,.3,M]){
  const before=deriveContactObservation(p.guide,p.height,p.surface,body,v.profile.frontStation,0,v.course.segmentIndex);
  assert.deepEqual(reorientContactObservation(before,body,d),deriveContactObservation(p.guide,p.height,p.surface,body,v.profile.frontStation,d,v.course.segmentIndex));
 }
});
test('M9.26 unsupported, frictionless and invalid projections pass input; existing alignment is never worsened',()=>{
 const {body,contact}=fixture(30,15),base=-.2,request=.3;
 for(const c of [{...contact,forceTransmitting:false},{...contact,tireFrameValid:false},
  {...contact,surface:{...contact.surface,material:{...contact.surface.material,gripFactor:0}}},
  {...contact,surface:{...contact.surface,normal:body.right}}])assert.equal(limit(base,request,M,body,c,tire),request);
 for(const r of [-.2,.2]){
  const got=limit(base,r,M,body,contact,tire);
  assert.ok(slip(body,contact,base+got)<=Math.max(.08,slip(body,contact,base))+1e-10);
 }
});
test('M9.26 limiter consumes no wheel spin, brake, force objective, lookup table or iterative wheel solve',async()=>{
 const src=await readFile(new URL('../src/physics/steering-input-limiter.ts',import.meta.url),'utf8');
 assert.doesNotMatch(src,/solveWheelOmega|evaluateTireForce|\.omega|brake|frontUtilization|usefulLateralCapacity|yawRate|speedTable/);
 assert.match(src,/Math\.acos/);assert.match(src,/Math\.atan2/);
});
test('M9.26 all-nine actual substeps cut only input and retain automatic-plus-delivered target at three rates',()=>{
 for(const entry of VEHICLE_CATALOG)for(const hz of [60,120,240])for(const sign of [-1,1])for(const d of [12,18,20]){
  const q=createFlatProbe({profile:entry.profile,initialSpeed:30,torqueProtection:entry.torqueProtection});
  setArcadeVehicleSteeringOffsetMax(q.vehicle,d*DEG);
  let cut=false;
  for(let i=0;i<hz*2;i++){
   updateArcadeVehicle(q.guide,q.height,q.surface,q.vehicle,{steering:i<hz?sign:0,throttle:false,brake:false},1/hz);
   const c=q.vehicle.control;
   cut ||= Math.abs(c.requestedSteerOffset-c.deliveredSteerOffset)>1e-5;
   assert.ok(Number.isFinite(q.vehicle.speed));
   assert.ok(c.deliveredSteerOffset*c.requestedSteerOffset>=-1e-14);
   assert.ok(Math.abs(c.deliveredSteerOffset)<=Math.abs(c.requestedSteerOffset)+1e-14);
   assert.equal(c.targetSteerAngle,c.automaticSteerAngle+c.deliveredSteerOffset);
  }
  assert.ok(cut,`${entry.profile.id} D${d} exercised the limiter`);
  assert.ok(Math.abs(q.vehicle.control.requestedSteerOffset)<1e-12);
  assert.equal(q.vehicle.control.deliveredSteerOffset,0);
 }
});
test('M9.26 HUD distinguishes raw input, post-actuator reduction, automatic alignment and actual rack',()=>{
 const q=createFlatProbe(),c=q.vehicle.control;
 c.requestedSteerOffset=.2;c.deliveredSteerOffset=.05;c.automaticSteerAngle=-.3;c.actualSteerAngle=-.1;
 const before=structuredClone(c),model=createVehicleDebugHudModel('circuit',{steering:1,throttle:false,brake:false},q.vehicle);
 assert.equal(model.requestedSteering,1);assert.ok(model.automaticSteering<0);assert.ok(model.deliveredSteerOffset<model.requestedSteerOffset);
 const labels=[],rects=[];let color='';const ctx={font:'',textBaseline:'',strokeStyle:'',lineWidth:1,lineJoin:'',
  set fillStyle(v){color=v;},get fillStyle(){return color;},fillText(t){labels.push(t);},strokeText(){},
  fillRect(x,y,w,h){rects.push({color,x,y,w,h});},strokeRect(){},beginPath(){},arc(){},moveTo(){},lineTo(){},stroke(){}};
 drawVehicleControlGraphics(ctx,model,0,0);
 for(const t of ['INPUT','USER','AUTO','RACK','RED=CUT'])assert.ok(labels.includes(t));
 assert.ok(rects.some(r=>r.color==='#ff535d'&&r.y===24&&r.w>0));
 assert.deepEqual(c,before);
});
