import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { compileRasterPath } from '../dist/core/course.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import { HeightProfile } from '../dist/visual/height-profile.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { compileArcadeVehicleProfile } from '../dist/physics/vehicle-profiles.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from '../dist/browser/tire-friction-selection.js';
import { createVehicleDebugHudModel, drawVehicleDebugHud, drawVehicleControlGraphics,
  HUD_PROTECTION_CUT_COLOR, HUD_DELIVERED_COLOR, HUD_INPUT_ACCEL_COLOR, HUD_INPUT_BRAKE_COLOR,
} from '../dist/browser/vehicle-debug-hud.js';

const close = (a,b) => assert.ok(Math.abs(a-b)<1e-12, `${a} != ${b}`);
const neutral = { steering:0, throttle:0, brake:0 };
function fixture(entry=VEHICLE_CATALOG[0], profile=entry.profile) {
  const guide=compileGuidePath(compileRasterPath([{x:0,z:0},{x:0,z:10000}]),{lMax:500,mMin:.25,dCam:5});
  const height=new HeightProfile(guide.length,[{s:0,y:0},{s:guide.length,y:0}]);
  const surface=new SurfaceMap(guide.length,[{sStart:0,name:'HUD observation',bands:[{lMin:-500,lMax:500,type:'ASPHALT'}]}]);
  const vehicle=createArcadeVehicle(profile,guide,height,surface,1000,0,15,{},DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,entry.torqueProtection);
  return {vehicle,guide,height,surface};
}
function hud(v,input=neutral) {return createVehicleDebugHudModel('linear',input,v);}
function drive(v,a,total,frontDelivered,rearDelivered) {
  const f=v.profile.frontDriveTorqueFraction;
  Object.assign(v.control,{throttleActuator:a,requestedFrontDriveTorque:total*f,requestedRearDriveTorque:total*(1-f),
    frontDriveTorque:frontDelivered,rearDriveTorque:rearDelivered});
}
function brake(v,b,frontDelivered,rearDelivered) {
  Object.assign(v.control,{brakeActuator:b,requestedFrontBrakeTorque:b*v.profile.frontBrakeTorqueMax,
    requestedRearBrakeTorque:b*v.profile.rearBrakeTorqueMax,frontBrakeTorque:frontDelivered,rearBrakeTorque:rearDelivered});
}
function canvasRecorder() {
  const rects=[],texts=[],boxes=[];
  const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,lineJoin:'',font:'',textBaseline:'',
    save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},arc(){},stroke(){},fill(){},
    fillRect(x,y,w,h){rects.push({x,y,w,h,color:this.fillStyle});},
    strokeRect(x,y,w,h){boxes.push({x,y,w,h});},strokeText(){},
    fillText(text,x,y){texts.push({text,x,y,color:this.fillStyle});}};
  return {ctx,rects,texts,boxes};
}

test('M9.22 input meters preserve exact analog requests, digital shorthand and exclusivity',()=>{
  const {vehicle:v}=fixture();
  assert.equal(hud(v,{...neutral,throttle:.25}).requestedThrottle,.25);
  assert.equal(hud(v,{...neutral,brake:.37}).requestedBrake,.37);
  assert.equal(hud(v,{...neutral,throttle:true}).requestedThrottle,1);
  assert.equal(hud(v,{...neutral,brake:false}).requestedBrake,0);
  for(const input of [{throttle:.2,brake:.2},{throttle:NaN,brake:0},{throttle:0,brake:1.01}])
    assert.throws(()=>hud(v,{steering:0,...input}),RangeError);
});

test('M9.22 AWD 45:55 shares a full-throttle scale and does not renormalize delivered total',()=>{
  const entry=VEHICLE_CATALOG[4],profile=compileArcadeVehicleProfile({...entry.profile,frontDriveTorqueFraction:.45});
  const {vehicle:v}=fixture(entry,profile);
  drive(v,1,1000,450,550);let h=hud(v,{...neutral,throttle:1});
  close(h.frontDrive.requested,.45);close(h.rearDrive.requested,.55);
  close(h.frontDrive.delivered,.45);close(h.rearDrive.delivered,.55);
  close(h.frontDrive.limit,.45);close(h.rearDrive.limit,.55);
  drive(v,.5,500,225,275);h=hud(v,{...neutral,throttle:.5});
  close(h.frontDrive.delivered,.225);close(h.rearDrive.delivered,.275);
  drive(v,1,1000,225,550);h=hud(v,{...neutral,throttle:1});
  close(h.frontDrive.delivered,.225);close(h.rearDrive.delivered,.55);
  close(h.frontDrive.requested-h.frontDrive.delivered,.225);
  close(h.frontDrive.delivered+h.rearDrive.delivered,.775);
});

