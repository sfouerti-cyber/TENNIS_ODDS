'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn,spawnSync} = require('node:child_process');
const {once} = require('node:events');
const {schedule,seedSeason,standings,championship} = require('./season');
const {DEFAULT_RISK} = require('./odds-engine');

const players = [...new Set(schedule.flatMap(w => w.flatMap(m => m.slice(0,2))))]
  .map(id => ({id,name:id}));

function sampleStore() {
  return {
    schema:1, currentWeek:2,
    users:[{id:'fan',name:'TestFan',salt:'fixture-salt',passwordHash:'fixture-hash',balance:910,role:'user'}],
    sessions:[{userId:'fan',tokenHash:'fixture-token',expires:4102444800000}],
    tickets:[
      {id:'historical-pending',userId:'fan',week:2,stake:90,status:'pending',
        legs:[{matchId:'legacy-id',playerId:'vic',odds:150,decimal:2.5}],projectedPayout:225,payout:0},
      {id:'paid',userId:'fan',week:2,stake:10,status:'won',
        legs:[{matchId:'legacy-id',playerId:'vic',odds:100,decimal:2}],payout:20}
    ],
    weeks:[{week:2,open:true,matches:[
      {id:'legacy-id',home:'vic',away:'fish',homeOdds:150,awayOdds:-180,winner:null},
      {id:'w2m5',home:'morris',away:'eric',homeOdds:155,awayOdds:-180,winner:'morris'}
    ]}]
  };
}

function environment(file) {
  return {...process.env,PORT:'0',NODE_ENV:'production',BTA_DATA_FILE:file,
    RAILWAY_ENVIRONMENT_ID:'',RAILWAY_VOLUME_MOUNT_PATH:'',BTA_ADMIN_PASSWORD:'fixture-admin-password'};
}

test('schedule is a complete round robin and standings preserve recorded results', () => {
  const db = sampleStore();
  const pairs = new Set();
  for (const matches of schedule) {
    assert.equal(matches.length,5);
    assert.equal(new Set(matches.flatMap(m => m.slice(0,2))).size,10);
    for (const [a,b] of matches) pairs.add([a,b].sort().join('/'));
  }
  assert.equal(pairs.size,45);
  seedSeason(db,DEFAULT_RISK);
  seedSeason(db,DEFAULT_RISK);
  assert.equal(db.weeks.length,9);
  assert.equal(db.weeks.flatMap(w => w.matches).length,45);
  const matches = db.weeks.find(w => w.week===2).matches;
  assert.deepEqual(matches.find(m => m.id==='legacy-id').setScore,[2,0]);
  assert.equal(matches.find(m => m.id==='w2m5').winner,'morris');
  assert.equal(matches.find(m => m.id==='w2m5').setScore,undefined);
  const rows = standings(players,db.weeks);
  const vic = rows.find(p => p.id==='vic');
  assert.deepEqual([vic.wins,vic.losses,vic.setsWon,vic.setsLost],[2,0,4,0]);
});

test('futures probabilities are coherent, deterministic and respond to results', () => {
  const db = {weeks:[],tickets:[]};
  seedSeason(db,DEFAULT_RISK);
  const first = championship(players,db.weeks);
  assert.equal(first.lines.length,10);
  assert.equal(first.lines.reduce((sum,l) => sum+l.probability,0),1);
  assert.deepEqual(first,championship(players,db.weeks));
  assert.ok(first.lines.every(l => l.probability>0 && l.decimal>1 && 1/l.decimal>=l.probability));
  for (const w of db.weeks) for (const m of w.matches) {
    if (!m.winner) {m.winner=m.home;m.setScore=[2,0];}
  }
  const final = championship(players,db.weeks);
  assert.notEqual(first.winner,final.winner);
  assert.equal(final.winner,standings(players,db.weeks)[0].id);
  assert.equal(final.open,false);
  assert.equal(final.lines.filter(l => l.probability===1).length,1);
});

test('production startup refuses a missing or invalid store', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'bta-startup-'));
  t.after(() => fs.rmSync(tmp,{recursive:true,force:true}));
  const dbPath = path.join(tmp,'db.json');
  const start = () => spawnSync(process.execPath,['server.js'],{
    cwd:__dirname,env:environment(dbPath),encoding:'utf8',timeout:3000
  });
  assert.match(start().stderr,/Existing BTA database required/);
  assert.equal(fs.existsSync(dbPath),false);
  fs.writeFileSync(dbPath,'{}');
  assert.match(start().stderr,/Unrecognized BTA database/);
  assert.equal(fs.readFileSync(dbPath,'utf8'),'{}');
});

