// BTA Tennis League — free-to-play, virtual-credit prediction game.
// No real-money deposits, cash-out, payment processing, or wagering is supported.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const {DEFAULT_RISK, validMoneyline, riskSettings, validRisk, quote} = require('./odds-engine');
const ROOT=__dirname, PUBLIC=path.join(ROOT,'public'), DBPATH=process.env.BTA_DATA_FILE?path.resolve(process.env.BTA_DATA_FILE):path.join(ROOT,'data','db.json');
const PORT=Number(process.env.PORT||3000);
const ADMIN_PASSWORD=process.env.BTA_ADMIN_PASSWORD||'';
const players=[
{id:'jack',name:'Jack',image:'/assets/jack.webp',tagline:'The wildcard'},
{id:'jacob',name:'Jacob Ebani',image:'/assets/jacob.webp',tagline:'The newcomer'},
{id:'joe-d',name:'Joe D',image:'/assets/joe-d.webp',tagline:'The underdog'},
{id:'joey',name:'Joey',image:'/assets/joey.webp',tagline:'The power server'},
{id:'fish',name:'Fish',image:'/assets/fish.webp',tagline:'The comeback king'},
{id:'vic',name:'Vic',image:'/assets/vic.webp',tagline:'The contender'},
{id:'ryan',name:'Ryan',image:'/assets/ryan.webp',tagline:'The dark horse'},
{id:'soly',name:'Soly',image:'/assets/soly.webp',tagline:'The challenger'},
{id:'morris',name:'Morris',image:'/assets/morris.webp',tagline:'The tactician'},
{id:'eric',name:'Eric',image:'/assets/eric.webp',tagline:'The strategist'}
];
const starterMatches=[
{ id:'w2m1', home:'jack',away:'jacob', homeOdds:-350,awayOdds:280,winner:null,venue:'TBD'},
{ id:'w2m2', home:'joe-d',away:'joey', homeOdds:300,awayOdds:-375,winner:null,venue:'TBD'},
{ id:'w2m3', home:'fish',away:'vic', homeOdds:-155,awayOdds:130,winner:null,venue:'TBD',featured:true},
{ id:'w2m4', home:'ryan',away:'soly', homeOdds:180,awayOdds:-215,winner:null,venue:'TBD'},
{ id:'w2m5', home:'morris',away:'eric', homeOdds:155,awayOdds:-180,winner:null,venue:'TBD'}
];
function newDB(){return {schema:1, currentWeek:2, weeks:[{week:2,open:true,risk:{...DEFAULT_RISK},matches:starterMatches.map(m=>({...m,baseHomeOdds:m.homeOdds,baseAwayOdds:m.awayOdds,lineHistory:[]})),updatedAt:Date.now()}], users:[], sessions:[], tickets:[]};}
fs.mkdirSync(path.dirname(DBPATH),{recursive:true});
if (!fs.existsSync(DBPATH)) fs.writeFileSync(DBPATH,JSON.stringify(newDB(),null,2));
let db=JSON.parse(fs.readFileSync(DBPATH,'utf8'));
// Non-destructive migration of earlier league files. All existing odds become
// reference prices used to infer a fair starting line; new quotes include vig.
for(const w of db.weeks){
 w.risk=riskSettings(w.risk);
 for(const m of w.matches){
  m.baseHomeOdds ??= m.homeOdds;
  m.baseAwayOdds ??= m.awayOdds;
  m.lineHistory ??= [];
 }
}

