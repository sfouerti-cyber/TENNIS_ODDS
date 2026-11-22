// BTA Tennis League — free-to-play, virtual-credit prediction game.
// No real-money deposits, cash-out, payment processing, or wagering is supported.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const {DEFAULT_RISK, validMoneyline, riskSettings, validRisk, quote} = require('./odds-engine');
const {atomicWrite, readStore, backupMigration} = require('./storage');
const {seedSeason, standings, championship} = require('./season');
const production = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT_ID;
if (production && !process.env.BTA_DATA_FILE) throw Error('Set BTA_DATA_FILE to the existing persistent database.');
if (process.env.RAILWAY_VOLUME_MOUNT_PATH &&
    path.resolve(process.env.BTA_DATA_FILE || '') !== path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH,'db.json')) {
 throw Error('BTA_DATA_FILE must point to db.json on the Railway volume.');
}
const ROOT=__dirname, PUBLIC=path.join(ROOT,'public'), DBPATH=process.env.BTA_DATA_FILE?path.resolve(process.env.BTA_DATA_FILE):path.join(ROOT,'data','db.json');
const PORT=Number(process.env.PORT||3000);
const ADMIN_PASSWORD=process.env.BTA_ADMIN_PASSWORD||'';
const players=[
{id:'jack',name:'Jack Feldman',image:'/assets/jack.webp',tagline:'The wildcard'},
{id:'jacob',name:'Jacob Ebani',alias:'Ebani',image:'/assets/jacob.webp',tagline:'The newcomer'},
{id:'joe-d',name:'Joseph',alias:'Joe D',image:'/assets/joe-d.webp',tagline:'The underdog'},
{id:'joey',name:'Joey',image:'/assets/joey.webp',tagline:'The power server'},
{id:'fish',name:'Jacob Shalam',alias:'Fish',image:'/assets/fish.webp',tagline:'The comeback king'},
{id:'vic',name:'Victor Shalom',alias:'Vic',image:'/assets/vic.webp',tagline:'The contender'},
{id:'ryan',name:'Ryan',image:'/assets/ryan.webp',tagline:'The dark horse'},
{id:'soly',name:'Soly Fourti',image:'/assets/soly.webp',tagline:'The challenger'},
{id:'morris',name:'Morris Edery',image:'/assets/morris.webp',tagline:'The tactician'},
{id:'eric',name:'Eric Sutton',image:'/assets/eric.webp',tagline:'The strategist'}
];
const starterMatches=[
{ id:'w2m1', home:'jack',away:'jacob', homeOdds:-350,awayOdds:280,winner:null,venue:'TBD'},
{ id:'w2m2', home:'joe-d',away:'joey', homeOdds:300,awayOdds:-375,winner:null,venue:'TBD'},
{ id:'w2m3', home:'fish',away:'vic', homeOdds:-155,awayOdds:130,winner:null,venue:'TBD',featured:true},
{ id:'w2m4', home:'ryan',away:'soly', homeOdds:180,awayOdds:-215,winner:null,venue:'TBD'},
{ id:'w2m5', home:'morris',away:'eric', homeOdds:155,awayOdds:-180,winner:null,venue:'TBD'}
];
function newDB(){return {schema:1, currentWeek:2, weeks:[{week:2,open:true,risk:{...DEFAULT_RISK},matches:starterMatches.map(m=>({...m,baseHomeOdds:m.homeOdds,baseAwayOdds:m.awayOdds,lineHistory:[]})),updatedAt:Date.now()}], users:[], sessions:[], tickets:[]};}
const loaded = readStore(DBPATH,newDB,production);
let db = loaded.db;
let committed = loaded.original;
let futuresCache;
const futuresMarketId = 'championship';

function save(exclusive = false) {
 db.revision = (db.revision || 0) + 1;
 try {
  if (!exclusive && fs.readFileSync(DBPATH,'utf8') !== committed) {
   throw Error('The BTA database changed outside this process. Refusing to overwrite it.');
  }
  const contents = JSON.stringify(db);
  atomicWrite(DBPATH,contents,exclusive);
  committed = contents;
  futuresCache = undefined;
 } catch (error) {
  if (committed) db = JSON.parse(committed);
  futuresCache = undefined;
  throw error;
 }
}

