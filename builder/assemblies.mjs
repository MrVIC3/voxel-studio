// Architectural primitives have constrained usable dimensions; caller owns composition.
export function assembly(type,p={},palette={}){
 const o=[],clearances=[],sockets={},attachments=[],profiles=[];
 const m=(role,fallback)=>palette[role]||fallback;
 const stone=m('wall','minecraft:stone_bricks'),trim=m('trim','minecraft:polished_andesite'),roof=m('roof','minecraft:deepslate_bricks');
 const f=(a,b,block)=>o.push({op:'fill',from:a,to:b,block});
 const s=(x,y,z,b)=>f([x,y,z],[x,y,z],b);
 const integer=(n,lo,hi)=>{if(!Number.isInteger(n)||n<lo||n>hi)throw Error(`${type}: dimension must be ${lo}..${hi}`);return n;};
 if(type==='wall-bay'){
  const w=integer(p.width??7,5,21),h=integer(p.height??9,7,25);
  if(w%2!==1)throw Error('wall-bay width must be odd');const mid=(w-1)/2;
  f([0,0,0],[w-1,h-1,1],stone);
  f([0,0,-1],[w-1,1,-1],trim);f([0,h-2,-1],[w-1,h-2,1],trim);
  for(const x of [0,w-1])f([x,2,-1],[x,h-3,-1],stone);
  if(p.window!==false){
   f([mid-1,3,0],[mid+1,h-4,1],'minecraft:air');
   f([mid-1,3,1],[mid+1,h-4,1],m('glass','minecraft:glass'));
   f([mid-2,2,-1],[mid+2,2,-1],trim);
   s(mid,h-3,-1,trim);
   profiles.push({name:'window recess',points:[{at:[mid,3,-1],kind:'air'},{at:[mid,3,0],kind:'air'},{at:[mid,3,1],kind:'block',block:m('glass','minecraft:glass')}]});
  }
  sockets.left=[0,0,0];sockets.right=[w,0,0];
 }else if(type==='gateway'){
  const w=integer(p.width??9,7,17),h=integer(p.height??10,8,20),mid=Math.floor(w/2);
  if(w%2!==1)throw Error('gateway width must be odd');
  f([0,0,0],[w-1,h-1,2],stone);f([mid-1,0,0],[mid+1,4,2],'minecraft:air');s(mid,5,0,'minecraft:air');s(mid,5,1,'minecraft:air');s(mid,5,2,'minecraft:air');
  for(const x of [mid-2,mid+2])f([x,0,-1],[x,4,-1],trim);
  f([mid-1,5,-1],[mid+1,5,-1],trim);s(mid,6,-1,trim);
  f([0,h-2,-1],[w-1,h-2,2],trim);
  clearances.push({min:[mid-1,0,0],max:[mid+1,3,2]});sockets.entry=[mid,0,-1];sockets.exit=[mid,0,3];
 }else if(type==='gable-roof'){
  const w=integer(p.width??13,7,25),d=integer(p.depth??13,5,31),rise=integer(p.rise??Math.floor(w/2),2,12);
  if(w%2!==1||rise!==Math.floor(w/2))throw Error('gable-roof supports odd width and 1:1 pitch');
  for(let k=0;k<rise;k++){
   f([k,k,0],[k,k,d-1],`${m('roofStair','minecraft:deepslate_brick_stairs')}[facing=east,half=bottom,shape=straight,waterlogged=false]`);
   f([w-1-k,k,0],[w-1-k,k,d-1],`${m('roofStair','minecraft:deepslate_brick_stairs')}[facing=west,half=bottom,shape=straight,waterlogged=false]`);
  }
  f([rise,rise,0],[rise,rise,d-1],roof);
  for(const z of [0,d-1])for(let k=0;k<rise;k++)f([k+1,k,z],[w-2-k,k,z],m('gable','minecraft:spruce_planks'));
  sockets.ridge=[rise,rise,Math.floor(d/2)];
 }else if(type==='straight-stair'){
  const width=integer(p.width??3,2,5),rise=integer(p.rise??6,1,20);
  for(let k=0;k<rise;k++){
   f([0,0,k],[width-1,k,k],stone);
   f([0,k,k],[width-1,k,k],'minecraft:stone_brick_stairs[facing=south,half=bottom,shape=straight,waterlogged=false]');
   clearances.push({min:[0,k+1,k],max:[width-1,k+3,k]});
  }
  sockets.bottom=[Math.floor(width/2),0,-1];sockets.top=[Math.floor(width/2),rise,rise];
 }else if(type==='buttress'){
  const h=integer(p.height??9,5,24);
  f([0,0,-2],[2,2,1],stone);f([0,3,-1],[2,h-2,1],stone);f([0,h-1,0],[2,h,1],trim);
 }else throw Error('Unknown architectural assembly '+type);
 return {operations:o,clearances,sockets,attachments,profiles};
}
