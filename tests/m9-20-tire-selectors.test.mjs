import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {BROWSER_TIRE_AXES as axes, DEFAULT_BROWSER_TIRE_CHARACTERISTICS as seed,
 DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION as initial, browserTireCalibrationForAxis,
 stepBrowserTireCalibration,formatTireCalibrationSelector} from '../dist/browser/tire-friction-selection.js';
import {compileTireCharacteristics as compile,createArcadeTireFrictionCalibration as pair,
 readTireCharacteristics as read,setArcadeVehicleTireFrictionCalibration as set} from '../dist/physics/tire-friction-calibration.js';
import {mountBrowserTireFrictionControls} from '../dist/browser/tire-friction-controls.js';
import {mountBrowserEnginePowerControls} from '../dist/browser/engine-power-controls.js';
import {createFlatProbe,runProbe,directInput} from '../tools/drift-control-probe.mjs';
import {createArcadeVehicle} from '../dist/physics/arcade-vehicle-physics.js';
import {createM5RecoveryState,recoverM5Vehicle} from '../dist/gameplay/recovery.js';
import {VEHICLE_CATALOG} from '../dist/vehicle/vehicle-catalog.js';
import {SelectorElement,selectorDocument} from './helpers/fake-selector-dom.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-11,`${a} ${b}`);

