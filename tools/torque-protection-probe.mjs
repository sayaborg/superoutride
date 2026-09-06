/** Production solver, explicit input-only protection comparison. No state correction or recovery. */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFlatProbe } from './drift-control-probe.mjs';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { updateArcadeVehicle, arcadeBodyKinematics } from '../dist/physics/arcade-vehicle-physics.js';
import { deriveContactObservation } from '../dist/physics/vehicle-dynamics.js';
import { deriveTireSlip } from '../dist/physics/tire-wheel.js';
import { setEngineTorqueMultiplier } from '../dist/physics/automatic-powertrain.js';

export function runProtectionProbe(entry, { hz=120, seconds=6, kind='drive', speed=15, protectedRun=true,
  engine=1, capture=false }={}) {
  if (![60,120,240].includes(hz) || !Number.isFinite(seconds) || seconds<=0
    || !Number.isFinite(speed) || speed<0 || !['drive','brake'].includes(kind)) {
    throw new RangeError('probe requires hz=60/120/240, positive seconds, nonnegative speed and drive/brake kind');
  }
  const p=createFlatProbe({profile:entry.profile, initialSpeed:speed,
    torqueProtection:protectedRun?entry.torqueProtection:undefined});
  const v=p.vehicle;setEngineTorqueMultiplier(v.powertrain,engine);
  const rows=[];
  const out={id:entry.profile.id,hz,kind,protectedRun,initialSpeed:speed,engine,seconds:0,
    maxPitch:0,minPitch:0,frontLiftTime:0,rearLiftTime:0,minFrontLoad:Infinity,minRearLoad:Infinity,
    driveLimitedTime:0,brakeLimitedTime:0,supportLimitedTime:0,infeasibleTime:0,
    maxDriveSlip:0,maxBrakeSlip:0,distance:0,overturned:false,error:null};
  for(let tick=0;tick<Math.round(hz*seconds);tick++){
    const t=tick/hz;
    const input={steering:0,throttle:t>=.5&&kind==='drive',brake:t>=.5&&kind==='brake'};
    try { updateArcadeVehicle(p.guide,p.height,p.surface,v,input,1/hz); }
    catch(e){out.error=String(e);break;}
    const body=arcadeBodyKinematics(v);
    const f=deriveContactObservation(p.guide,p.height,p.surface,body,v.profile.frontStation,v.frontSteerAngle,v.course.segmentIndex);
    const r=deriveContactObservation(p.guide,p.height,p.surface,body,v.profile.rearStation,0,v.course.segmentIndex);
    const fs=deriveTireSlip(v.frontWheelOmega,f.effectiveRollingRadius,f.longitudinalVelocity,f.lateralVelocity,1);
    const rs=deriveTireSlip(v.rearWheelOmega,r.effectiveRollingRadius,r.longitudinalVelocity,r.lateralVelocity,1);
    const c=v.control;
    out.seconds=(tick+1)/hz;out.distance+=v.speed/hz;out.finalSpeed=v.speed;
    out.maxPitch=Math.max(out.maxPitch,v.pitch*180/Math.PI);out.minPitch=Math.min(out.minPitch,v.pitch*180/Math.PI);
    out.minFrontLoad=Math.min(out.minFrontLoad,f.normalLoad);out.minRearLoad=Math.min(out.minRearLoad,r.normalLoad);
    out.frontLiftTime+=Number(f.gap>1e-5&&r.normalLoad>0)/hz;
    out.rearLiftTime+=Number(r.gap>1e-5&&f.normalLoad>0)/hz;
    out.driveLimitedTime+=Number(c.deliveredDriveTorque<v.powertrain.outputDriveTorque-1e-6)/hz;
    out.brakeLimitedTime+=Number(c.frontBrakeTorque+c.rearBrakeTorque<c.requestedFrontBrakeTorque+c.requestedRearBrakeTorque-1e-6)/hz;
    out.supportLimitedTime+=Number(c.supportTorqueScale<1)/hz;
    out.infeasibleTime+=Number(!c.supportFeasible)/hz;
    out.maxDriveSlip=Math.max(out.maxDriveSlip,fs.sx,rs.sx);
    out.maxBrakeSlip=Math.max(out.maxBrakeSlip,-fs.sx,-rs.sx);
    if(capture)rows.push({t:out.seconds,speed:v.speed,pitch:v.pitch,pitchRate:v.pitchRate,frontQ:f.q,rearQ:r.q,
      frontQDot:f.qDot,rearQDot:r.qDot,frontLoad:f.normalLoad,rearLoad:r.normalLoad,
      gear:v.powertrain.gear,rpm:v.powertrain.engineRpm,
      beta:Math.atan2(v.lateralSpeed,v.longitudinalSpeed),yawRate:v.yawRate,
      frontSx:fs.sx,rearSx:rs.sx,frontSy:fs.sy,rearSy:rs.sy,...c});
    if(body.up.y<=0){out.overturned=true;break;}
    if(kind==='brake'&&t>.5&&v.speed<.5)break;
  }
  return capture?{...out,rows}:out;
}
async function main(){
 const args=process.argv.slice(2),get=(key,fallback)=>{let i=args.indexOf(key);return i<0?fallback:args[i+1];};
 const hz=Number(get('--hz',120)),out=get('--out',null),rows=[];
 for(const entry of VEHICLE_CATALOG)for(const kind of ['drive','brake'])for(const protectedRun of [false,true]){
  const x=runProtectionProbe(entry,{hz,kind,protectedRun});rows.push(x);
  console.log(JSON.stringify(x));
 }
 if(out)await writeFile(out,JSON.stringify({node:process.version,rows},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e);process.exitCode=1;});