test('migration preserves private records and backup through repeated startup', async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'bta-migration-'));
  t.after(() => fs.rmSync(tmp,{recursive:true,force:true}));
  const dbPath = path.join(tmp,'db.json');
  const original = sampleStore();
  const contents = JSON.stringify(original,null,2);
  fs.writeFileSync(dbPath,contents);

  async function startAndStop() {
    const child = spawn(process.execPath,['server.js'],{cwd:__dirname,env:environment(dbPath)});
    try {
      const [chunk] = await Promise.race([once(child.stdout,'data'),once(child,'exit')]);
      assert.match(String(chunk),/running at/);
    } finally {
      const exit=once(child,'exit');
      child.kill();
      await exit;
    }
  }
  await startAndStop();
  const migrated = fs.readFileSync(dbPath,'utf8');
  const data = JSON.parse(migrated);
  assert.equal(data.schema,2);
  assert.equal(data.weeks.find(w=>w.week===2).matches.find(m=>m.id==='legacy-id').historicalReview,true);
  for (const key of ['users','sessions','tickets']) assert.deepEqual(data[key],original[key]);
  assert.equal(fs.readFileSync(dbPath+'.pre-season.bak','utf8'),contents);
  assert.equal(fs.statSync(dbPath+'.pre-season.bak').mode & 0o777,0o600);
  await startAndStop();
  assert.equal(fs.readFileSync(dbPath,'utf8'),migrated);
});

test('historical parlays remain untouched until every backfilled result is confirmed', async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'bta-historical-parlays-'));
  t.after(() => fs.rmSync(tmp,{recursive:true,force:true}));
  const dbPath = path.join(tmp,'db.json');
  const original = sampleStore();
  const week = original.weeks[0];
  week.matches[1].winner = null;
  const base = {week:2,userId:'fan',status:'pending',stake:25,projectedPayout:100,
    payout:0,settledAt:null};
  const parlay = (id, pick) => ({...base,id,legs:[
    {matchId:'legacy-id',playerId:pick,odds:100,decimal:2},
    {matchId:'w2m5',playerId:'eric',odds:100,decimal:2}
  ]});
  const winning = parlay('winning','vic');
  const losing = parlay('losing','fish');
  const paid = original.tickets.find(ticket => ticket.id==='paid');
  original.tickets = [winning,losing,paid];
  fs.writeFileSync(dbPath,JSON.stringify(original));

  const child = spawn(process.execPath,['server.js'],{cwd:__dirname,env:environment(dbPath)});
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child,'exit');
    child.kill();
    await exited;
  });
  const [line] = await Promise.race([once(child.stdout,'data'),once(child,'exit')]);
  const port = String(line).match(/localhost:(\d+)/)?.[1];
  assert.ok(Number(port)>0,'fixture server must report its listening port');
  const post = (endpoint, body, cookie) => fetch(`http://127.0.0.1:${port}${endpoint}`,{
    method:'POST', headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},
    body:JSON.stringify(body)
  });
  const read = () => JSON.parse(fs.readFileSync(dbPath,'utf8'));
  const migrated = read();
  assert.deepEqual(migrated.users,original.users);
  assert.deepEqual(migrated.tickets,original.tickets);
  assert.equal(migrated.weeks.find(w => w.week===2).matches.filter(m => m.historicalReview).length,2);

  const login = await post('/api/login',{username:'admin',password:'fixture-admin-password'});
  assert.equal(login.status,200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const confirm = async (matchId,winner,setScore) => {
    const response = await post('/api/admin/result',{week:2,matchId,winner,setScore},cookie);
    assert.equal(response.status,200,await response.text());
  };
  await confirm('legacy-id','vic',[2,0]);
  await confirm('legacy-id','vic',[2,0]);
  const held = read();
  assert.equal(held.weeks.find(w => w.week===2).matches.filter(m => m.historicalReview).length,1);
  assert.deepEqual(held.tickets,original.tickets);
  assert.deepEqual(held.users,original.users);

  await confirm('w2m5','eric',[0,2]);
  const settled = read();
  assert.deepEqual(settled.tickets.map(t => t.status),['won','lost','won']);
  assert.deepEqual(settled.tickets.map(t => t.payout),[100,0,20]);
  assert.ok(settled.tickets.slice(0,2).every(t => Number.isFinite(t.settledAt)));
  assert.deepEqual(settled.tickets[2],paid);
  assert.equal(settled.users[0].balance,1010);

  await confirm('w2m5','eric',[0,2]);
  await confirm('legacy-id','vic',[2,0]);
  assert.deepEqual(read(),settled);
});