test('M9.20 approved five-axis defaults and registry are explicit and unique',()=>{
 assert.deepEqual(seed,{gripX:2.5,peakSlipX:.08,gripY:2.2,peakSlipY:.10,knee:.74});
 assert.deepEqual(axes.map(a=>[a.id,a.min,a.max,a.step,a.code]),[
 ['GX',50,400,5,'KeyH'],['PX',1,60,1,'KeyJ'],['GY',50,400,5,'KeyG'],['PY',1,60,1,'KeyL'],['KNEE',10,95,1,'KeyN']]);
 assert.equal(formatTireCalibrationSelector(initial),'GX2.50 PX8% GY2.20 PY10% KN0.74');
});
for(const axis of axes) test(`M9.20 ${axis.id} traverses its full grid in both directions preserving the other four values`,()=>{
 for(const dir of [-1,1]){
 let current=pair(compile({...seed,[axis.field]:axis.min/100}));const values=new Set();
 const count=(axis.max-axis.min)/axis.step+1;
 for(let j=0;j<count;j++){
 const old=read(current.front),next=stepBrowserTireCalibration(axis.id,dir,current);
 values.add(Math.round(100*next[axis.field]));
 for(const field of Object.keys(seed))if(field!==axis.field)near(old[field],next[field]);
 current=pair(compile(next));assert.equal(current.front,current.rear);
 }
 assert.equal(values.size,count);near(read(current.front)[axis.field],axis.min/100);
 }
});
for(const axis of axes) test(`M9.20 ${axis.id} direct off-grid and out-of-range browser requests reject`,()=>{
 for(const v of [(axis.min-axis.step)/100,(axis.max+axis.step)/100,(axis.min+axis.step/2)/100,NaN,Infinity])
 assert.throws(()=>browserTireCalibrationForAxis(axis.id,v,initial),RangeError);
});
test('M9.20 every endpoint combination is admissible, without old S<=G filtering',()=>{
 for(let mask=0;mask<32;mask++){
 let c=initial;
 for(let i=0;i<axes.length;i++){
 const a=axes[i];c=pair(compile(browserTireCalibrationForAxis(a.id,(mask&(1<<i)?a.max:a.min)/100,c)));
 }
 for(const a of axes)assert.ok(Number.isFinite(read(c.front)[a.field]));
 }
});
test('M9.20 changing knee preserves displayed Px/Py and Gx/Gy, not compiled k',()=>{
 const next=pair(compile(browserTireCalibrationForAxis('KNEE',.9,initial)));
 for(const f of ['gripX','gripY','peakSlipX','peakSlipY'])near(read(next.front)[f],seed[f]);
 assert.notEqual(next.front.kX,initial.front.kX);assert.notEqual(next.front.kY,initial.front.kY);
});
test('M9.20 off-grid profile P steps to nearest adjacent selectable value without accumulating error',()=>{
 const c=pair(compile({...seed,peakSlipX:.1745}));
 near(stepBrowserTireCalibration('PX',1,c).peakSlipX,.18);
 near(stepBrowserTireCalibration('PX',-1,c).peakSlipX,.17);
});
test('M9.20 +/- and shifted keyboard share the same five linked settings on the live vehicle',()=>{
 let v=createFlatProbe().vehicle;const host=new SelectorElement();
 const ctl=mountBrowserTireFrictionControls(host,()=>v,selectorDocument);
 assert.equal(host.children.length,5);
 for(let i=0;i<axes.length;i++){
 const old=read(v.tireFrictionCalibration.front),a=axes[i],group=host.children[i];
 assert.equal(group.children.length,3);assert.match(group.children[0].getAttribute('aria-label'),/Decrease/);
 group.children[2].click();near(read(v.tireFrictionCalibration.front)[a.field],old[a.field]+a.step/100);
 assert.equal(ctl.handleKey(a.code,true),true);near(read(v.tireFrictionCalibration.front)[a.field],old[a.field]);
 assert.ok(group.children[1].textContent.length>0);assert.ok(group.children[1].getAttribute('title'));
 }
 const previous=v;v=createFlatProbe().vehicle;
 ctl.handleKey('KeyH');near(v.tireFrictionCalibration.front.muX,2.55);near(previous.tireFrictionCalibration.front.muX,2.5);
 assert.equal(ctl.handleKey('KeyK'),false);
});
test('M9.20 engine button remains independent of five tire groups and their refreshes',()=>{
 const v=createFlatProbe().vehicle,host=new SelectorElement();
 const tires=mountBrowserTireFrictionControls(host,()=>v,selectorDocument);
 mountBrowserEnginePowerControls(host,()=>v,selectorDocument);const engine=host.children[5];
 tires.handleKey('KeyG');assert.equal(host.children[5],engine);engine.click();assert.equal(v.powertrain.engineTorqueMultiplier,1.5);
 near(v.tireFrictionCalibration.front.muY,2.25);
});
test('M9.20 live selection changes only calibration and remains atomic on invalid request',()=>{
 const p=createFlatProbe(),v=p.vehicle;runProbe(p,.2,()=>directInput(.1,.2));
 const before=JSON.parse(JSON.stringify(v));set(v,{...seed,knee:.6});
 const after=JSON.parse(JSON.stringify(v));delete before.tireFrictionCalibration;delete after.tireFrictionCalibration;
 assert.deepEqual(after,before);
 const c=v.tireFrictionCalibration;assert.throws(()=>set(v,{...seed,peakSlipY:0}));assert.equal(v.tireFrictionCalibration,c);
});
test('M9.20 recovery and all-nine vehicle replacement preserve selections without sharing mutable state',()=>{
 const p=createFlatProbe(),v=p.vehicle;set(v,{...seed,gripX:.75,gripY:3,knee:.6});
 const c=v.tireFrictionCalibration;
 recoverM5Vehicle(createM5RecoveryState(v),p.guide,p.height,p.surface,v);
 assert.equal(v.tireFrictionCalibration,c);
 for(const {profile}of VEHICLE_CATALOG){
 const next=createArcadeVehicle(profile,p.guide,p.height,p.surface,10000,0,15,{},c);
 assert.deepEqual(next.tireFrictionCalibration,c);assert.notEqual(next.tireFrictionCalibration,c);
 set(next,seed);assert.equal(v.tireFrictionCalibration,c);
 }
});
test('M9.20 all composition roots use one registry and Shift+key without changing ENG or steering',async()=>{
 for(const name of ['main.ts','main-linear.ts','main-circuit.ts']){
 const src=await readFile(new URL(`../src/${name}`,import.meta.url),'utf8');
 assert.match(src,/tireFrictionControls\.handleKey\(event\.code, event\.shiftKey\)/);
 assert.match(src,/const tireFrictionCalibration = vehicle\.tireFrictionCalibration/);
 assert.match(src,/DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION/);
 }
 const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(css,/repeat\(auto-fit, minmax\(108px, 1fr\)\)/);
});
