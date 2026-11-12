import test from 'node:test';
import assert from 'node:assert/strict';
import {compileArchitecture,assessArchitecture,validateRoutes,transform} from '../architecture.mjs';
import {assembly} from '../assemblies.mjs';
import {compile} from '../core.mjs';
const p={bounds:{min:[-40,-5,-40],max:[40,40,40]},base:{palette:[],blocks:[]},edits:{}};
const design=(components)=>({version:1,intent:'Deliberate masonry proportions and recessed openings.',components});
const part={id:'bay',role:'recessed facade',type:'wall-bay'};
test('assemblies have depth, hollow roof space, constrained dimensions and rotated states',()=>{
 const a=compileArchitecture(design([part]),p);const edits=compile(a.plan,p).edits;
 assert(edits['0,3,-1']);assert.equal(edits['3,3,0'],'minecraft:air');assert.equal(edits['3,3,1'],'minecraft:glass');
 assert.throws(()=>assembly('wall-bay',{width:4}),/dimension/);
 const roof=compileArchitecture(design([{id:'roof',role:'pitched roof',type:'gable-roof'}]),p);const r=compile(roof.plan,p).edits;
 assert.equal(r['6,0,6'],undefined);assert(r['0,0,6'].includes('facing=east'));
 for(const rotate of [0,90,180,270])assert.doesNotThrow(()=>compileArchitecture(design([{...part,rotate}]),p));
});
test('ownership rejects silent overwrites and permits explicit scoped edits',()=>{
 const cut={id:'cut',role:'opening',operations:[{op:'set',at:[0,0,0],block:'air'}]};
 assert.throws(()=>compileArchitecture(design([part,cut]),p),/Undeclared overlap/);
 const r=compileArchitecture(design([part,{...cut,replace:['bay']}]),p);assert.equal(r.provenance['0,0,0'],'cut');
});
test('reserved openings, attachment supports and sockets are enforced',()=>{
 const gate={id:'gate',role:'entry',type:'gateway'};
 assert.throws(()=>compileArchitecture(design([gate,{id:'rubble',role:'rubble',replace:['gate'],operations:[{op:'set',at:[4,1,1],block:'stone'}]}]),p),/Blocked/);
 assert.throws(()=>compileArchitecture({...design([part]),links:[['bay.left','bay.right']]},p),/Disconnected sockets/);
 assert.throws(()=>compileArchitecture(design([{...part,attachments:[{at:[0,0,0],support:[0,-1,0]}]}]),p),/Missing attachment/);
});
test('declared routes reject obstructions, missing floors, discontinuities and unsupported shapes',()=>{
 const q={...p,edits:{'0,0,0':'minecraft:stone','1,0,0':'minecraft:stone'}};
 const routes=[{id:'entry',path:[[0,1,0],[1,1,0]]}];assert.equal(validateRoutes(q,routes).checked,1);
 assert.throws(()=>validateRoutes({...q,edits:{...q.edits,'1,2,0':'minecraft:stone'}},routes),/Blocked/);
 assert.throws(()=>validateRoutes(q,[{id:'jump',path:[[0,1,0],[3,1,0]]}]),/Discontinuous/);
});
test('structured assessments require evidence for every required role and no unresolved defects',()=>{
 const a=compileArchitecture(design([part]),p),q={architecture:a.metadata};
 const renders=['overview','detail','interior'].map(label=>({id:label,label}));
 const assessment={designHash:a.metadata.hash,defects:[],criteria:['composition','detail','functionality'].map(category=>({category,findings:'Inspected the actual evidence for proportions, junctions and usable space.',evidence:['overview','detail','interior']}))};
 assert.equal(assessArchitecture(q,renders,assessment),assessment);
 assert.throws(()=>assessArchitecture(q,renders.slice(0,2),assessment),/stale evidence/);
 assert.throws(()=>assessArchitecture(q,renders,{...assessment,defects:[{status:'open'}]}),/Resolve/);
 assert.throws(()=>assessArchitecture(q,renders,{...assessment,designHash:'old'}),/designHash/);
});
