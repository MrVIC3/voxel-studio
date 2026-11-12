import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer, atomic } from '../server.mjs';
import { AIR, inside, key, pack, pos, state } from '../core.mjs';
async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'voxel-build-test-')),
    world = new Map(),
    jobs = new Map(),
    token = 'a'.repeat(64);
  let worldId = 'test-world',
    dropNext = false,
    rejectNext = false;
  const game = http.createServer(async (req, res) => {
    try {
      assert.equal(req.headers.authorization, 'Bearer ' + token);
      let raw = '';
      for await (const c of req) raw += c;
      const body = raw ? JSON.parse(raw) : {};
      let result;
      const route = new URL(req.url, 'http://local');
      if (route.pathname === '/status') result = { worldId, dimensions: ['minecraft:overworld'] };
      else if (route.pathname === '/states') result = { states: body.states.map(state) };
      else if (route.pathname === '/snapshot')
        result = {
          worldId,
          dimension: body.dimension,
          ...pack(new Map([...world].filter(([k]) => inside(pos(k), body.bounds)))),
          protected: [],
        };
      else if (route.pathname === '/job') {
        result = jobs.get(route.searchParams.get('id'));
        if (!result) throw Error('Unknown job ID');
      } else if (route.pathname === '/apply') {
        if (dropNext) {
          dropNext = false;
          req.socket.destroy();
          return;
        }
        result = jobs.get(body.id);
        if (result) {
          assert.deepEqual(result.changes, body.changes);
        } else {
          const bad =
            rejectNext || body.changes.some((c) => (world.get(key(c.pos)) || AIR) !== c.before);
          rejectNext = false;
          result = {
            id: body.id,
            phase: bad ? 'rejected' : 'complete',
            changes: body.changes,
            error: bad ? 'World changed' : '',
          };
          jobs.set(body.id, result);
          if (!bad)
            for (const c of body.changes)
              c.after === AIR ? world.delete(key(c.pos)) : world.set(key(c.pos), c.after);
        }
      } else throw Error('Unknown route');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  await new Promise((resolve) => game.listen(0, '127.0.0.1', resolve));
  const config = path.join(root, 'bridge.json');
  await writeFile(config, JSON.stringify({ port: game.address().port, token }));
  const engine = await startServer({
    root,
    render: async (request) => ({
      images: request.views.map((view) => ({
        view,
        png: Buffer.from('test-image').toString('base64'),
      })),
      missing: [],
      assets: 'test-fixture',
    }),
  });
  try {
    await engine.command('connect', { config });
  } catch (e) {
    console.error('SETUP ERROR', e);
    throw e;
  }
  t.after(async () => {
    await engine.close();
    await new Promise((resolve) => game.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    world,
    jobs,
    engine,
    command: engine.command,
    drop: () => {
      dropNext = true;
    },
    reject: () => {
      rejectNext = true;
    },
    setWorld: (id) => {
      worldId = id;
    },
  };
}
const area = { min: [0, 60, 0], max: [20, 80, 20] };
const plan = {
  version: 1,
  operations: [{ op: 'fill', from: [1, 64, 1], to: [5, 64, 5], block: 'stone' }],
};
async function reviewed(c) {
  await c('render', { id: 'house' });
  await c('review', {
    id: 'house',
    text: 'Inspected the fixture views for layout, circulation, roof joins and material continuity.',
  });
}
test('live capture/draft/review/commit/verify/undo round trip and host authentication', async (t) => {
  const { command: c, engine, world } = await setup(t);
  assert.equal(
    (
      await fetch('http://127.0.0.1:' + engine.session.port + '/command', {
        method: 'POST',
        body: '{}',
      })
    ).status,
    403,
  );
  world.set('0,60,0', 'minecraft:dirt');
  await c('init', { id: 'house', bounds: area });
  await c('checkpoint', { id: 'house', name: 'terrain' });
  await c('stage', { id: 'house', plan });
  await assert.rejects(c('commit', { id: 'house' }), /visual review/);
  await reviewed(c);
  const result = await c('commit', { id: 'house' });
  assert.equal(result.committed, 25);
  assert.equal(world.size, 26);
  assert.equal((await c('verify', { id: 'house' })).matches, true);
  await assert.rejects(c('restore', { id: 'house', name: 'terrain' }), /earlier world baseline/);
  await c('undo', { id: 'house' });
  assert.equal(world.size, 1);
  assert.equal((await c('verify', { id: 'house' })).matches, true);
});
test('ambiguous submission persists intent and retry reconciles identical IDs without duplicate edits', async (t) => {
  const { command: c, drop, root, jobs } = await setup(t);
  await c('init', { id: 'house', bounds: area });
  await c('stage', { id: 'house', plan });
  await reviewed(c);
  drop();
  await assert.rejects(c('commit', { id: 'house' }));
  const before = JSON.parse(await readFile(path.join(root, 'projects/house/project.json'), 'utf8'));
  assert(before.pending);
  const result = await c('commit', { id: 'house' });
  assert.equal(result.changed, 0);
  assert.equal(jobs.size, 1);
  assert.equal([...jobs.keys()][0], before.pending.id);
});
test('external changes reject CAS, survive undo, and appear in verification', async (t) => {
  const { command: c, world } = await setup(t);
  await c('init', { id: 'house', bounds: area });
  await c('stage', { id: 'house', plan });
  await reviewed(c);
  world.set('1,64,1', 'minecraft:gold_block');
  await assert.rejects(c('commit', { id: 'house' }), /rejected/);
  assert.equal(world.get('1,64,1'), 'minecraft:gold_block');
  const report = await c('verify', { id: 'house' });
  assert.equal(report.matches, false);
  assert(report.mismatchCount > 0);
});
test('draft failures are atomic, checkpoints restore, and stale reviews cannot commit', async (t) => {
  const { command: c } = await setup(t);
  await c('init', { id: 'house', bounds: area });
  await c('checkpoint', { id: 'house', name: 'before' });
  await assert.rejects(
    c('stage', {
      id: 'house',
      plan: { version: 1, operations: [{ op: 'set', at: [100, 64, 0], block: 'stone' }] },
    }),
    /outside/,
  );
  assert.equal((await c('info', { id: 'house' })).revision, 0);
  await c('stage', { id: 'house', plan });
  await reviewed(c);
  await c('restore', { id: 'house', name: 'before' });
  assert.equal((await c('info', { id: 'house' })).changed, 0);
  await assert.rejects(c('commit', { id: 'house' }), /visual review/);
});
test('wrong world identity prevents edits and offline projects cannot be committed', async (t) => {
  const { command: c, setWorld } = await setup(t);
  await c('init', { id: 'house', bounds: area });
  setWorld('different');
  await assert.rejects(c('commit', { id: 'house' }), /does not match/);
  await c('init', { id: 'offline', bounds: area, offline: true });
  await assert.rejects(c('commit', { id: 'offline' }), /Offline/);
});
test('undo reconciles after a dropped request and does not undo the next receipt', async (t) => {
  const { command: c, drop, world } = await setup(t);
  await c('init', { id: 'house', bounds: area });
  await c('stage', { id: 'house', plan });
  await reviewed(c);
  await c('commit', { id: 'house' });
  drop();
  await assert.rejects(c('undo', { id: 'house' }));
  assert.equal((await c('undo', { id: 'house' })).reconciled, true);
  assert.equal(world.size, 0);
  assert.equal((await c('info', { id: 'house' })).receipts.length, 0);
});
test('receipt history stays compact and supports multiple ordered live undos', async (t) => {
  const { command: c, world, root } = await setup(t);
  await c('init', { id: 'house', bounds: area });
  await c('stage', { id: 'house', plan });
  await reviewed(c);
  await c('commit', { id: 'house' });
  await c('stage', {
    id: 'house',
    plan: { version: 1, operations: [{ op: 'set', at: [1, 65, 1], block: 'oak_planks' }] },
  });
  await reviewed(c);
  await c('commit', { id: 'house' });
  const p = JSON.parse(await readFile(path.join(root, 'projects/house/project.json'), 'utf8'));
  assert.equal(p.receipts.length, 2);
  assert(p.receipts.every((r) => !r.changes && r.changed > 0));
  await c('undo', { id: 'house' });
  assert.equal(world.size, 25);
  await c('undo', { id: 'house' });
  assert.equal(world.size, 0);
});
test('composite rendering reviews large disjoint districts without expanding edit bounds', async (t) => {
  const { command: c, root } = await setup(t);
  await c('init', { id: 'north', bounds: { min: [0, 0, 0], max: [79, 59, 79] }, offline: true });
  await c('init', { id: 'south', bounds: { min: [0, 0, 80], max: [79, 59, 159] }, offline: true });
  await c('stage', {
    id: 'north',
    plan: { version: 1, operations: [{ op: 'set', at: [1, 2, 3], block: 'stone' }] },
  });
  await c('stage', {
    id: 'south',
    plan: { version: 1, operations: [{ op: 'set', at: [1, 2, 83], block: 'stone' }] },
  });
  const r = await c('render', { id: 'north', context: ['south'] });
  assert.equal(r.context.length, 2);
  assert.deepEqual(r.bounds, { min: [0, 0, 0], max: [79, 59, 159] });
  for (const id of ['north', 'south']) {
    const p = JSON.parse(await readFile(path.join(root, 'projects', id, 'project.json'), 'utf8'));
    assert.equal(p.renders.at(-1).revision, p.revision);
    await c('review', {
      id,
      text: 'Composite fixture views inspected for coherent composition and unobstructed circulation across district boundaries.',
    });
  }
  await assert.rejects(
    c('stage', {
      id: 'north',
      plan: { version: 1, operations: [{ op: 'set', at: [1, 2, 83], block: 'stone' }] },
    }),
    /outside/,
  );
});

test('repeat preparation is idempotent; checkpoint regeneration removes omitted cells atomically', async (t) => {
  const {command:c,root}=await setup(t);
  await c('init',{id:'house',bounds:area});
  await c('checkpoint',{id:'house',name:'site'});
  const first=await c('stage',{id:'house',plan});
  await reviewed(c);
  const again=await c('stage',{id:'house',plan});
  assert.equal(again.revision,first.revision);assert.equal(again.unchanged,true);assert(again.review);
  const smaller={version:1,operations:[{op:'set',at:[1,64,1],block:'stone'}]};
  const replaced=await c('stage',{id:'house',plan:smaller,fromCheckpoint:'site'});
  assert.equal(replaced.changed,1);assert.equal(replaced.revision,first.revision+1);
  const before=await readFile(path.join(root,'projects/house/project.json'),'utf8');
  await assert.rejects(c('stage',{id:'house',fromCheckpoint:'site',plan:{version:1,operations:[{op:'set',at:[500,64,1],block:'stone'}]}}),/outside/);
  assert.equal(await readFile(path.join(root,'projects/house/project.json'),'utf8'),before);
});

test('pinned approved details include air and survive replacement audit rules',async(t)=>{
  const {command:c}=await setup(t);await c('init',{id:'house',bounds:area});await c('stage',{id:'house',plan});
  await c('pin',{id:'house',name:'approved-eyes',bounds:{min:[1,64,1],max:[1,65,1]}});
  await c('stage',{id:'house',plan:{version:1,operations:[{op:'set',at:[1,65,1],block:'obsidian'}]}});
  const r=await c('audit',{id:'house',rules:[]});assert.equal(r.failures[0].name,'approved-eyes');assert.equal(r.failures[0].count,1);
  await assert.rejects(reviewed(c),/audit/);
  await c('unpin',{id:'house',name:'approved-eyes'});assert.deepEqual((await c('audit',{id:'house'})).failures,[]);
});

test('composite review refuses stale neighboring geometry and render files preserve distinct cameras',async(t)=>{
 const {command:c}=await setup(t);
 for(const [id,bounds]of[['house',area],['neighbor',{min:[21,60,0],max:[30,80,20]}]])await c('init',{id,bounds});
 await c('stage',{id:'house',plan});
 const r=await c('render',{id:'house',context:['neighbor']});
 const other=await c('render',{id:'house',context:['neighbor'],camera:{position:[0,90,40],target:[0,64,0]}});
 assert.notEqual(r.files[0],other.files[0]);
 await c('review',{id:'house',text:'Inspected the composite perspectives, top and elevations for seams, scale and materials.'});
 await c('stage',{id:'neighbor',plan:{version:1,operations:[{op:'set',at:[22,64,1],block:'stone'}]}});
 await assert.rejects(c('review',{id:'house',text:'Inspected all actual composite images for coherent and unobstructed circulation.'}),/Render and inspect/);
 await assert.rejects(c('commit',{id:'house'}),/context changed/);
});

test('manifest prepares disjoint districts and delivers only after explicit image findings',async(t)=>{
 const {command:c,world}=await setup(t);
 const spec={version:1,projects:[{id:'house',bounds:area,plan},{id:'neighbor',bounds:{min:[21,60,0],max:[30,80,20]},plan:{version:1,operations:[{op:'set',at:[22,64,1],block:'stone'}]}}]};
 const prepared=await c('prepare',spec);assert.equal(prepared.phase,'inspect-images');assert.equal(prepared.renders.length,1);
 await assert.rejects(c('deliver',spec),/Visual review required/);assert.equal(world.size,0);
 const ready=await c('prepare',spec);assert(ready.projects.every(p=>p.unchanged));
 const delivered=await c('deliver',{...spec,findings:'Inspected actual composite top, perspective, front and right images; verified both districts, joins and circulation.'});
 assert.equal(delivered.phase,'verified');assert.equal(world.size,26);assert(delivered.projects.every(p=>p.verification.matches));
 assert((await c('timings')).commands.some(r=>r.action==='render'&&r.ok));
});

test('architectural engine flow rejects generic review, preserves metadata and invalidates design evidence',async(t)=>{
 const {command:c,root}=await setup(t);await c('init',{id:'house',bounds:area});
 const design={version:1,intent:'Masonry entrance with deliberate depth and a reserved opening.',frame:{min:[0,60,0],max:[12,77,8]},components:[{id:'gate',role:'main entry',type:'gateway',at:[1,64,1]}],evidence:['overview','detail']};
 const staged=await c('stage',{id:'house',design});assert(staged.architecture.hash);
 await assert.rejects(c('stage',{id:'house',plan}),/design source/);
 await assert.rejects(reviewed(c),/designHash/);
 const overview=await c('render',{id:'house',label:'overview'});
 const detail=await c('render',{id:'house',label:'detail',camera:{position:[5,68,-10],target:[5,68,1]}});
 const assessment={designHash:staged.architecture.hash,defects:[],criteria:['composition','detail','functionality'].map(category=>({category,findings:'Inspected gate proportions, deep masonry reveal and unobstructed opening in the supplied images.',evidence:[overview.id,detail.id]}))};
 await c('review',{id:'house',assessment});
 const again=await c('stage',{id:'house',design});assert.equal(again.unchanged,true);assert(again.review);
 const changed=await c('stage',{id:'house',design:{...design,intent:'A revised entrance intent requires fresh evidence even with identical voxels.'}});assert.equal(changed.revision,staged.revision+1);assert.equal(changed.review,null);
 assert((await readFile(path.join(root,'projects/house/provenance/'+staged.revision+'.json'),'utf8')).includes('gate'));
});
