import {AIR,bounds,cells,inside,isAir,key,point,state} from './core.mjs';
export function mirrorState(block,axis){
 const a=axis==='x'?'east':'north',b=axis==='x'?'west':'south';
 // Reflection reverses handedness as well as facing and connection keys.
 return state(block.replace(/(east|west|north|south)(?==)|(?<=facing=)(east|west|north|south)/g,v=>v===a?b:v===b?a:v)
  .replace(/(?<=shape=)(inner|outer)_(left|right)/g,(_,shape,side)=>shape+'_'+(side==='left'?'right':'left'))
  .replace(/(?<=hinge=)(left|right)/g,v=>v==='left'?'right':'left'));
}
export function spatialQuality(map,quality={},projectBounds){
 const failures=[];
 for(const rule of quality.symmetry||[]){
  if(!['x','z'].includes(rule.axis)||!Number.isSafeInteger(rule.plane*2))throw Error('Symmetry needs axis x/z and integer or half-integer plane');
  const area=bounds(rule.bounds),axis=rule.axis==='x'?0:2;
  if(!inside(area.min,projectBounds)||!inside(area.max,projectBounds)||area.min[axis]+area.max[axis]!==rule.plane*2)throw Error('Symmetry region must be inside project and centered on its plane');
  const exclusions=(rule.exceptions||[]).map(e=>{if(typeof e.reason!=='string'||e.reason.trim().length<15)throw Error('Symmetry exception needs a specific reason');return bounds(e.bounds);});
  let count=0;const samples=[];
  for(const p of cells(area)){
   const q=[...p];q[axis]=2*rule.plane-p[axis];if(p[axis]>q[axis])continue;
   if(exclusions.some(e=>inside(p,e)||inside(q,e)))continue;
   const actual=map.get(key(q))||AIR,expected=mirrorState(map.get(key(p))||AIR,rule.axis);
   if(actual!==expected){count++;if(samples.length<12)samples.push({at:p,mirror:q,expected,actual});}
  }
  if(count)failures.push({name:rule.name||'symmetry',count,samples});
 }
 for(const profile of quality.profiles||[]){
  if(!Array.isArray(profile.points)||!profile.points.length)throw Error('Depth profile requires points');
  let count=0;const samples=[];
  for(const p of profile.points){point(p.at);if(!inside(p.at,projectBounds))throw Error('Depth sample outside project');
   if(!['air','occupied','block'].includes(p.kind))throw Error('Invalid depth sample kind');
   const actual=map.get(key(p.at))||AIR,ok=p.kind==='air'?isAir(actual):p.kind==='occupied'?!isAir(actual):actual===state(p.block);
   if(!ok){count++;if(samples.length<12)samples.push({at:p.at,kind:p.kind,expected:p.block,actual});}
  }
  if(count)failures.push({name:profile.name||'depth profile',count,samples});
 }
 if(quality.connected){
  const area=bounds(quality.connected.bounds),pending=new Set();
  if(!inside(area.min,projectBounds)||!inside(area.max,projectBounds))throw Error('Connectivity region outside project');
  for(const p of cells(area))if(!isAir(map.get(key(p))||AIR))pending.add(key(p));
  const groups=[];
  while(pending.size){const first=pending.values().next().value,queue=[first];pending.delete(first);
   for(let n=0;n<queue.length;n++){const p=queue[n].split(',').map(Number);for(let axis=0;axis<3;axis++)for(const d of [-1,1]){const q=[...p];q[axis]+=d;const k=key(q);if(pending.delete(k))queue.push(k);}}
   groups.push({size:queue.length,at:first});
  }
  groups.sort((a,b)=>b.size-a.size);
  if(groups.length>1)failures.push({name:'disconnected geometry',count:groups.length-1,samples:groups.slice(1,13)});
 }
 return {failures,checkedSymmetry:(quality.symmetry||[]).length,checkedProfiles:(quality.profiles||[]).length};
}
