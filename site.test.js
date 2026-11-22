const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {spawn}=require('node:child_process');
const {quote,DEFAULT_RISK,decimal,implied}=require('./odds-engine');

test('vig raises combined implied probability and exposure moves odds against popular picks',()=>{
 const q=quote(-350,280,DEFAULT_RISK,0,0);
 assert.ok(q.homeOdds<-350);assert.ok(q.awayOdds<280);
 assert.ok(q.estimatedOverroundPct>=19.7 && q.estimatedOverroundPct<=20.3);
 const moved=quote(-350,280,DEFAULT_RISK,200,0);
 assert.ok(moved.homeOdds<q.homeOdds);assert.ok(moved.awayOdds>q.awayOdds);
 const opposite=quote(-350,280,DEFAULT_RISK,0,200);
 assert.ok(opposite.homeOdds>q.homeOdds);assert.ok(opposite.awayOdds<q.awayOdds);
});

test('multi-user betting, locked quotes, commissioner tools, and settlement',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bta-test-'));
 const port=34000+Math.floor(Math.random()*15000);const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,PORT:String(port),NODE_ENV:'test',RAILWAY_ENVIRONMENT_ID:'',RAILWAY_VOLUME_MOUNT_PATH:'',BTA_DATA_FILE:path.join(tmp,'db.json'),BTA_ADMIN_PASSWORD:'very-strong-test-password'},stdio:'pipe'});
 t.after(()=>{child.kill();fs.rmSync(tmp,{recursive:true,force:true});});
 let ready=false;for(let i=0;i<50;i++){
  try{const r=await fetch(base+'/api/league');if(r.ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 assert.equal(ready,true,'server starts');
 const api=async(path,method='GET',data,cookie)=>{
  const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}: {})},body:data?JSON.stringify(data):undefined});
  return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
 };
 const initial=(await api('/api/league')).data;
 const week=initial.weeks.find(w=>w.week===2),jack=week.matches[0];
 assert.equal(week.risk,undefined);assert.equal(week.matches.length,5);
 assert.ok(jack.homeOdds<-350);
 const fan=(await api('/api/register','POST',{username:'tennisfan1',password:'test-password-abcdefgh'}));
 assert.equal(fan.status,200);assert.equal(fan.data.user.balance,1000);
 const cookie=fan.cookie;
 const placed=await api('/api/tickets','POST',{stake:200,picks:[{matchId:'w2m1',playerId:'jack',expectedOdds:jack.homeOdds}]},cookie);
 assert.equal(placed.status,201,JSON.stringify(placed));assert.equal(placed.data.balance,800);
 assert.equal(placed.data.ticket.legs[0].odds,jack.homeOdds);
 let league=(await api('/api/league')).data;
 const moved=league.weeks.find(w=>w.week===2).matches[0];
 assert.ok(moved.homeOdds<jack.homeOdds,'popular side gets worse price');
 assert.ok(moved.awayOdds>jack.awayOdds,'opposite side gets better price');
 assert.ok(moved.lineHistory.length>=1);
 const stale=await api('/api/tickets','POST',{stake:10,picks:[{matchId:'w2m1',playerId:'jack',expectedOdds:jack.homeOdds}]},cookie);
 assert.equal(stale.status,409,'stale odds rejected');
 let fan2=await api('/api/register','POST',{username:'tennisfan2',password:'test-password-abcdefgh'});
 const opposite=await api('/api/tickets','POST',{stake:100,picks:[{matchId:'w2m1',playerId:'jacob',expectedOdds:moved.awayOdds}]},fan2.cookie);
 assert.equal(opposite.status,201);
 const admin=await api('/api/login','POST',{username:'admin',password:'very-strong-test-password'});
 assert.equal(admin.status,200);
 const dashboard=(await api('/api/admin/dashboard','GET',undefined,admin.cookie)).data;
 const revised=await api('/api/admin/week','POST',{matches:dashboard.league.weeks.find(w=>w.week===2).matches,open:true,risk:{vigPct:25,movePer100:1.5,maxMovePct:10}},admin.cookie);
 assert.equal(revised.status,200,JSON.stringify(revised));assert.equal(revised.data.weeks.find(w=>w.week===2).risk.vigPct,25);
 const newq=revised.data.weeks.find(w=>w.week===2).matches[0];assert.ok(newq.estimatedOverroundPct>24);
 const result=await api('/api/admin/result','POST',{week:2,matchId:'w2m1',winner:'jack',setScore:[2,0]},admin.cookie);
 assert.equal(result.status,200);
 const retry=await api('/api/admin/result','POST',{week:2,matchId:'w2m1',winner:'jack',setScore:[2,0]},admin.cookie);
 assert.equal(retry.status,200);
 const replay=await api('/api/tickets','POST',{stake:10,picks:[{matchId:'w2m1',playerId:'jack',expectedOdds:jack.homeOdds}]},cookie);
 assert.equal(replay.status,400);
 const board=(await api('/api/activity')).data;
 const leader=board.leaderboard.find(row=>row.name==='tennisfan1');
 assert.equal(leader.balance,800+Math.round(decimal(jack.homeOdds)*200*100)/100);
 assert.equal(leader.won,1);
 assert.equal(board.tickets.length,2);
 assert.ok(!JSON.stringify(board).match(/passwordHash|tokenHash|userId/));
 assert.equal((await api('/api/admin/dashboard')).status,401);
 assert.equal((await api('/api/admin/dashboard','GET',undefined,cookie)).status,403);
 assert.equal((await api('/api/admin/dashboard','GET',undefined,admin.cookie)).data.tickets.length,2);
 const tickets1=(await api('/api/me','GET',undefined,cookie)).data.tickets;
 const tickets2=(await api('/api/me','GET',undefined,fan2.cookie)).data.tickets;
 assert.equal(tickets1[0].status,'won');assert.equal(tickets2[0].status,'lost');
 assert.equal(tickets1[0].payout,Math.round(decimal(jack.homeOdds)*200*100)/100,'locked original quote settles even after moving');
 const next=await api('/api/admin/next-week','POST',{},admin.cookie);
 assert.equal(next.status,200);assert.equal(next.data.currentWeek,3);assert.equal(next.data.weeks.find(w=>w.week===3).open,false);
 assert.equal(next.data.weeks.find(w=>w.week===3).risk.vigPct,20);
 // Publish the copied schedule and verify a two-leg parlay settles on locked quotes.
 const week3=next.data.weeks.find(w=>w.week===3);
 const opened=await api('/api/admin/week','POST',{matches:week3.matches,open:true,risk:week3.risk},admin.cookie);
 assert.equal(opened.status,200,JSON.stringify(opened));
 const w3=opened.data.weeks.find(w=>w.week===3),m1=w3.matches[0],m2=w3.matches[1];
 const combo=await api('/api/tickets','POST',{stake:10,picks:[
  {matchId:m1.id,playerId:m1.home,expectedOdds:m1.homeOdds},
  {matchId:m2.id,playerId:m2.away,expectedOdds:m2.awayOdds}
 ]},cookie);
 assert.equal(combo.status,201,JSON.stringify(combo));
 assert.equal(combo.data.ticket.legs.length,2);
 let r=await api('/api/admin/result','POST',{week:3,matchId:m1.id,winner:m1.home,setScore:[2,1]},admin.cookie);
 assert.equal(r.status,200);
 let latest=(await api('/api/me','GET',undefined,cookie)).data.tickets[0];
 assert.equal(latest.status,'pending','parlay requires every leg');
 r=await api('/api/admin/result','POST',{week:3,matchId:m2.id,winner:m2.away,setScore:[0,2]},admin.cookie);
 assert.equal(r.status,200);
 latest=(await api('/api/me','GET',undefined,cookie)).data.tickets[0];
 assert.equal(latest.status,'won');
 assert.equal(latest.payout,Math.round(decimal(m1.homeOdds)*decimal(m2.awayOdds)*1000)/100);

 const futuresBefore=(await api('/api/league')).data.futures;
 const future=futuresBefore.lines.find(line=>line.playerId==='jack');
 const futureTicket=await api('/api/tickets','POST',{stake:25,picks:[{
  matchId:'championship',playerId:'jack',expectedOdds:future.odds
 }]},cookie);
 assert.equal(futureTicket.status,201);
 assert.equal(futureTicket.data.ticket.legs[0].decimal,future.decimal);
 const stillPending=(await api('/api/league')).data.weeks.flatMap(w=>w.matches.map(m=>({...m,week:w.week}))).filter(m=>!m.winner);
 for(const m of stillPending){
  const winner=m.away==='jack'?m.away:m.home;
  const score=winner===m.home?[2,0]:[0,2];
  const completion=await api('/api/admin/result','POST',{week:m.week,matchId:m.id,winner,setScore:score},admin.cookie);
  assert.equal(completion.status,200);
 }
 const after=(await api('/api/me','GET',undefined,cookie)).data;
 assert.equal(after.tickets[0].status,'won');
 assert.equal(after.tickets[0].payout,Math.round(25*future.decimal*100)/100);
 assert.equal((await api('/api/league')).data.futures.winner,'jack');
 const last=stillPending.at(-1);
 await api('/api/admin/result','POST',{week:last.week,matchId:last.id,winner:last.home,setScore:[2,0]},admin.cookie);
 assert.equal((await api('/api/me','GET',undefined,cookie)).data.user.balance,after.user.balance);

});
