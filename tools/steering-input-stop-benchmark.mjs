/** Same-input microbenchmark of two builds exposing the current limiter contract. */
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import os from 'node:os';
import {createFlatProbe} from './drift-control-probe.mjs';
import {arcadeBodyKinematics} from '../dist/physics/arcade-vehicle-physics.js';
import {deriveContactObservation} from '../dist/physics/vehicle-dynamics.js';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
if(!process.argv[2]) throw new Error('usage: node tools/steering-input-stop-benchmark.mjs REFERENCE_DIST [OUT_JSON]');
const {limitSteeringInput:baseline}=await import(pathToFileURL(resolve(process.argv[2],'physics/steering-input-limiter.js')).href);
import {limitSteeringInput as current} from '../dist/physics/steering-input-limiter.js';

const p=createFlatProbe({initialSpeed:30}),body=arcadeBodyKinematics(p.vehicle),tire=p.vehicle.tireFrictionCalibration.front;
const c=deriveContactObservation(p.guide,p.height,p.surface,body,p.vehicle.profile.frontStation,0,p.vehicle.course.segmentIndex);
let seed=73423;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
const cases={};
for(const group of ['active','lowSpeed','mixed','neutral']){
 cases[group]=Array.from({length:1024},()=>{
  const beta=(rng()-.5)*(group==='mixed'?5:.8),speed=group==='lowSpeed'?.001+rng()*.03:10+rng()*60;
  return [(rng()-.5)*.8,group==='neutral'?0:(rng()<.5?-1:1)*(.2+rng()*.14),body,
   {...c,forceTransmitting:true,tireFrameValid:true,reachVelocity:{x:speed*Math.sin(beta),y:0,z:speed*Math.cos(beta)}},tire];
 });
}
const fns={baseline,current},count=500000,rounds=11,report={node:process.version,arch:os.arch(),cpu:os.cpus()[0].model,count,rounds,groups:{}};
let checksum=0;
for(const [group,args] of Object.entries(cases)){
 const times=Object.fromEntries(Object.keys(fns).map(n=>[n,[]]));
 for(const fn of Object.values(fns))for(let i=0;i<100000;i++)checksum+=fn(...args[i&1023]);
 for(let round=0;round<rounds;round++){
  const order=round%2?Object.entries(fns).reverse():Object.entries(fns);
  for(const [name,fn] of order){
   const t0=performance.now();let sum=0;
   for(let i=0;i<count;i++)sum+=fn(...args[i&1023]);
   checksum+=sum;times[name].push(performance.now()-t0);
  }
 }
 report.groups[group]=Object.fromEntries(Object.entries(times).map(([k,v])=>[k,{medianMs:[...v].sort((a,b)=>a-b)[5],minMs:Math.min(...v),maxMs:Math.max(...v),samples:v}]));
}
report.checksum=checksum;
if(process.argv[3]) writeFileSync(process.argv[3],JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