if (db.schema === 1) {
 if (loaded.original !== null) backupMigration(DBPATH,loaded.original);
 for (const w of db.weeks) {
  w.risk = riskSettings(w.risk);
  for (const m of w.matches) {
   m.baseHomeOdds ??= m.homeOdds;
   m.baseAwayOdds ??= m.awayOdds;
   m.lineHistory ??= [];
   m.winner ??= null;
  }
 }
 seedSeason(db,DEFAULT_RISK);
 db.schema = 2;
 save(loaded.original === null);
}

function send(res,status,body){let data=JSON.stringify(body);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(data),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);}
function err(res,status,message){send(res,status,{error:message});}
function hash(p,s){return crypto.scryptSync(p,s,64).toString('hex');}
function cookieValue(req,key){const c=req.headers.cookie||'';let found=c.split(';').map(s=>s.trim()).find(x=>x.startsWith(key+'='));return found?found.slice(key.length+1):'';}
function identity(req){const token=cookieValue(req,'bta_session');if(!token) return null;const session=db.sessions.find(s=>s.tokenHash===crypto.createHash('sha256').update(token).digest('hex')&&s.expires>Date.now());if(!session) return null;return session.userId==='ADMIN'?{id:'ADMIN',name:'BTA Commissioner',role:'admin'}:db.users.find(u=>u.id===session.userId)||null;}
function createSession(res,id,req){const token=crypto.randomBytes(32).toString('hex');db.sessions=db.sessions.filter(s=>s.expires>Date.now());db.sessions.push({userId:id,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),expires:Date.now()+14*24*60*60*1000});save();const secure=(req.socket.encrypted||req.headers['x-forwarded-proto']==='https')?'; Secure':'';res.setHeader('Set-Cookie',`bta_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600${secure}`);}
function userPublic(u){if(!u)return null;return {name:u.name,role:u.role||'user',balance:u.role==='admin'?null:u.balance};}
function current(){return db.weeks.find(w=>w.week===db.currentWeek);}
function oddsToDecimal(n){return n>0?1+n/100:1+100/(-n);}
function toMoney(n){return Math.round((n+Number.EPSILON)*100)/100;}
function isOdds(n){return validMoneyline(n);}
function futures() {
 return futuresCache ??= championship(players,db.weeks,db.futures);
}

function settleTickets() {
 for (const ticket of db.tickets) {
  if (ticket.status !== 'pending') continue;
  const user = db.users.find(u => u.id === ticket.userId);
  if (!user) continue;
  const week = db.weeks.find(w => w.week === ticket.week);
  const results = ticket.legs.map(leg => {
   if (leg.matchId === futuresMarketId) return futures().winner;
   const match = week?.matches.find(m => m.id === leg.matchId);
   return match?.historicalReview ? null : match?.winner ?? null;
  });
  if (results.some((r,i) => r && r !== 'void' && r !== ticket.legs[i].playerId)) {
   ticket.status = 'lost';
  } else if (results.every(r => r !== null)) {
   const factor = ticket.legs.reduce((p,l,i) => p * (results[i] === 'void' ? 1 : l.decimal),1);
   ticket.status = results.every(r => r === 'void') ? 'void' : 'won';
   ticket.payout = toMoney(ticket.stake * factor);
   user.balance = toMoney(user.balance + ticket.payout);
  } else continue;
  ticket.settledAt = Date.now();
 }
}

function activity(ticket, name) {
 const week = db.weeks.find(w => w.week === ticket.week);
 return {
  name, week:ticket.week, stake:ticket.stake, decimal:ticket.decimal,
  projectedPayout:ticket.projectedPayout, payout:ticket.payout, status:ticket.status,
  placedAt:ticket.placedAt, settledAt:ticket.settledAt,
  legs:ticket.legs.map(({matchId,playerId,odds}) => {
   const match = week?.matches.find(m => m.id === matchId);
   return {playerId,odds,matchId,opponent:match ? (match.home === playerId ? match.away : match.home) : null};
  })
 };
}