function save(){ db.revision=(db.revision||0)+1;const t=DBPATH+'.tmp';fs.writeFileSync(t,JSON.stringify(db,null,2),{mode:0o600});fs.renameSync(t,DBPATH);}
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
function fmtOdds(n){return n>0?'+'+n:String(n);}
function isOdds(n){return validMoneyline(n);}
function settleTickets(){
 for(const ticket of db.tickets){
  if(ticket.status!=='pending')continue;
  const w=db.weeks.find(w=>w.week===ticket.week);if(!w)continue;
  const results=ticket.legs.map(l=>w.matches.find(m=>m.id===l.matchId)?.winner||null);
  if(results.some((r,i)=>r&&r!=='void'&&r!==ticket.legs[i].playerId)){ticket.status='lost';ticket.settledAt=Date.now();continue;}
  if(results.every(r=>r!==null)){
   const dec=ticket.legs.reduce((p,l,i)=>p*(results[i]==='void'?1:l.decimal),1);
   ticket.status='won';ticket.payout=toMoney(ticket.stake*dec);ticket.settledAt=Date.now();
   let user=db.users.find(u=>u.id===ticket.userId);if(user)user.balance=toMoney(user.balance+ticket.payout);
  }
 }
 save();
}
function readBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',b=>{s+=b;if(s.length>100000){reject(Error('Payload too large'));req.destroy();}});req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch(e){reject(Error('Invalid JSON'));}});req.on('error',reject);});}
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
function publicMatch(w,m){return {...m,...matchQuote(w,m),lineHistory:(m.lineHistory||[]).slice(-8)};}
function league(){return {currentWeek:db.currentWeek,revision:db.revision||0,weeks:db.weeks.map(w=>({week:w.week,open:w.open,risk:w.risk,matches:w.matches.map(m=>publicMatch(w,m)),updatedAt:w.updatedAt})),players};}
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
  if(method==='GET'&&route==='/api/me')return send(res,200,{user:userPublic(identity(req)),tickets:(identity(req)?.role==='user'?db.tickets.filter(t=>t.userId===identity(req).id).slice().reverse():[])});
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
   const u=requireUser(req,res);if(!u)return;if(u.role!=='user')return err(res,403,'Commissioner accounts cannot place picks.');
   const b=await readBody(req);const w=current();if(!w?.open)return err(res,400,'Markets are currently closed.');
   const stake=Number(b.stake),picks=b.picks;if(!Number.isFinite(stake)||stake<1||stake>500||toMoney(stake)!==stake)return err(res,400,'Stake must be between 1 and 500 credits (up to two decimals).');
   if(stake>u.balance)return err(res,400,'Not enough virtual credits.');
   if(!Array.isArray(picks)||!picks.length||picks.length>w.matches.length)return err(res,400,'Select between 1 and '+w.matches.length+' matchups.');
   const seen=new Set(),legs=[];
   for(const pick of picks){
    const m=w.matches.find(m=>m.id===pick.matchId);
    if(!m||m.winner!==null||seen.has(m.id))return err(res,400,'Invalid, duplicated, or already settled matchup.');
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
   u.balance=toMoney(u.balance-stake);db.tickets.push(ticket);appendMarketMoves(w,w.matches.filter(m=>seen.has(m.id)),'virtual-pick-volume');save();return send(res,201,{ticket,balance:u.balance,league:league()});
  }
  if(method==='POST'&&route==='/api/admin/week'){
   if(!requireAdmin(req,res))return;
   const b=await readBody(req);const w=current();if(!w)return err(res,404,'Current week missing.');
   if(!Array.isArray(b.matches)||b.matches.length<1||b.matches.length>18)return err(res,400,'Create 1–18 matchups.');
   const risk=riskSettings(b.risk);
   if(!validRisk(risk))return err(res,400,'Vig must be 4–30%, movement per 100 credits 0–4 points, maximum move 0–12 points.');
   const existingById=new Map(w.matches.map(m=>[m.id,m]));const ids=new Set();const matches=[];
   for(const m of b.matches){
    const home=String(m.home||''),away=String(m.away||'');const ho=Number(m.baseHomeOdds??m.homeOdds),ao=Number(m.baseAwayOdds??m.awayOdds),id=String(m.id||'').slice(0,64)||crypto.randomUUID();
    if(ids.has(id)||home===away||!players.some(p=>p.id===home)||!players.some(p=>p.id===away)||!isOdds(ho)||!isOdds(ao))return err(res,400,'Check player selection and moneyline odds (+100 or higher / -100 or lower).');
    const old=existingById.get(id);if(old&&(old.home!==home||old.away!==away)&&db.tickets.some(t=>t.week===w.week&&t.legs.some(l=>l.matchId===id)))return err(res,400,'Cannot change the players in a matchup that has accepted tickets.');
    if(old?.winner!==null&&old?.winner!==undefined&&old.winner!==''){
      if(old.home!==home||old.away!==away||old.baseHomeOdds!==ho||old.baseAwayOdds!==ao)return err(res,400,'Settled matchups cannot be edited.');
    }
    ids.add(id);matches.push({id,home,away,baseHomeOdds:ho,baseAwayOdds:ao,homeOdds:ho,awayOdds:ao,lineHistory:old?.lineHistory||[],venue:String(m.venue||'TBD').slice(0,120),featured:!!m.featured,winner:old?.winner??null});
   }
   for(const old of w.matches){if(!ids.has(old.id)&&(old.winner!==null||db.tickets.some(t=>t.legs.some(l=>l.matchId===old.id))))return err(res,400,'Cannot remove a matchup with active picks or a recorded result.');}
   w.matches=matches;w.risk=risk;w.open=!!b.open;appendMarketMoves(w,w.matches,'commissioner-published');save();return send(res,200,league());
  }
  if(method==='POST'&&route==='/api/admin/result'){
   if(!requireAdmin(req,res))return;
   const b=await readBody(req),w=db.weeks.find(w=>w.week===Number(b.week));if(!w)return err(res,404,'Week not found.');
   const m=w.matches.find(m=>m.id===b.matchId);if(!m)return err(res,404,'Matchup not found.');
   if(m.winner!==null)return err(res,400,'This outcome is already finalized. Results cannot be changed.');
   if(![m.home,m.away,'void'].includes(b.winner))return err(res,400,'Select one player or void.');
   m.winner=b.winner;appendMarketMoves(w,[m],'result-finalized');settleTickets();return send(res,200,{league:league(),settled:true});
  }
  if(method==='POST'&&route==='/api/admin/next-week'){
   if(!requireAdmin(req,res))return;
   const w=current(),week=db.currentWeek+1;
   const matches=w.matches.map((m,i)=>({...m,id:`w${week}m${i+1}`,winner:null,featured:false,lineHistory:[]}));
   db.weeks.push({week,open:false,risk:{...w.risk},matches,updatedAt:Date.now()});db.currentWeek=week;save();return send(res,200,league());
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
 const rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/, '');
 const f=path.resolve(PUBLIC,rel);if(!f.startsWith(PUBLIC+path.sep)&&f!==PUBLIC)return err(res,403,'Access denied.');
 fs.stat(f,(error,stat)=>{
  if(error||!stat.isFile()){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found');}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'"});
  fs.createReadStream(f).pipe(res);
 });
});
let seededLines=false;for(const w of db.weeks){const missing=w.matches.filter(m=>!m.lineHistory.length);if(missing.length){appendMarketMoves(w,missing,'opening-line');seededLines=true;}}
if(seededLines)save();
server.listen(PORT,()=>console.log(`BTA Tennis free-to-play sportsbook running at http://localhost:${PORT}\nAdmin login: username admin; set BTA_ADMIN_PASSWORD to enable.`));
