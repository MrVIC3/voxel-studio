import fs from 'node:fs';
import path from 'node:path';
import { bones, emptyProject, identity, validateProject } from '../src/model';
import type { BoneName, Keyframe, SceneObject, Transform, Vec3 } from '../src/model';
import { decodeMinecraftAssets } from '../src/engine/minecraft';
import { effectDefaults } from '../src/engine/effects';

const output=path.resolve('showcase');fs.mkdirSync(output,{recursive:true});
const project=emptyProject();project.name='Ember Gate';project.fps=24;project.duration=431;project.assetVersion='1.21.11';
project.lighting={...project.lighting,sky:'#101722',warmth:'#a5c4ff',sun:.55,ambient:.28,environment:.18,azimuth:-36,elevation:48,fog:.085,ground:false,exposure:.95,ao:true,aoIntensity:.65,bloom:true,bloomStrength:.16,softness:3};
const assets=decodeMinecraftAssets(new Uint8Array(fs.readFileSync(path.join(process.env.APPDATA!,'.minecraft/versions/1.21.11/1.21.11.jar'))),'1.21.11','Minecraft Java');
const object=(id:string,name:string,type:SceneObject['type'],position:Vec3=[0,0,0],extra:Partial<SceneObject>={}):SceneObject=>({id,name,type,visible:true,transform:{...identity(),position},...extra});
const palette:string[]=[],indices=new Map<string,number>(),blocks=new Map<string,[number,number,number,number]>();
function block(x:number,y:number,z:number,name:string){const id='minecraft:'+name;let index=indices.get(id);if(index===undefined){index=palette.length;palette.push(id);indices.set(id,index);}blocks.set(`${x},${y},${z}`,[x,y,z,index]);}
const noise=(x:number,y:number,z=0)=>{const n=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return n-Math.floor(n);};
for(let x=-17;x<=17;x++)for(let z=-15;z<=15;z++){
  if(x*x/320+z*z/250>1)continue;for(let y=-3;y<=0;y++){const radius=Math.hypot(x,z),plaza=Math.abs(x)<8&&z>-7&&z<7;block(x,y,z,y<0?(y===-3?'stone':'dirt'):plaza?(Math.floor(radius)%3===0?'polished_deepslate':noise(x,z)>.35?'stone_bricks':'mossy_stone_bricks'):noise(x,z)>.2?'grass_block':'moss_block');}
  if(Math.abs(x)>8&&noise(x,z,8)>.87)block(x,1,z,'short_grass');
}
for(const tx of [-12,-9,10,13])for(const tz of [-10,8]){
  const height=6+Math.floor(noise(tx,tz)*3);for(let y=1;y<=height;y++)block(tx,y,tz,'oak_log[axis=y]');
  for(let x=-3;x<=3;x++)for(let y=-2;y<=2;y++)for(let z=-3;z<=3;z++)if(x*x+z*z+y*y*1.8<10&&noise(x+tx,y+height,z+tz)>.09)block(tx+x,height+y,tz+z,'oak_leaves[persistent=true]');
}
for(const x of [-3,3])for(let y=1;y<=7;y++)for(const z of [-6,-5])block(x,y,z,y%3===0?'chiseled_stone_bricks':'mossy_stone_bricks');
for(let x=-3;x<=3;x++)for(const z of [-6,-5])block(x,7,z,'stone_bricks');
for(const x of [-2,2])for(let y=1;y<=5;y++)block(x,y,-6,'crying_obsidian');
for(let x=-2;x<=2;x++)block(x,6,-6,'crying_obsidian');
for(const x of [-4,4])for(let z=-7;z<=-4;z++)block(x,0,z,'polished_blackstone_bricks');
for(const x of [-7,7])for(const z of [-3,4]){const height=2+Math.floor(noise(x,z)*3);for(let y=1;y<=height;y++)block(x,y,z,y===height?'chiseled_stone_bricks':'cracked_stone_bricks');block(x,height+1,z,'stone_brick_slab[type=bottom]');}
for(const x of [-5,5])for(const z of [-2,3]){block(x,1,z,'polished_blackstone');block(x,2,z,'netherrack');block(x,3,z,'fire[age=0]');}
for(let i=0;i<28;i++){const x=Math.floor(noise(i,71)*24)-12,z=Math.floor(noise(i,93)*20)-10;if(Math.abs(x)<6&&z>-7&&z<10)continue;block(x,1,z,noise(i,4)>.5?'mossy_cobblestone':'cobblestone');}
project.objects.push(object('temple','Ruined Temple','build',[0,0,0],{voxels:{palette,blocks:[...blocks.values()]}}));
const hero=object('hero','Alex · Warden','character',[-7,.5,0],{slim:true,skin:assets.textures['minecraft:entity/player/slim/alex']});
const rival=object('rival','Steve · Sentinel','character',[2.5,.5,0],{skin:assets.textures['minecraft:entity/player/wide/steve']});
hero.transform.rotation[1]=Math.PI/2;rival.transform.rotation[1]=-Math.PI/2;
hero.ik={leftArm:{targetId:'guard-hand',pole:[.7,1.25,-1],enabled:true}};
project.objects.push(hero,rival,object('guard-hand','Alex · Guard Hand','control',[.38,1.12,.38],{parentId:'hero'}));
for(const [id,parent,item] of [['blade','hero','diamond_sword'],['enemy-blade','rival','netherite_sword']]){const prop=object(id,id==='blade'?'Dawnblade':'Obsidian Edge','item',[0,-.3,0],{parentId:parent,parentBone:'rightHand',item:'minecraft:item/'+item});prop.transform.rotation=[0,0,-Math.PI*.75];prop.transform.scale=[1.12,1.12,1.12];project.objects.push(prop);}
function light(id:string,position:Vec3,color:string,intensity:number,type:'point'|'area'|'spot'='point'){project.objects.push(object(id,id,'light',position,{color,intensity,lightType:type,width:6,height:6,angle:55,lightShadows:type==='spot'}));}
light('Portal · Violet',[0,3,-4.7],'#7777ff',70);light('Portal · Cyan',[-1,1.7,-3.7],'#51c9ff',30);
for(const x of [-5,5])for(const z of [-2,3])light(`Brazier ${x} ${z}`,[x,3.1,z],'#ff9c4b',35);
light('Softbox · Key',[-3,6,4],'#e4edff',6,'area');const keyLight=project.objects.at(-1)!;keyLight.transform.rotation=[-.8,-.3,0];
light('Softbox · Rim',[2,4,-4],'#a09eff',9,'area');project.objects.at(-1)!.transform.rotation=[0,Math.PI,0];
function effect(id:string,position:Vec3,kind:'sparks'|'embers'|'ring'|'vortex',start:number,end:number,color:string,count:number,spread:number,speed:number,loop=false){project.objects.push(object(id,id,'effect',position,{effect:{...effectDefaults,kind,start,end,color,count,spread,speed,seed:17+project.objects.length*3,size:kind==='ring'?.055:kind==='embers'?.035:.07,gravity:kind==='sparks'?5:0,loop}}));}
effect('Gate · Flow',[0,.6,-5.5],'vortex',0,431,'#7d82ff',420,1.4,5.3,true);
effect('Temple · Embers',[0,.7,0],'embers',0,431,'#ffc28a',240,9,5.2,true);
for(const frame of [136,168,200])effect(`Blade Clash ${frame}`,[.2,1.65,.05],'sparks',frame,frame+19,'#a9edff',180,.8,3.5);
effect('Landing Dust',[1.2,.6,1],'ring',276,298,'#acb7c5',350,1.8,2);
effect('Gate · Charge',[0,.8,-4.9],'vortex',288,333,'#66d5ff',650,2,5.2);
effect('Final Strike',[-.2,1.1,.1],'sparks',320,354,'#d6f6ff',850,1.8,7);
effect('Shockwave',[-.2,.65,.1],'ring',320,361,'#9adaff',1100,4.4,4);
effect('Afterglow',[-.2,.8,.1],'embers',322,414,'#b0eaff',380,4.5,4);
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function scalar(points:[number,number][],frame:number){if(frame<=points[0][0])return points[0][1];for(let i=1;i<points.length;i++)if(frame<=points[i][0]){const [a,v]=points[i-1],[b,w]=points[i];return v+(w-v)*smooth((frame-a)/(b-a));}return points.at(-1)![1];}
function addKey(track:string,frame:number,t:Transform,interpolation:Keyframe['interpolation']='linear'){(project.tracks[track]??=[]).push({...t,frame,interpolation});}
const hx:[number,number][]=[[0,-7],[66,-3.5],[120,-1.5],[136,-.6],[151,-1.3],[168,-.4],[184,-1.2],[200,-.5],[216,-1.8],[224,-3],[240,-1],[256,1],[276,1.3],[288,.8],[307,-.5],[320,-.3],[346,-1.7],[431,-1.7]];
const rx:[number,number][]=[[0,2.5],[120,2.2],[136,1],[151,1.6],[168,.8],[184,1.5],[200,.7],[216,2],[240,1.8],[276,1.2],[307,1.3],[320,1.3],[336,3.8],[360,5.8],[431,5.8]];
function actor(id:string,frame:number){const isHero=id==='hero',walking=isHero&&frame<96,phase=frame/16*Math.PI*2,air=frame>222&&frame<276?Math.sin((frame-222)/54*Math.PI):0;
  const pose=Object.fromEntries(bones.map(b=>[b,identity()])) as Record<BoneName,Transform>;
  pose.body.rotation=[.03,0,0];pose.head.rotation=[-.04,0,0];
  if(walking){const strength=frame<66?.75:.35;pose.leftLeg.rotation[0]=Math.cos(phase)*strength;pose.rightLeg.rotation[0]=-Math.cos(phase)*strength;pose.leftShin.rotation[0]=-Math.max(0,-Math.cos(phase))*.7;pose.rightShin.rotation[0]=-Math.max(0,Math.cos(phase))*.7;pose.rightArm.rotation[0]=-Math.cos(phase)*.65;pose.rightForearm.rotation[0]=.45;pose.body.position[1]=Math.abs(Math.sin(phase))*.05;}
  else {pose.leftLeg.rotation=[.26,0,-.09];pose.rightLeg.rotation=[-.26,0,.09];pose.leftShin.rotation[0]=-.35;pose.rightShin.rotation[0]=-.15;pose.rightArm.rotation=[-.85,.1,.06];pose.rightForearm.rotation=[.45,0,0];pose.leftArm.rotation=[-1,0,-.2];pose.leftForearm.rotation=[.7,0,0];}
  for(const hit of [136,168,200,320]){const f=frame-hit;if(f>=-14&&f<=12){const swing=scalar([[-14,-.8],[-6,-2.65],[0,-.55],[6,-1.2],[12,-.85]],f);pose.rightArm.rotation=[swing,isHero?scalar([[-14,0],[-6,-.45],[0,.45],[12,0]],f):-.2,(isHero?1:-1)*.12];pose.rightForearm.rotation=[scalar([[-14,.45],[-6,.85],[0,.08],[12,.45]],f),0,0];pose.body.rotation[1]=(isHero?1:-1)*scalar([[-14,0],[-6,-.38],[0,.35],[12,0]],f);pose.body.position[1]=-.12*Math.sin(Math.max(0,(f+14)/26)*Math.PI);}}
  if(isHero&&air>0){pose.rightArm.rotation=[-2.6,0,.18];pose.rightForearm.rotation=[.4,0,0];pose.leftLeg.rotation=[-.85,0,-.12];pose.rightLeg.rotation=[.8,0,.1];pose.leftShin.rotation=[-1.1,0,0];pose.rightShin.rotation=[-.9,0,0];pose.body.rotation=[.18,0,.12];}
  if(isHero&&frame>288&&frame<318){const charge=Math.sin((frame-288)/30*Math.PI);pose.rightArm.rotation[0]=-1-charge*1.7;pose.body.position[1]-=charge*.15;pose.head.rotation[0]=-.12;}
  if(isHero&&frame>=348){const t=smooth((frame-348)/40);pose.rightArm.rotation=[-.85-t*1.55,0,.1+t*.2];pose.rightForearm.rotation=[.25,0,0];pose.head.rotation[1]=-.15*t;}
  if(!isHero&&frame>=320){const t=smooth((frame-320)/35);pose.rightArm.rotation=[-1.2*t,0,.8*t];pose.leftArm.rotation=[-1.4*t,0,-.7*t];pose.leftLeg.rotation[0]=.3;pose.rightLeg.rotation[0]=-.2;}
  const jump=isHero?air*2.7:frame>320&&frame<360?Math.sin((frame-320)/40*Math.PI)*1.4:0;
  const root:Transform={position:[scalar(isHero?hx:rx,frame),.5+jump+(!isHero&&frame>=360?.25:0),isHero?air*1.5:frame>=320?smooth((frame-320)/40)*.4:0],rotation:[0,isHero?(frame<222?Math.PI/2:frame<276?Math.PI/2-(frame-222)/54*Math.PI*2:frame<348?-Math.PI*1.5:scalar([[348,-Math.PI*1.5],[400,-Math.PI*2+.3]],frame)):-Math.PI/2,!isHero&&frame>=320?-Math.PI/2*smooth((frame-320)/40):0],scale:[1,1,1]};
  return {pose,root};
}
for(let frame=0;frame<=431;frame+=2)for(const id of ['hero','rival']){const {pose,root}=actor(id,frame);addKey(id,frame,root);for(const bone of bones)addKey(`${id}/${bone}`,frame,pose[bone]);}
for(const id of ['hero','rival']){const {pose,root}=actor(id,431);addKey(id,431,root);for(const bone of bones)addKey(`${id}/${bone}`,431,pose[bone]);}
for(const frame of [0,120,215,276,320,360,431])addKey('guard-hand',frame,{...identity(),position:[.38,frame<280?1.12:1.25,.38]});
for(let i=0;i<22;i++){const angle=i/22*Math.PI*2,amount=1.8+noise(i,1)*4,delay=i%4,id=`shard-${i}`;project.objects.push(object(id,`Shockwave Debris ${i+1}`,'block',[-.2,.7,.1],{block:i%3===0?'minecraft:amethyst_block':'minecraft:polished_deepslate'}));for(const [frame,u,scale] of [[0,0,.001],[319+delay,0,.001],[323+delay,.04,.17],[340+delay,.5,.17],[363+delay,1,.12],[394+delay,1.5,.001],[431,1.5,.001]])addKey(id,frame,{position:[-.2+Math.cos(angle)*u*amount,.7+u*4-u*u*4,.1+Math.sin(angle)*u*amount],rotation:[u*5+i,u*8,u*3],scale:[scale,scale,scale]});}
project.objects.push(object('focus','Camera Aim','group',[0,1.4,0]));
for(const [frame,position] of [[0,[0,2,-2]],[120,[.1,1.35,0]],[216,[0,2.1,.5]],[288,[0,1.5,0]],[312,[.7,1.5,0]],[344,[-.4,1.6,-1]]] as [number,Vec3][])addKey('focus',frame,{...identity(),position},'step');
const cameras:[string,string,number,Vec3,number,Vec3,string,string?][]=[
  ['establish','The Gate',0,[12,8,14],71,[8,5,10],'focus'],
  ['hero-close','The Warden',72,[-3,2.6,4],107,[-2.5,2.6,3.4],'hero','head'],
  ['rival-close','The Sentinel',108,[4.5,2.5,3.5],119,[4,2.4,3.1],'rival','head'],
  ['duel','First Steel',120,[.1,2.9,7.2],167,[-1.1,2.7,6.4],'focus'],
  ['duel-close','Crossed Blades',168,[-2.5,2.7,5.6],215,[-1.4,2.4,5.8],'focus'],
  ['leap','Skyward',216,[5.5,5,9],287,[-4,4.5,8],'focus'],
  ['charge','The Charge',288,[-3.8,2.5,3.8],311,[-3,2.3,3.6],'hero','head'],
  ['impact','Release',312,[0,1.9,7.5],343,[-1,2.5,8.5],'focus'],
  ['final','Dawnblade',344,[5,3.1,8],431,[2.8,2.6,5.7],'focus'],
];
project.shots=[];
for(const [id,name,start,from,end,to,target,bone] of cameras){project.objects.push(object(id,name+' · Camera','camera',from,{fov:id==='final'?38:44,cameraTarget:target,targetBone:bone as BoneName|undefined}));addKey(id,start,{...identity(),position:from},'bezier');addKey(id,end,{...identity(),position:to},'bezier');project.shots.push({id:'shot-'+id,name,frame:start,cameraId:id});}
project.activeCameraId='establish';