function bettingData() {
 const rows = new Map(db.users.map(u => [u.id,{name:u.name,balance:u.balance,total:0,
  won:0,lost:0,pending:0,void:0,net:0,staked:0,returned:0}]));
 const tickets = db.tickets.map(t => {
  const row = rows.get(t.userId);
  if (row) {
   row.total++;
   if (['won','lost','pending','void'].includes(t.status)) row[t.status]++;
   row.staked = toMoney(row.staked+t.stake);
   row.returned = toMoney(row.returned+(t.payout||0));
   if (t.status !== 'pending') row.net = toMoney(row.net+(t.payout||0)-t.stake);
  }
  return activity(t,row?.name ?? 'Unknown account');
 }).sort((a,b) => b.placedAt-a.placedAt);
 const leaderboard = [...rows.values()].sort((a,b) => b.balance-a.balance || a.name.localeCompare(b.name))
  .map((row,i) => ({...row,rank:i+1}));
 return {leaderboard,tickets};
}
function readBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',b=>{s+=b;if(s.length>100000){reject(Error('Payload too large'));req.destroy();}});req.on('end',()=>{try{const body=s?JSON.parse(s):{};if(!body||typeof body!=='object'||Array.isArray(body))throw Error();resolve(body);}catch(e){reject(Error('Invalid JSON'));}});req.on('error',reject);});}
function exposureFor(w,m){
 let home=0,away=0;
 for(const t of db.tickets){
  if(t.week!==w.week||t.status!=='pending')continue;
  for(const l of t.legs){
   if(l.matchId===m.id){if(l.playerId===m.home)home+=t.stake;else if(l.playerId===m.away)away+=t.stake;}
  }
 }
 return {home,away};
}
function matchQuote(w,m){
 const exposure=exposureFor(w,m);
 return quote(m.baseHomeOdds,m.baseAwayOdds,w.risk,exposure.home,exposure.away);
}
function publicMatch(w,m,admin) {
 const q = matchQuote(w,m);
 if (admin) return {...m,...q};
 return {
  id:m.id,home:m.home,away:m.away,winner:m.winner,setScore:m.setScore,
  venue:m.venue,featured:m.featured,seasonFixture:m.seasonFixture,
  open:m.open!==false,homeOdds:q.homeOdds,awayOdds:q.awayOdds,
  lineHistory:m.lineHistory.slice(-2).map(({homeOdds,awayOdds}) => ({homeOdds,awayOdds}))
 };
}
function league(admin = false) {
 return {currentWeek:db.currentWeek,revision:db.revision||0,
  weeks:db.weeks.slice().sort((a,b)=>a.week-b.week).map(w => ({week:w.week,open:w.open,
   ...(admin ? {risk:w.risk} : {}),matches:w.matches.map(m => publicMatch(w,m,admin)),updatedAt:w.updatedAt})),
  players,standings:standings(players,db.weeks),futures:futures()};
}
function appendMarketMoves(w,matches,reason){
 for(const m of matches){const q=matchQuote(w,m);const old=m.lineHistory?.at(-1);
  if(!old||old.homeOdds!==q.homeOdds||old.awayOdds!==q.awayOdds){
   m.lineHistory ??=[];m.lineHistory.push({at:Date.now(),homeOdds:q.homeOdds,awayOdds:q.awayOdds,reason});
   if(m.lineHistory.length>32)m.lineHistory=m.lineHistory.slice(-32);
  }
 }
 w.updatedAt=Date.now();
}

