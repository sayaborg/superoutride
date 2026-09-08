/** LP-only falsification. Open-loop replays; no recovery, pose correction or diagnostic controller. */
import {writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createFlatProbe,observeProbe,directInput} from './drift-control-probe.mjs';
import {createM93TsukubaCourse2000Runtime} from '../dist/dev/m9-3-tsukuba-circuit.js';
import {createM96FiscoRuntime} from '../dist/dev/m9-6-fisco-circuit.js';
import {createArcadeVehicle,updateArcadeVehicle} from '../dist/physics/arcade-vehicle-physics.js';
import {compileTireCharacteristics,createArcadeTireFrictionCalibration} from '../dist/physics/tire-friction-calibration.js';
import {DEFAULT_BROWSER_TIRE_CHARACTERISTICS as seed} from '../dist/browser/tire-friction-selection.js';
import {DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER as M,DEFAULT_BROWSER_STEERING_OFFSET as D,
 DEFAULT_BROWSER_STEERING_RESPONSE_RATE as rate} from '../dist/browser/steering-calibration-selection.js';
import {DEFAULT_VEHICLE_CATALOG_ENTRY as entry} from '../dist/vehicle/vehicle-catalog.js';
import {sampleRivalDrivingInput} from '../dist/gameplay/rival-driver.js';
export const EXPONENTS=[2,3,4,6,8];
export const SCENARIOS=[
 {name:'straight-acceleration',speed:15,seconds:6,input:t=>directInput(0,1)},
 {name:'straight-braking',speed:45,seconds:6,input:t=>directInput(0,0,1)},
 {name:'coasting-corner',speed:45,seconds:8,input:t=>directInput(.35,0)},
 {name:'power-on-corner',speed:45,seconds:8,input:t=>directInput(.35,.8)},
 {name:'trail-braking',speed:45,seconds:8,input:t=>directInput(.35,0,Math.max(0,.6*(1-t/4)))},
 {name:'drift-entry',speed:55.55555555555556,seconds:5,input:t=>directInput(.65,t<1?.2:0,t>=1&&t<1.7?.35:0)},
 {name:'drift-sustain',speed:55.55555555555556,seconds:12,input:t=>directInput(t<2?.65:.4,t<1?.2:t<2?0:.5+.3*Math.sin((t-2)*Math.PI/3),t>=1&&t<1.7?.35:0)},
 {name:'drift-correction-exit',speed:55.55555555555556,seconds:12,input:t=>t<2?directInput(.65,t<1?.2:0,t>=1&&t<1.7?.35:0):t<3?directInput(-.2,.3):t<6?directInput(.2,.5):directInput(0,.4)},
];
const calibration=p=>createArcadeTireFrictionCalibration(compileTireCharacteristics({...seed,combinedSlipExponent:p}));
function createProbe(scenario,p){
 if(!scenario.runtime)return createFlatProbe({initialSpeed:scenario.speed,calibration:calibration(p),torqueProtection:entry.torqueProtection});
 const w=scenario.runtime.window;
 return {guide:w.guide,height:w.height,surface:w.surface,vehicle:createArcadeVehicle(entry.profile,w.guide,w.height,w.surface,95,0,45,
  {maxRoadWheelSteer:M,steeringOffsetMax:D,steeringActuatorResponse:{applyRate:rate,releaseRate:rate}},calibration(p),entry.torqueProtection)};
}
function sample(probe,t,input,previous,dt){
 const v=probe.vehicle,c=v.control,speed=Math.hypot(previous.x,previous.z);
 const ax=(v.velocityX-previous.x)/dt,az=(v.velocityZ-previous.z)/dt;
 const lateralAcceleration=speed>0?(previous.z*ax-previous.x*az)/speed:0;
 return {...observeProbe(probe,t),steering:input.steering,throttle:Number(input.throttle),brake:Number(input.brake),
  actualThrottle:v.actuator.throttle,actualBrake:v.actuator.brake,
  frontDriveTorque:c.frontDriveTorque,rearDriveTorque:c.rearDriveTorque,
  frontBrakeTorque:c.frontBrakeTorque,rearBrakeTorque:c.rearBrakeTorque,
  requestedFrontBrakeTorque:c.requestedFrontBrakeTorque,requestedRearBrakeTorque:c.requestedRearBrakeTorque,
  lateralAcceleration,curvature:speed>0?lateralAcceleration/speed**2:0,s:v.course.s,l:v.course.l};
}
export function replay(scenario,p,{hz=120,inputs}={}){
 const probe=createProbe(scenario,p),rows=[],captured=[],dt=1/hz;
 let error=null,maxAbsBeta=0,maxAbsL=0,distance=0,steps=0;
 const count=inputs?.length??Math.round(scenario.seconds*hz);
 for(let n=0;n<count;n++){
  const input=inputs?.[n]??scenario.input(n/hz,probe);
  captured.push(input);const v=probe.vehicle,previous={x:v.velocityX,z:v.velocityZ};
  try{
   updateArcadeVehicle(probe.guide,probe.height,probe.surface,v,input,dt);
   if(![v.x,v.y,v.z,v.speed,v.yawRate,v.frontWheelOmega,v.rearWheelOmega].every(Number.isFinite))throw new Error('nonfinite vehicle state');
   steps++;distance+=v.speed*dt;maxAbsBeta=Math.max(maxAbsBeta,Math.abs(Math.atan2(v.lateralSpeed,v.longitudinalSpeed)*180/Math.PI));maxAbsL=Math.max(maxAbsL,Math.abs(v.course.l));
   if((n+1)%(hz/10)===0)rows.push(sample(probe,(n+1)/hz,input,previous,dt));
   if(!inputs&&scenario.runtime&&v.course.s>=scenario.runtime.window.topology.lapLength+25)break;
  }catch(e){error=`${(n/hz).toFixed(6)}s: ${e.message}`;break;}
 }
 const v=probe.vehicle;
 return {name:scenario.name,p,hz,seconds:steps/hz,error,exitSpeed:v.speed,maxAbsBeta,maxAbsL,distance,
  finalS:v.course.s,finalX:v.x,finalZ:v.z,rows,inputs:captured};
}
export function runComparison({hz=120,courses=true}={}){
 const scenarios=[...SCENARIOS];
 if(courses)for(const [name,make]of [['Tsukuba',createM93TsukubaCourse2000Runtime],['FISCO',createM96FiscoRuntime]])
  scenarios.push({name,runtime:make(),seconds:180,input:(t,p)=>sampleRivalDrivingInput(p.guide,p.vehicle,0)});
 const runs=[],inputTraces={};
 for(const scenario of scenarios){
  const baseline=replay(scenario,2,{hz}),inputs=baseline.inputs;inputTraces[scenario.name]=inputs;
  for(const p of EXPONENTS){
   const r=p===2?baseline:replay(scenario,p,{hz,inputs});delete r.inputs;runs.push(r);
  }
 }
 return {milestone:'M9.23',meaning:'Matched open-loop LP-only replay; course inputs recorded once at p=2. Not human handling or autonomous lap acceptance.',
  profile:entry.profile.id,characteristics:seed,steering:{M,D,rate},engine:1,protection:entry.torqueProtection,hz,inputTraces,runs};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const out=process.argv[2]??'/private/tmp/combined-slip';
 const report=runComparison();
 await writeFile(out+'.json.gz',gzipSync(JSON.stringify(report)+'\n'));
 const keys=['name','p','seconds','error','exitSpeed','maxAbsBeta','maxAbsL','distance','finalS','finalX','finalZ'];
 await writeFile(out+'.csv',[keys.join(','),...report.runs.map(r=>keys.map(k=>JSON.stringify(r[k]??'')).join(','))].join('\n')+'\n');
 console.log(JSON.stringify(report.runs.map(({rows,...r})=>r),null,2));
}
