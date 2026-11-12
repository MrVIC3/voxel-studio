import {readFile,writeFile,mkdir} from 'node:fs/promises';import assert from 'node:assert/strict';import {compileArchitecture}from './architecture.mjs';
const original=JSON.parse(await readFile('builder/examples/architectural-castle/design.json','utf8')),project={bounds:{min:[-4,-2,-2],max:[34,30,36]},base:{palette:[],blocks:[]},edits:{}};
const result=[];const baseline=compileArchitecture(original,project);result.push({case:'corrected castle',expected:'pass',actual:'pass',checks:baseline.metadata.diagnostics});
for(const [name,mutate,reason]of[
 ['half-block window-pair misalignment',d=>d.components.find(c=>c.id==='front-b').at[0]-=1,/symmetry/],
 ['single unpaired stray block',d=>d.components.push({id:'stray',role:'injected regression',operations:[{op:'set',at:[2,25,15],block:'stone'}]}),/symmetry/],
 ['paired floating blocks',d=>d.components.push({id:'floating',role:'injected regression',operations:[{op:'set',at:[2,25,15],block:'stone'},{op:'set',at:[28,25,15],block:'stone'}]}),/disconnected geometry/],
 ['filled window recess',d=>d.components.push({id:'depth-bug',role:'injected regression',replace:['front-a'],operations:[{op:'set',at:[11,5,20],block:'stone'}]}),/window recess/],
 ['blocked hall entrance',d=>d.components.push({id:'door-bug',role:'injected regression',replace:['hall-door'],operations:[{op:'set',at:[15,2,20],block:'stone'}]}),/Blocked route/]
]){const d=structuredClone(original);mutate(d);let error;try{compileArchitecture(d,project);}catch(e){error=e.message;}assert(error&&reason.test(error),name+': '+error);result.push({case:name,expected:'reject',actual:'reject',reason:error.slice(0,400)});}
await mkdir('test-results/quality-benchmark',{recursive:true});await writeFile('test-results/quality-benchmark/report.json',JSON.stringify({cases:result,at:new Date().toISOString(),scope:'Regression learning from observed construction errors. This does not retrain model weights or establish general image reconstruction accuracy.'},null,2));console.log(JSON.stringify({passed:result.length,total:result.length}));
