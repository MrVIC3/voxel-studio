const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);if(n<1e-9)throw Error('Degenerate camera');return a.map(v=>v/n);};
export function projectLandmark(world,camera,aspect){
 const forward=unit(sub(camera.target,camera.position)),right=unit(cross(forward,[0,1,0])),up=cross(right,forward),v=sub(world,camera.position),z=dot(v,forward);
 if(z<=0)return null;const t=Math.tan(camera.fov*Math.PI/360);
 return [.5+dot(v,right)/(2*z*t*aspect),.5-dot(v,up)/(2*z*t)];
}
export function fitCamera(spec){
 if(!Array.isArray(spec.points)||spec.points.length<6||spec.points.length>100)throw Error('Camera fitting needs 6..100 observed world/image landmark pairs');
 for(const p of spec.points)if(!Array.isArray(p.world)||p.world.length!==3||!p.world.every(Number.isFinite)||!Array.isArray(p.image)||p.image.length!==2||!p.image.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid world/image landmark');
 const camera=spec.initial,aspect=spec.aspect;
 if(!camera||![...(camera.position||[]),...(camera.target||[]),camera.fov,aspect].every(Number.isFinite)||camera.position.length!==3||camera.target.length!==3||aspect<=0)throw Error('Initial camera and aspect required');
 const initial=[...camera.position,...camera.target,camera.fov];
 const decode=v=>({position:v.slice(0,3),target:v.slice(3,6),fov:v[6]});
 const loss=v=>{if(v[6]<20||v[6]>100)return Infinity;try{let s=0;for(const p of spec.points){const q=projectLandmark(p.world,decode(v),aspect);if(!q)return Infinity;s+=(q[0]-p.image[0])**2+(q[1]-p.image[1])**2;}return s/spec.points.length;}catch{return Infinity;}};
 const span=Math.max(1,...[0,1,2].map(i=>Math.max(...spec.points.map(p=>p.world[i]))-Math.min(...spec.points.map(p=>p.world[i]))));
 let best=[...initial],bestLoss=loss(best),steps=Array(6).fill(span/8).concat(3),iterations=0;
 if(!Number.isFinite(bestLoss))throw Error('Initial camera must see all landmarks');
 // Bounded local optimization. Seed it near the observed viewpoint; not a global camera solver.
 for(let round=0;round<700;round++){
  let improved=false;
  for(let axis=0;axis<7;axis++){
   let choice=best,score=bestLoss;
   for(const sign of [-1,1]){const v=[...best];v[axis]+=steps[axis]*sign;const e=loss(v);iterations++;if(e<score){choice=v;score=e;}}
   if(score<bestLoss){best=choice;bestLoss=score;improved=true;}
  }
  if(!improved)steps=steps.map(s=>s*.6);
  if(Math.max(...steps)<1e-5)break;
 }
 const fitted=decode(best),residuals=spec.points.map(p=>{const q=projectLandmark(p.world,fitted,aspect);return{name:p.name||'',distance:Math.hypot(q[0]-p.image[0],q[1]-p.image[1])};});
 const rmse=Math.sqrt(bestLoss),maxError=Math.max(...residuals.map(p=>p.distance));
 const tolerance=spec.tolerance??.025;
 if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>.1)throw Error('Camera tolerance must be within (0, .1]');
 return {camera:fitted,aspect,initialRmse:Math.sqrt(loss(initial)),rmse,maxError,residuals,iterations,accepted:maxError<=tolerance,note:'Local fit to manually observed landmarks; acceptance is image alignment only, not a quality or reconstruction score.'};
}
