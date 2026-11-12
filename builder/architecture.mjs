import { AIR, bounds, cells, compile, compose, digest, inside, isAir, key, point, pos } from './core.mjs';
import { assembly } from './assemblies.mjs';
import {spatialQuality} from './spatial-quality.mjs';
import {fitCamera} from './camera-fit.mjs';

const name = (s) => { if (typeof s !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(s)) throw Error('Valid component name required'); return s; };
export function transform(p, at = [0,0,0], rotate = 0) {
  point(p); point(at);
  if (![0,90,180,270].includes(rotate)) throw Error('Invalid component rotation');
  const [x,y,z]=p, q=rotate/90, r=q===1?[-z,y,x]:q===2?[-x,y,-z]:q===3?[z,y,-x]:p;
  return r.map((v,i)=>v+at[i]);
}
export function spans(edits) {
  const list=Object.entries(edits).map(([k,b])=>({p:pos(k),b})).sort((a,b)=>a.p[1]-b.p[1]||a.p[2]-b.p[2]||a.p[0]-b.p[0]), ops=[];
  let run;
  for(const {p,b} of list) {
    if(run&&run.block===b&&run.to[1]===p[1]&&run.to[2]===p[2]&&run.to[0]+1===p[0])run.to=p;
    else {run={op:'fill',from:p,to:[...p],block:b};ops.push(run);}
  }
  const components={},operations=[];
  for(let i=0;i<ops.length;i+=4000){const n='spans'+i;components[n]=ops.slice(i,i+4000);operations.push({op:'use',component:n});}
  return {version:1,components,operations};
}
export function compileArchitecture(design, project) {
  if(design?.version!==1||!Array.isArray(design.components)||!design.components.length||design.components.length>1024)throw Error('Design version 1 requires 1..1024 components');
  if(typeof design.intent!=='string'||design.intent.trim().length<20)throw Error('Record architectural intent before compilation');
  const ids=new Set(),out={},owners={},sockets={},clearances=[],attachments=[],componentReports=[],profiles=[];
  let placements=0;
  for(const c of design.components){
    name(c.id);if(ids.has(c.id))throw Error('Duplicate component '+c.id);ids.add(c.id);
    if(typeof c.role!=='string'||!c.role.trim())throw Error('Component role required: '+c.id);
    const a=c.type?assembly(c.type,c.parameters||{},design.palette||{}):{operations:c.operations,clearances:[],sockets:{},attachments:[]};
    const at=c.at||[0,0,0],rotate=c.rotate||0;
    const result=compile({version:1,palette:design.palette||{},components:{part:a.operations},operations:[{op:'use',component:'part',at,rotate}]},{...project,edits:{}});
    placements+=result.placements;if(placements>2_000_000)throw Error('Architecture exceeds placement budget');
    for(const [k,v]of Object.entries(result.edits)){
      if(owners[k]&&!(c.replace||[]).includes(owners[k]))throw Error(`Undeclared overlap: ${c.id} with ${owners[k]} at ${k}`);
      out[k]=v;owners[k]=c.id;
    }
    for(const [n,p]of Object.entries({...a.sockets,...c.sockets}))sockets[c.id+'.'+name(n)]=transform(p,at,rotate);
    for(const r of [...(a.clearances||[]),...(c.clearances||[])]){
      bounds(r);const p=transform(r.min,at,rotate),q=transform(r.max,at,rotate);
      clearances.push({name:c.id+' clearance',kind:'empty',bounds:{min:p.map((v,i)=>Math.min(v,q[i])),max:p.map((v,i)=>Math.max(v,q[i]))}});
    }
    for(const r of [...(a.attachments||[]),...(c.attachments||[])])attachments.push({component:c.id,at:transform(r.at,at,rotate),support:transform(r.support,at,rotate)});
    for(const r of a.profiles||[])profiles.push({...r,name:c.id+' '+r.name,points:r.points.map(p=>({...p,at:transform(p.at,at,rotate)}))});
    componentReports.push({id:c.id,role:c.role,type:c.type||'authored',cells:Object.keys(result.edits).length});
  }
  for(const link of design.links||[]){const a=sockets[link[0]],b=sockets[link[1]];if(!a||!b||key(a)!==key(b))throw Error('Disconnected sockets: '+link.join(' -> '));}
  const rules=[...clearances,...(design.rules||[])];
  for(const r of rules){bounds(r.bounds);if(!inside(r.bounds.min,project.bounds)||!inside(r.bounds.max,project.bounds))throw Error('Design rule outside project');}
  const map=compose({...project,edits:{...project.edits,...out}});
  for(const r of clearances)for(const p of cells(r.bounds))if(!isAir(map.get(key(p))||AIR))throw Error('Blocked '+r.name+' at '+p);
  for(const r of attachments)if(isAir(map.get(key(r.at))||AIR)||isAir(map.get(key(r.support))||AIR))throw Error('Missing attachment/support: '+r.component+' at '+r.at);
  const region=design.frame?bounds(design.frame):project.bounds;
  if(!inside(region.min,project.bounds)||!inside(region.max,project.bounds))throw Error('Design frame outside project');
  const required=design.evidence||['overview','detail','interior'];
  if(!Array.isArray(required)||!required.length||required.some(v=>!['overview','detail','interior','section','reference'].includes(v)))throw Error('Invalid required evidence');
  const routes=design.routes||[];
  validateRoutes({...project,edits:{...project.edits,...out}},routes);
  const quality={...design.quality,profiles:[...profiles,...(design.quality?.profiles||[])]};
  const diagnostics=spatialQuality(map,quality,project.bounds);
  if(diagnostics.failures.length)throw Error('Spatial quality failed: '+JSON.stringify(diagnostics.failures));
  let reference=null;
  if(design.reference){
    if(!/^[a-f0-9]{64}$/.test(design.reference.imageHash||''))throw Error('Reference requires source image SHA256');
    reference={...fitCamera(design.reference.calibration),imageHash:design.reference.imageHash};
    if(!reference.accepted)throw Error('Reference camera alignment exceeds tolerance: '+reference.maxError);
    if(!required.includes('reference'))throw Error('Reference design requires reference render evidence');
  }
  return {plan:spans(out),rules,metadata:{hash:digest(design),intent:design.intent,components:componentReports,frame:region,evidence:required,attachments,sockets,routes,quality,diagnostics,reference},provenance:owners};
}

