import {writeFile} from 'node:fs/promises';
const components=[];
const authored=(id,role,make,replace=[])=>{const operations=[],f=(from,to,block)=>operations.push({op:'fill',from,to,block}),s=(x,y,z,b)=>f([x,y,z],[x,y,z],b),box=(from,to,block)=>operations.push({op:'box',from,to,block});make(f,s,box);components.push({id,role,operations,replace});};
const brick='minecraft:stone_bricks',trim='minecraft:polished_andesite',dark='minecraft:deepslate_bricks',wood='minecraft:spruce_planks';
authored('terrace','stepped foundation and courtyard',(f)=>{f([-1,-1,0],[31,0,32],brick);f([0,1,1],[30,1,31],'minecraft:stone');f([12,1,20],[18,1,31],trim);});
authored('enclosure','low perimeter with rhythmic buttresses',(f,s)=>{for(const x of [0,30]){f([x,2,1],[x,7,22],brick);for(let z=2;z<=22;z+=5){f([x===0?-1:30,2,z],[x===0?0:31,5,z+1],trim);s(x,8,z,brick);s(x,8,z+1,brick);}}f([1,2,1],[29,7,1],brick);for(let x=2;x<15;x+=4){f([x,8,1],[x+1,8,1],brick);f([29-x,8,1],[30-x,8,1],brick);}});
authored('keep','habitable hall shell and structural corners',(f,s,box)=>{box([8,2,6],[22,11,20],brick);f([9,2,7],[21,10,19],'minecraft:air');for(const x of [8,22])for(const z of [6,20])f([x,2,z],[x,11,z],trim);f([9,1,7],[21,1,19],wood);},['terrace']);
for(const [id,x,z,rotate]of[['front-a',14,20,180],['front-b',22,20,180],['rear-a',8,6,0],['rear-b',16,6,0]])components.push({id,role:'recessed masonry window bay',type:'wall-bay',at:[x,2,z],rotate,parameters:{width:7,height:10},replace:['keep']});
for(const [id,x,rot]of[['west-support',7,270],['east-support',23,90]])components.push({id,role:'stepped structural buttress',type:'buttress',at:[x,2,rot===90?8:10],rotate:rot,parameters:{height:8},replace:['keep']});
authored('hall-door','recessed three-wide hall entry',(f,s)=>{f([14,2,19],[16,5,21],'minecraft:air');for(const x of [13,17])f([x,2,21],[x,5,21],trim);f([13,6,21],[17,6,21],trim);s(15,7,21,trim);},['front-a','front-b','keep']);
components.push({id:'keep-roof',role:'steep roof with stair eaves and hollow interior',type:'gable-roof',at:[7,12,5],parameters:{width:17,depth:17,rise:8}});
authored('roof-details','ridge ends and chimney',(f,s)=>{f([14,12,9],[16,23,10],brick);f([13,24,8],[17,24,11],trim);for(const z of [4,22]){s(15,20,z,dark);s(15,21,z,dark);}},['keep-roof']);
for(const [id,x,h]of[['west-tower',0,13],['east-tower',24,13]])authored(id,'inhabitable gate tower with ladder, loopholes and crenellated roof',(f,s,box)=>{
 box([x,2,23],[x+6,h,29],brick);f([x+1,2,24],[x+5,h-1,28],'minecraft:air');f([x-1,2,22],[x+7,3,22],trim);
 for(const z of [23,29])for(const y of [6,10]){s(x+3,y,z,'minecraft:glass');s(x+3,y-1,z,trim);}
 for(const xx of [x,x+6])f([xx,2,23],[xx,h,23],trim);
 for(let q=0;q<=6;q+=2){s(x+q,h+1,23,brick);s(x+q,h+1,29,brick);s(x,h+1,23+q,brick);s(x+6,h+1,23+q,brick);}
 for(let y=2;y<=h;y++)s(x===0?x+1:x+5,y,26,x===0?'minecraft:ladder[facing=east,waterlogged=false]':'minecraft:ladder[facing=west,waterlogged=false]');f([x+2,2,23],[x+4,4,23],'minecraft:air');
},['enclosure']);
for(const [id,x,h,owner]of[['west-face',6,11,'west-tower'],['east-face',30,11,'east-tower']])components.push({id,role:'deep tower facade with recessed opening and corner piers',type:'wall-bay',at:[x,2,29],rotate:180,parameters:{width:7,height:h},replace:[owner]});
authored('gable-frame','timber gable framing and attic glazing',(f,s)=>{
 for(const z of [4,22]){f([7,12,z],[23,12,z],'minecraft:stripped_spruce_log[axis=x]');f([15,13,z],[15,19,z],'minecraft:stripped_spruce_log[axis=y]');f([11,15,z],[19,15,z],'minecraft:stripped_spruce_log[axis=x]');f([14,16,z],[16,17,z],'minecraft:glass');f([14,16,z===4?5:21],[16,17,z===4?5:21],'minecraft:air');}
},['keep-roof']);
authored('front-walls','gateway flanking wall walks',(f,s)=>{for(const [a,b]of[[7,10],[20,23]]){f([a,2,26],[b,8,27],brick);f([a,9,26],[b,9,27],trim);for(let x=7;x<=10;x+=2){s(x,10,27,brick);s(30-x,10,27,brick);}}});
components.push({id:'gate',role:'deep masonry entrance with framed pointed opening',type:'gateway',at:[11,2,26],parameters:{width:9,height:10}});
authored('interior','beamed furnished hall and supported lamps',(f,s)=>{
 for(const z of [8,12,16])f([9,10,z],[21,10,z],'minecraft:stripped_spruce_log[axis=x]');
 for(const x of [11,19]){f([x,2,9],[x,2,12],'minecraft:spruce_slab[type=top,waterlogged=false]');for(const z of [8,13])f([x,2,z],[x,3,z],wood);}
 f([13,2,8],[17,2,12],wood);for(const x of [10,20]){f([x,2,7],[x,4,7],'minecraft:bookshelf');s(x,9,12,'minecraft:lantern[hanging=true,waterlogged=false]');}
},['keep','rear-a','rear-b']);
components.find(c=>c.id==='interior').attachments=[10,20].map(x=>({at:[x,9,12],support:[x,10,12]}));
authored('gardens','bounded planted courtyard beds and supported lights',(f,s)=>{for(const x of [4,25]){f([x,2,16],[x+1,2,20],brick);f([x,3,17],[x+1,3,19],'minecraft:moss_block');for(const z of [17,19])s(x===4?4:26,4,z,'minecraft:oak_leaves[persistent=true,distance=1,waterlogged=false]');}for(const x of [10,20]){f([x,2,23],[x,3,23],trim);s(x,4,23,'minecraft:lantern[hanging=false,waterlogged=false]');}},[]);
const design={version:1,intent:'A compact masonry castle with a dominant steep-roofed hall, deep recessed window bays, stepped supports, paired gate towers, a clearly framed entrance and planted usable courtyard.',frame:{min:[-3,-1,-1],max:[33,26,34]},components,quality:{symmetry:[{name:'castle bilateral symmetry',axis:'x',plane:15,bounds:{min:[-3,-1,-1],max:[33,26,34]}}],connected:{bounds:{min:[-3,-1,-1],max:[33,26,34]}}},evidence:['overview','detail','interior','section'],routes:[{id:'gate-to-hall',path:Array.from({length:14},(_,i)=>[15,2,30-i])}]};
await writeFile('builder/examples/architectural-castle/design.json',JSON.stringify(design,null,2));

