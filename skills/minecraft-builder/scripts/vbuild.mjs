import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const skill=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await readFile(path.join(skill,'engine.json'),'utf8'));
const root=path.resolve(skill,config.root);
const args=process.argv.slice(2);
const start=args[0]==='start';
const result=spawnSync(process.execPath,[path.join(root,start?'builder/start.cjs':'builder/cli.mjs'),...(start?args.slice(1):args)],{cwd:process.cwd(),env:{...process.env,VOXEL_BUILD_DATA:process.env.VOXEL_BUILD_DATA||path.join(root,'builder-data')},stdio:'inherit',windowsHide:true});
if(result.error) {console.error(result.error.message);process.exit(1);}
process.exit(result.status??1);