export function validateRoutes(project,routes=[]){
  const map=compose(project),supports=new Set(['minecraft:stone','minecraft:stone_bricks','minecraft:polished_andesite','minecraft:spruce_planks','minecraft:oak_planks','minecraft:deepslate_bricks','minecraft:cobblestone']);
  for(const r of routes){
    name(r.id);if(!Array.isArray(r.path)||r.path.length<2||r.path.length>10000)throw Error('Route requires 2..10000 foot positions');
    let previous;
    for(const p of r.path){
      point(p);if(!inside(p,project.bounds)||!inside([p[0],p[1]-1,p[2]],project.bounds)||!inside([p[0],p[1]+1,p[2]],project.bounds))throw Error('Route outside project');
      if(previous&&(Math.abs(p[0]-previous[0])+Math.abs(p[2]-previous[2])!==1||Math.abs(p[1]-previous[1])>1))throw Error('Discontinuous route '+r.id);
      for(let y=0;y<2;y++)if(!isAir(map.get(key([p[0],p[1]+y,p[2]]))||AIR))throw Error('Blocked route '+r.id+' at '+p);
      if(!supports.has(map.get(key([p[0],p[1]-1,p[2]]))))throw Error('Unsupported or unmodeled route floor '+r.id+' at '+p);
      // Full-block steps need clearance above the departing foot position too.
      if(previous&&p[1]>previous[1]&&!isAir(map.get(key([previous[0],previous[1]+2,previous[2]]))||AIR))throw Error('Blocked step headroom '+r.id);
      previous=p;
    }
  }
  return {checked:routes.length,mode:'declared two-air-cell paths on known full-block supports; not general collision simulation'};
}

export function assessArchitecture(p,renders,assessment) {
  if(!assessment||assessment.designHash!==p.architecture.hash)throw Error('Assessment must identify current designHash');
  if(!Array.isArray(assessment.defects)||assessment.defects.some(d=>d.status!=='resolved'))throw Error('Resolve documented defects before review');
  for(const category of ['composition','detail','functionality',...(p.architecture.evidence.includes('reference')?['reference']:[])]){
    const c=assessment.criteria?.find(c=>c.category===category);
    if(!c||typeof c.findings!=='string'||c.findings.trim().length<30||!Array.isArray(c.evidence)||!c.evidence.length)throw Error('Specific findings and evidence required for '+category);
    for(const id of c.evidence)if(!renders.some(r=>r.id===id))throw Error('Unknown or stale evidence '+id);
  }
  const cited=new Set(assessment.criteria.flatMap(c=>c.evidence));
  if(p.architecture.quality?.symmetry?.length){
    const available=new Set(renders.filter(r=>cited.has(r.id)).flatMap(r=>r.views||[]));
    for(const view of ['front','back','left','right','top'])if(!available.has(view))throw Error('Symmetry review requires cited '+view+' elevation');
  }
  for(const label of p.architecture.evidence)if(!renders.some(r=>r.label===label&&cited.has(r.id)))throw Error('Inspect and cite required '+label+' evidence');
  return assessment;
}
