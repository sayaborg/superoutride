/** Input-only comparison of steering policies. No state/force correction or new runtime authority. */
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createTerrainProbe} from './torque-protection-terrain-probe.mjs';
import {forkProbe} from './drift-control-probe.mjs';
import {VEHICLE_CATALOG} from '../dist/vehicle/vehicle-catalog.js';
import {updateArcadeVehicle} from '../dist/physics/arcade-vehicle-physics.js';
import {setArcadeVehicleSteeringOffsetMax} from '../dist/physics/vehicle-calibration.js';

const DEG=180/Math.PI;
export const STEERING_STOP_CASES=Object.freeze([
 {name:'smallCoast',u:.15},{name:'halfCoast',u:.5},{name:'fullCoast',u:1},
 {name:'fullThrottle',u:1,pedal:'throttle'},{name:'fullBrakeHold',u:1,pedal:'brake'},
 {name:'fullBrakeRelease',u:1,pedal:'brake',release:1.5},{name:'reversal',u:1,reverse:1.5},
]);
export function runSteeringStopCase(parent,scenario,{hz=120,direction=1,update=updateArcadeVehicle}={}){
 if(![60,120,240].includes(hz)||![-1,1].includes(direction)||!STEERING_STOP_CASES.includes(scenario))throw new RangeError('invalid steering probe');
 const p=forkProbe(parent),v=p.vehicle,dt=1/hz;
 let earlyLateral=0,peakBetaAbove5=0,recoveryBetaAbove5=0,cutSeconds=0,maxInputStepDeg=0,lastE=0,unsupportedSeconds=0,at3;
 for(let i=0;i<6*hz;i++){
  const t=i*dt,steering=t<.5||t>=3||t>=(scenario.release??Infinity)?0:direction*scenario.u*(t>=(scenario.reverse??Infinity)?-1:1);
  const input={steering,throttle:scenario.pedal==='throttle'&&t>=1.5&&t<3?1:0,brake:scenario.pedal==='brake'&&t>=1.5&&t<3?1:0};
  const vx=v.velocityX,vz=v.velocityZ,speed=Math.hypot(vx,vz);
  update(p.guide,p.height,p.surface,v,input,dt);
  if(![v.speed,v.yawRate,v.frontSteerAngle].every(Number.isFinite))throw new Error('nonfinite steering probe');
  const beta=Math.abs(Math.atan2(v.lateralSpeed,v.longitudinalSpeed)*DEG),c=v.control;
  if(v.speed>5)peakBetaAbove5=Math.max(peakBetaAbove5,beta);
  if(t>=4&&v.speed>5)recoveryBetaAbove5=Math.max(recoveryBetaAbove5,beta);
  if(t>=.5&&t<1.5&&speed>1)earlyLateral+=(vz*(v.velocityX-vx)-vx*(v.velocityZ-vz))/speed;
  cutSeconds+=Math.abs(c.requestedSteerOffset-c.deliveredSteerOffset)>1e-6?dt:0;
  maxInputStepDeg=Math.max(maxInputStepDeg,Math.abs(c.deliveredSteerOffset-lastE)*DEG);lastE=c.deliveredSteerOffset;
  unsupportedSeconds+=!v.supported?dt:0;
  if(i===3*hz-1)at3={kmh:v.speed*3.6,absBeta:beta};
 }
 return {earlyMeanLateralAcceleration:earlyLateral,peakBetaAbove5,recoveryBetaAbove5,cutSeconds,maxInputStepDeg,unsupportedSeconds,at3};
}
export function runMatchedSteeringBrake(parent,update=updateArcadeVehicle,hz=120){
 const p=forkProbe(parent),v=p.vehicle;let peakBetaAbove15=0,peakAt=null;
 for(let i=0;i<hz*4.5;i++){
  update(p.guide,p.height,p.surface,v,{steering:i<hz*1.5?1:0,throttle:0,brake:i<hz*1.5?1:0},1/hz);
  const beta=Math.abs(Math.atan2(v.lateralSpeed,v.longitudinalSpeed)*DEG);
  if(v.speed>15&&beta>peakBetaAbove15){peakBetaAbove15=beta;peakAt={t:(i+1)/hz,kmh:v.speed*3.6};}
 }
 return {peakBetaAbove15,peakAt};
}
async function main(){
 let baselinePath,out;
 for(let i=2;i<process.argv.length;i++){
  if(process.argv[i]==='--baseline')baselinePath=process.argv[++i];
  else if(process.argv[i]==='--out')out=process.argv[++i];
  else throw new RangeError('expected --baseline DIST or --out JSON');
 }
 const baseline=baselinePath?(await import(pathToFileURL(resolve(baselinePath,'physics/arcade-vehicle-physics.js')).href)).updateArcadeVehicle:null;
 const pairs=[];
 for(const entry of VEHICLE_CATALOG)for(const grip of [1,.25])for(const d of [12,20])for(const scenario of STEERING_STOP_CASES){
  const parent=createTerrainProbe(entry,{grip,speed:30});setArcadeVehicleSteeringOffsetMax(parent.vehicle,d/DEG);
  pairs.push({id:entry.profile.id,grip,d,scenario:scenario.name,current:runSteeringStopCase(parent,scenario),...(baseline?{baseline:runSteeringStopCase(parent,scenario,{update:baseline})}:{})});
 }
 const refinements=[];
 for(const hz of [60,120,240])for(const direction of [-1,1]){
  const parent=createTerrainProbe(VEHICLE_CATALOG[0],{speed:60});setArcadeVehicleSteeringOffsetMax(parent.vehicle,20/DEG);
  const scenario=STEERING_STOP_CASES.find(x=>x.name==='fullBrakeHold');
  refinements.push({hz,direction,current:runSteeringStopCase(parent,scenario,{hz,direction}),...(baseline?{baseline:runSteeringStopCase(parent,scenario,{hz,direction,update:baseline})}:{})});
 }
 const parent=createTerrainProbe(VEHICLE_CATALOG.find(e=>e.profile.id==='VFR750R'),{grip:.25,speed:30});
 // One identical, ordinarily reached state for all post-prefix policies and step refinements.
 const prefixUpdate=baseline??updateArcadeVehicle;
 for(let i=0;i<180;i++)prefixUpdate(parent.guide,parent.height,parent.surface,parent.vehicle,{steering:i<60?0:1,throttle:0,brake:0},1/120);
 const matched=[60,120,240].map(hz=>({hz,current:runMatchedSteeringBrake(parent,updateArcadeVehicle,hz),...(baseline?{baseline:runMatchedSteeringBrake(parent,baseline,hz)}:{})}));
 const report={node:process.version,scope:'Fixed scripted inputs, not a force optimum or handling certification. Velocities in m/s except kmh; angles in degrees. Final substep control sampling.',pairs,refinements,matched};
 if(out)await writeFile(out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({pairs:pairs.length,refinements,matched},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e);process.exitCode=1;});