// An original synthesized score: bass pulses, percussion, wind and frame-synchronized impacts.
const rate=48000,length=rate*18,left=new Float32Array(length),right=new Float32Array(length);
function sound(start:number,duration:number,fn:(time:number,index:number)=>number,pan=0){const offset=Math.floor(start*rate),count=Math.min(Math.floor(duration*rate),length-offset);for(let i=0;i<count;i++){const value=fn(i/rate,i);left[offset+i]+=value*(1-pan*.5);right[offset+i]+=value*(1+pan*.5);}}
sound(0,18,(t)=>{const fade=Math.min(1,t/1.3,(18-t)/1.7);return (Math.sin(t*Math.PI*110)*.017+Math.sin(t*Math.PI*164.81)*.01+Math.sin(t*Math.PI*220)*.006)*fade;});
for(let beat=0;beat<36;beat++){const time=beat*.5,freq=[55,65.406,73.416,55][Math.floor(beat/4)%4];sound(time,.4,t=>Math.sin(Math.PI*2*(freq*t+18*(1-Math.exp(-12*t))/12))*Math.exp(-10*t)*.11);if(time>=4.5&&time<14)sound(time+.25,.16,(t,i)=>(noise(i,beat)-.5)*Math.exp(-35*t)*.055);}
for(const frame of [116,132,162,194,226,264,304,315])sound(frame/24,.45,(t,i)=>(noise(i,frame)-.5)*Math.sin(t/.45*Math.PI)**2*.12,frame%2?.3:-.3);
for(const frame of [136,168,200,276,320]){sound(frame/24,.9,t=>(Math.sin(2*Math.PI*(72*t+30*(1-Math.exp(-8*t))/8))*.22+Math.sin(2*Math.PI*1291*t)*.06)*Math.exp(-7*t));sound(frame/24,.23,(t,i)=>(noise(i,frame)-.5)*Math.exp(-18*t)*.3);}
sound(320/24,2.8,t=>(Math.sin(t*Math.PI*68)*.14+Math.sin(t*Math.PI*100)*.045)*Math.exp(-1.6*t));
for(const freq of [220,261.626,329.628])sound(14.6,3.4,t=>Math.sin(t*Math.PI*2*freq)*.022*Math.min(1,t*3)*Math.exp(-.7*t));
const wav=Buffer.alloc(44+length*4);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(length*4,40);for(let i=0;i<length;i++){wav.writeInt16LE(Math.round(Math.tanh(left[i])*28000),44+i*4);wav.writeInt16LE(Math.round(Math.tanh(right[i])*28000),46+i*4);}
project.audio={name:'Ember Gate · Original Score.wav',data:'data:audio/wav;base64,'+wav.toString('base64'),startFrame:0,volume:1};
fs.writeFileSync(path.join(output,'Ember Gate.voxel'),JSON.stringify(validateProject(project)));
fs.writeFileSync(path.join(output,'Ember Gate - Score.wav'),wav);
fs.writeFileSync(path.join(output,'scene-stats.json'),JSON.stringify({frames:432,fps:24,seconds:18,objects:project.objects.length,blocks:blocks.size,tracks:Object.keys(project.tracks).length,keyframes:Object.values(project.tracks).reduce((n,keys)=>n+keys.length,0),cuts:project.shots.length},null,2));
console.log(fs.readFileSync(path.join(output,'scene-stats.json'),'utf8'));