for(const index of [0,3,4,5]) test(`M9.22 ${VEHICLE_CATALOG[index].profile.id} drive bars derive authored split without identity branches`,()=>{
  const {vehicle:v}=fixture(VEHICLE_CATALOG[index]),f=v.profile.frontDriveTorqueFraction;
  drive(v,.4,400,400*f,400*(1-f));const h=hud(v);
  close(h.frontDrive.delivered,.4*f);close(h.rearDrive.delivered,.4*(1-f));
  close(h.frontDrive.limit+h.rearDrive.limit,1);
});

test('M9.22 brake percentages use fixed sum of front/rear torque capacity, including 70:30 cuts',()=>{
  const {vehicle:v}=fixture(VEHICLE_CATALOG[5]);
  assert.equal(v.profile.frontBrakeTorqueMax,700);assert.equal(v.profile.rearBrakeTorqueMax,300);
  brake(v,1,500,100);let h=hud(v,{...neutral,brake:1});
  close(h.frontBrake.limit,.7);close(h.rearBrake.limit,.3);
  close(h.frontBrake.requested,.7);close(h.rearBrake.requested,.3);
  close(h.frontBrake.delivered,.5);close(h.rearBrake.delivered,.1);
  close(h.frontBrake.requested-h.frontBrake.delivered,.2);
  close(h.rearBrake.requested-h.rearBrake.delivered,.2);
  brake(v,.5,350,150);h=hud(v,{...neutral,brake:.5});
  close(h.frontBrake.delivered,.35);close(h.rearBrake.delivered,.15);
});

test('M9.22 lag and residual-pedal overlap are distinct from protection cuts',()=>{
  const {vehicle:v}=fixture();
  drive(v,.2,200,0,200);let h=hud(v,{...neutral,throttle:1});
  close(h.requestedThrottle,1);close(h.rearDrive.delivered,.2);
  close(h.rearDrive.requested-h.rearDrive.delivered,0);
  brake(v,.1,v.profile.frontBrakeTorqueMax*.1,v.profile.rearBrakeTorqueMax*.1);
  h=hud(v,{...neutral,brake:1});assert.equal(h.requestedThrottle,0);
  close(h.rearDrive.delivered,.2);close(h.frontBrake.delivered+h.rearBrake.delivered,.1);
  const c=canvasRecorder();drawVehicleControlGraphics(c.ctx,h,3,79);
  assert.equal(c.rects.filter(r=>r.color===HUD_PROTECTION_CUT_COLOR && r.y>90).length,0);
});

test('M9.22 zero requests/full engine cut and zero brake capacity have finite empty bars',()=>{
  const {vehicle:v}=fixture();drive(v,1,0,0,0);
  const h=hud(v,{...neutral,throttle:1});
  assert.equal(h.requestedThrottle,1);assert.equal(h.frontDrive.requested+h.rearDrive.requested,0);
  for(const m of [h.frontDrive,h.rearDrive,h.frontBrake,h.rearBrake])assert.equal(m.delivered,0);
  const p=compileArcadeVehicleProfile({...v.profile,frontBrakeTorqueMax:0,rearBrakeTorqueMax:0});
  const z=hud(fixture(VEHICLE_CATALOG[0],p).vehicle,{...neutral,brake:1});
  assert.deepEqual(z.frontBrake,{requested:0,delivered:0,limit:0});assert.deepEqual(z.rearBrake,z.frontBrake);
});

test('M9.22 normalization is from one torque sample, independent of post-sample gear/RPM/ENG and load caches',()=>{
  const {vehicle:v}=fixture();drive(v,.6,1200,0,600);brake(v,.2,500,100);
  const a=hud(v);
  v.powertrain.engineRpm=6800;v.powertrain.gear=5;v.powertrain.engineTorqueMultiplier=4;
  v.frontNormalLoad=0;v.rearNormalLoad=123456;
  const b=hud(v);
  for(const key of ['frontDrive','rearDrive','frontBrake','rearBrake'])assert.deepEqual(a[key],b[key]);
});