function requireUser(req,res){const u=identity(req);if(!u){err(res,401,'Sign in to continue.');return null;}return u;}
function requireAdmin(req,res){const u=requireUser(req,res);if(!u)return null;if(u.role!=='admin'){err(res,403,'Admin access required.');return null;}return u;}
const throttles=new Map();
function authAllowed(req){const ip=req.socket.remoteAddress||'unknown';let entry=throttles.get(ip)||{count:0,until:0};if(Date.now()>entry.until)entry={count:0,until:Date.now()+60_000};entry.count++;throttles.set(ip,entry);return entry.count<=20;}
async function api(req,res,url){
 const method=req.method,route=url.pathname;
 try {
  if(method==='GET'&&route==='/api/league')return send(res,200,league());
  if(method==='GET'&&route==='/api/activity')return send(res,200,bettingData());
  if(method==='GET'&&route==='/api/admin/dashboard'){
   if(!requireAdmin(req,res))return;
   const data=bettingData();
   const pending=data.tickets.filter(t=>t.status==='pending');
   return send(res,200,{...data,league:league(true),exposure:{
    count:pending.length,stake:toMoney(pending.reduce((sum,t)=>sum+t.stake,0)),
    maxReturn:toMoney(pending.reduce((sum,t)=>sum+t.projectedPayout,0))
   }});
  }
  if(method==='GET'&&route==='/api/me'){
   const user=identity(req);
   const tickets=user&&user.role!=='admin'?db.tickets.filter(t=>t.userId===user.id).reverse():[];
   return send(res,200,{user:userPublic(user),tickets});
  }
  if(method==='POST'&&(route==='/api/register'||route==='/api/login')){
   if(!authAllowed(req))return err(res,429,'Too many login attempts. Try again later.');
   const b=await readBody(req);const username=String(b.username||'').trim();const password=String(b.password||'');
   if(route==='/api/login'&&username.toLowerCase()==='admin'){
    if(!ADMIN_PASSWORD)return err(res,503,'Admin login is disabled. Set BTA_ADMIN_PASSWORD on the server.');
    if(password!==ADMIN_PASSWORD)return err(res,401,'Incorrect credentials.');
    createSession(res,'ADMIN',req);return send(res,200,{user:{name:'BTA Commissioner',role:'admin',balance:null}});
   }
   if(route==='/api/register'){
    if(!/^[a-zA-Z0-9_]{3,22}$/.test(username)||username.toLowerCase()==='admin')return err(res,400,'Username must have 3–22 letters, numbers, or underscores.');
    if(password.length<8||password.length>100)return err(res,400,'Password must be 8–100 characters.');
    if(db.users.some(u=>u.name.toLowerCase()===username.toLowerCase()))return err(res,409,'Username already taken.');
    const salt=crypto.randomBytes(16).toString('hex');const u={id:crypto.randomUUID(),name:username,salt,passwordHash:hash(password,salt),balance:1000,joinedAt:Date.now(),role:'user'};db.users.push(u);createSession(res,u.id,req);return send(res,200,{user:userPublic(u)});
   }
   const u=db.users.find(u=>u.name.toLowerCase()===username.toLowerCase());
   if(!u||!password||!crypto.timingSafeEqual(Buffer.from(hash(password,u.salt),'hex'),Buffer.from(u.passwordHash,'hex')))return err(res,401,'Incorrect credentials.');
   createSession(res,u.id,req);return send(res,200,{user:userPublic(u)});
  }
  if(method==='POST'&&route==='/api/logout'){
   const token=cookieValue(req,'bta_session');if(token){const h=crypto.createHash('sha256').update(token).digest('hex');db.sessions=db.sessions.filter(x=>x.tokenHash!==h);save();}
   res.setHeader('Set-Cookie','bta_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return send(res,200,{ok:true});
  }
  if(method==='POST'&&route==='/api/tickets'){
   const b=await readBody(req);
   const u=requireUser(req,res);if(!u)return;if((u.role||'user')!=='user')return err(res,403,'Commissioner accounts cannot place picks.');
   const w=current();
   const stake=Number(b.stake),picks=b.picks;if(!Number.isFinite(stake)||stake<1||stake>500||toMoney(stake)!==stake)return err(res,400,'Stake must be between 1 and 500 credits (up to two decimals).');
   if(!Number.isFinite(u.balance)||stake>u.balance)return err(res,400,'Not enough virtual credits.');
   if(!Array.isArray(picks)||!picks.length||picks.length>5)return err(res,400,'Select between 1 and 5 matchups.');
   const seen=new Set(),legs=[];
   for(const pick of picks){
    if (!pick || typeof pick !== 'object') return err(res,400,'Invalid selection.');
    if (pick.matchId === futuresMarketId) {
     const market = futures();
     const line = market.lines.find(l => l.playerId === pick.playerId);
     if (!market.open || !line?.odds || picks.length !== 1) return err(res,400,'Futures require an available straight selection.');
     if (pick.expectedOdds !== line.odds) return err(res,409,'Line moved. Review the updated futures price.');
     legs.push({matchId:pick.matchId,playerId:line.playerId,odds:line.odds,decimal:line.decimal});
     continue;
    }
    if (!w?.open || (b.week !== undefined && b.week !== w.week)) return err(res,400,'Markets are currently closed.');
    const m=w.matches.find(m=>m.id===pick.matchId);
    if(!m||m.open===false||m.winner!==null||seen.has(m.id))return err(res,400,'Invalid, duplicated, or already settled matchup.');
    const p=pick.playerId;if(p!==m.home&&p!==m.away)return err(res,400,'Pick does not match a participant.');
    seen.add(m.id);
    const latest=matchQuote(w,m);
    const currentOdds=p===m.home?latest.homeOdds:latest.awayOdds;
    if(!isOdds(Number(pick.expectedOdds))||Number(pick.expectedOdds)!==currentOdds){
     return err(res,409,'Line moved. We refreshed your slip: review the new odds before placing your pick.');
    }
    legs.push({matchId:m.id,playerId:p,odds:currentOdds,decimal:oddsToDecimal(currentOdds)});
   }
   const decimal=legs.reduce((a,l)=>a*l.decimal,1);
   const ticket={id:crypto.randomUUID(),userId:u.id,week:w.week,stake,legs,decimal,projectedPayout:toMoney(stake*decimal),payout:0,status:'pending',placedAt:Date.now(),settledAt:null};
   u.balance=toMoney(u.balance-stake);db.tickets.push(ticket);if(seen.size)appendMarketMoves(w,w.matches.filter(m=>seen.has(m.id)),'virtual-pick-volume');save();return send(res,201,{ticket,balance:u.balance,league:league()});
  }
  if(method==='POST'&&route==='/api/admin/week'){
   const b=await readBody(req);
   if(!requireAdmin(req,res))return;
   const w=db.weeks.find(w=>w.week===(b.week??db.currentWeek));if(!w)return err(res,404,'Current week missing.');
   if(!Array.isArray(b.matches)||b.matches.length<1||b.matches.length>18)return err(res,400,'Create 1–18 matchups.');
   const risk=riskSettings(b.risk??w.risk);
   if(!validRisk(risk))return err(res,400,'Vig must be 4–30%, movement per 100 credits 0–4 points, maximum move 0–12 points.');
   const existingById=new Map(w.matches.map(m=>[m.id,m]));const ids=new Set();const matches=[];
   for(const m of b.matches){
    if (!m || typeof m !== 'object') return err(res,400,'Invalid matchup.');
    const home=String(m.home||''),away=String(m.away||'');const ho=Number(m.baseHomeOdds??m.homeOdds),ao=Number(m.baseAwayOdds??m.awayOdds),id=String(m.id||'').slice(0,64)||crypto.randomUUID();
    if(id===futuresMarketId||ids.has(id)||home===away||!players.some(p=>p.id===home)||!players.some(p=>p.id===away)||!isOdds(ho)||!isOdds(ao))return err(res,400,'Check player selection and moneyline odds (+100 or higher / -100 or lower).');
    const old=existingById.get(id);if(old&&(old.home!==home||old.away!==away)&&db.tickets.some(t=>t.week===w.week&&t.legs.some(l=>l.matchId===id)))return err(res,400,'Cannot change the players in a matchup that has accepted tickets.');
    if (old?.seasonFixture && (old.home!==home||old.away!==away)) return err(res,400,'Scheduled players cannot be changed.');
    if(old?.winner!==null&&old?.winner!==undefined&&old.winner!==''){
      if(old.home!==home||old.away!==away||old.baseHomeOdds!==ho||old.baseAwayOdds!==ao)return err(res,400,'Settled matchups cannot be edited.');
    }
    ids.add(id);matches.push({...old,id,home,away,open:m.open!==false,baseHomeOdds:ho,baseAwayOdds:ao,homeOdds:ho,awayOdds:ao,lineHistory:old?.lineHistory||[],venue:String(m.venue||'TBD').slice(0,120),featured:!!m.featured,winner:old?.winner??null});
   }
   for(const old of w.matches){if(!ids.has(old.id)&&(old.seasonFixture||old.winner!==null||db.tickets.some(t=>t.legs.some(l=>l.matchId===old.id))))return err(res,400,'Cannot remove a matchup with active picks or a recorded result.');}
   w.matches=matches;w.risk=risk;w.open=!!b.open;appendMarketMoves(w,w.matches,'commissioner-published');save();return send(res,200,league(true));
  }
  if(method==='POST'&&route==='/api/admin/result'){
   const b=await readBody(req);
   if(!requireAdmin(req,res))return;
   const w=db.weeks.find(w=>w.week===Number(b.week));
   const m=w?.matches.find(m=>m.id===b.matchId);
   if(!m)return err(res,404,'Matchup not found.');
   if(![m.home,m.away,'void'].includes(b.winner))return err(res,400,'Select one player or void.');
   if(m.winner && m.winner!==b.winner)return err(res,409,'This outcome is already finalized.');
   if(m.winner && !m.historicalReview && (m.setScore || m.winner==='void')){
    if(b.setScore && JSON.stringify(b.setScore)!==JSON.stringify(m.setScore))return err(res,409,'Recorded set score differs.');
    return send(res,200,{league:league(true),settled:true});
   }
   if(b.winner!=='void'){
    const score=b.setScore;
    const winnerIndex=b.winner===m.home?0:1;
    if(!Array.isArray(score)||score.length!==2||score[winnerIndex]!==2||![0,1].includes(score[1-winnerIndex])){
     return err(res,400,'Enter a best-of-three set score consistent with the winner.');
    }
    if(m.setScore && score.some((value,i)=>value!==m.setScore[i]))return err(res,409,'Recorded set score differs.');
    m.setScore=score;
   }
   m.winner=b.winner;
   m.historicalReview=false;
   futuresCache=undefined;
   settleTickets();
   appendMarketMoves(w,w.matches,'result-finalized');
   save();
   return send(res,200,{league:league(true),settled:true});
  }
  if(method==='POST'&&route==='/api/admin/next-week'){
   if(!requireAdmin(req,res))return;
   const w=current(),week=db.weeks.find(candidate=>candidate.week===w.week+1);
   if(!week)return err(res,409,'No following week is scheduled.');
   w.open=false;
   db.currentWeek=week.week;
   week.open=false;
   save();
   return send(res,200,league(true));
  }
  if(method==='POST'&&route==='/api/admin/futures'){
   const b=await readBody(req);
   if(!requireAdmin(req,res))return;
   if(typeof b.open!=='boolean')return err(res,400,'Specify whether the futures market is open.');
   db.futures={...db.futures,open:b.open};
   save();
   return send(res,200,league(true));
  }
  return err(res,404,'Unknown endpoint.');
 }catch(e){if(e?.message==='Invalid JSON'||e?.message==='Payload too large')return err(res,400,e.message);console.error(e);return err(res,500,'Internal server error.');}
}
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.json':'application/json'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(req.method!=='GET'&&req.method!=='HEAD'){
  // Browser requests must originate from this site; no cross-origin authenticated state changes.
  if(req.headers.origin){try{const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host)return err(res,403,'Cross-origin requests not accepted.');}catch{return err(res,403,'Invalid origin.');}}
 }
 res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
 if(u.pathname.startsWith('/api/'))return api(req,res,u);
 if(req.method!=='GET'&&req.method!=='HEAD')return err(res,405,'Method not allowed.');
 if(u.pathname==='/health')return send(res,200,{ok:true});
 let rel;
 try { rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/, ''); }
 catch { return err(res,400,'Invalid path.'); }
 const f=path.resolve(PUBLIC,rel);if(!f.startsWith(PUBLIC+path.sep)&&f!==PUBLIC)return err(res,403,'Access denied.');
 fs.stat(f,(error,stat)=>{
  if(error||!stat.isFile()){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found');}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':rel.startsWith('assets/')?'public, max-age=86400':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'"});
  fs.createReadStream(f).pipe(res);
 });
});
server.listen(PORT,()=>console.log(`BTA Tennis free-to-play sportsbook running at http://localhost:${PORT}\nAdmin login: username admin; set BTA_ADMIN_PASSWORD to enable.`));