test('M9.22 red paints exactly delivered-to-request interval and leaves unused capacity empty',()=>{
  const {vehicle:v}=fixture(VEHICLE_CATALOG[5]);brake(v,1,500,100);
  const c=canvasRecorder();drawVehicleControlGraphics(c.ctx,hud(v,{...neutral,brake:.5}),3,79);
  const cuts=c.rects.filter(r=>r.color===HUD_PROTECTION_CUT_COLOR && r.y>90);
  assert.equal(cuts.length,2);
  close(cuts[0].x,3+170+2+.5*54);close(cuts[0].w,.2*54);assert.equal(cuts[0].y,79+22+2);
  close(cuts[1].x,3+170+2+.1*54);close(cuts[1].w,.2*54);assert.equal(cuts[1].y,79+36+2);
  const delivered=c.rects.filter(r=>r.color===HUD_DELIVERED_COLOR&&r.x===175&&r.w>0);
  close(delivered[0].w,.5*54);close(delivered[1].w,.1*54);
  assert.ok(c.texts.some(t=>t.text==='RED=CUT'));
});

test('M9.22 input fill is proportional, not a positive-value ON/OFF indicator',()=>{
  const {vehicle:v}=fixture();
  for(const [axis,color] of [['throttle',HUD_INPUT_ACCEL_COLOR],['brake',HUD_INPUT_BRAKE_COLOR]]){
    const c=canvasRecorder();drawVehicleControlGraphics(c.ctx,hud(v,{...neutral,[axis]:.25}),3,79);
    const active=c.rects.filter(r=>r.color===color&&r.w>0);
    assert.equal(active.length,1);close(active[0].w,.25*54);
  }
});

test('M9.22 six pedal meters plus retained steering fit 320x240 without a background panel',()=>{
  const {vehicle:v}=fixture(VEHICLE_CATALOG[5]);brake(v,1,500,100);
  const c=canvasRecorder();drawVehicleDebugHud(c.ctx,'linear',{...neutral,brake:1},v);
  assert.equal(c.boxes.length,8);assert.equal(c.texts.filter(t=>t.text==='F').length,2);
  assert.equal(c.texts.filter(t=>t.text==='R').length,2);
  for(const r of [...c.rects,...c.boxes]){
    assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=320&&r.y+r.h<=240,JSON.stringify(r));
    assert.ok(r.w<=60&&r.h<=10,'no opaque panel');
  }
});

for(const entry of VEHICLE_CATALOG) test(`M9.22 ${entry.profile.id} live protection telemetry remains read-only and budget-consistent`,()=>{
  const p=fixture(entry),v=p.vehicle;
  for(let tick=0;tick<180;tick++){
    const input={steering:0,throttle:tick<60,brake:tick>=90};
    updateArcadeVehicle(p.guide,p.height,p.surface,v,input,1/60);
    const before=JSON.stringify(v),h=hud(v,input),c=canvasRecorder();
    drawVehicleDebugHud(c.ctx,'linear',input,v);assert.equal(JSON.stringify(v),before);
    for(const key of ['frontDrive','rearDrive','frontBrake','rearBrake']){
      const m=h[key];assert.ok(Number.isFinite(m.requested)&&0<=m.delivered&&m.delivered<=m.requested&&m.requested<=m.limit&&m.limit<=1,key);
    }
    const b=v.profile.frontBrakeTorqueMax+v.profile.rearBrakeTorqueMax;
    close(h.frontBrake.delivered,v.control.frontBrakeTorque/b);
    close(h.rearBrake.delivered,v.control.rearBrakeTorque/b);
    const d=v.control.requestedFrontDriveTorque+v.control.requestedRearDriveTorque;
    if(d>0)close(h.frontDrive.delivered+h.rearDrive.delivered,v.control.throttleActuator*(v.control.frontDriveTorque+v.control.rearDriveTorque)/d);
  }
});

test('M9.22 HUD removes ambiguous actuator-only pedal fields and adds no physical control path',async()=>{
  const s=await readFile(new URL('../src/browser/vehicle-debug-hud.ts',import.meta.url),'utf8');
  assert.doesNotMatch(s,/actualThrottle|actualBrake|drawPedalIndicator|input\.throttle\s*\?\s*1/);
  assert.doesNotMatch(s,/updateArcadeVehicle|updateAutomaticPowertrain|solveWheelOmega|solveProtectedWheelPair|globalAlpha|setTimeout/);
  assert.doesNotMatch(s,/vehicle\.(?:control|actuator|powertrain)\.\w+\s*=/);
  assert.match(s,/normalizedPedalRequest\(input\.throttle\)/);
});
