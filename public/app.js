/* BTA Tennis virtual-credit market website. Original UI; sportsbook-inspired, not affiliated with FanDuel. */
const app={league:null,me:null,tab:'markets',week:null,picks:new Map(),slipMode:'parlay',singlePick:null,stake:'25',showAuth:false,authMode:'register',slipOpen:false,adminDraft:null,loading:false,autoRefresh:null,activity:null,filterStatus:'',filterPlayer:'',activitySort:'new',futurePick:null};
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function player(id){return app.league?.players.find(p=>p.id===id)||{id,name:'Unknown',image:'/assets/bta-logo.webp',tagline:''};}
function curWeek(){return app.league?.weeks.find(w=>w.week===app.week)||actualWeek();}
function actualWeek(){return app.league?.weeks.find(w=>w.week===app.league.currentWeek);}
function odds(n){return (n>0?'+':'')+n;}
function dec(n){return n>0?1+n/100:1+100/Math.abs(n);}
function amer(d){if(!Number.isFinite(d)||d<=1)return '—';return d>=2?`+${Math.round((d-1)*100)}`:`-${Math.round(100/(d-1))}`;}
function credits(n){return Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function shortDate(n){if(!Number.isFinite(n))return 'Date unavailable';return new Date(n).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function id(w,m){return `${w}:${m}`;}
function movement(m){
 const h=m.lineHistory||[];if(h.length<2)return '';
 const last=h.at(-1),previous=h.at(-2);
 if(last.homeOdds===previous.homeOdds && last.awayOdds===previous.awayOdds)return '';
 return '<span class="move-indicator">↗ LINE MOVED · LIVE</span>';
}

function selectedLegs(){const w=curWeek();if(!w)return [];
 if(app.futurePick){
  const market=app.league.futures, line=market.lines.find(x=>x.playerId===app.futurePick);
  return market.open&&line?.odds?[{...line,matchId:'championship'}]:[];
 }
 return w.matches.flatMap(m=>{const p=app.picks.get(id(w.week,m.id));if(!p||m.open===false||m.winner!==null||!w.open||w.week!==app.league.currentWeek)return [];const price=p===m.home?m.homeOdds:m.awayOdds;return [{matchId:m.id,playerId:p,odds:price,decimal:dec(price),match:m}];});}
function slipLegs(){const legs=selectedLegs();if(app.slipMode==='single'&&legs.length>1)return [legs.find(x=>x.matchId===app.singlePick)||legs[0]];return legs;}
function toast(message,type='success'){const t=document.createElement('div');t.className='toast '+type;t.textContent=message;$('#toastContainer').appendChild(t);setTimeout(()=>t.remove(),3800);}
async function api(url,method='GET',body){const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body!==undefined?JSON.stringify(body):undefined});let j;try{j=await r.json()}catch{throw Error('Could not read server response.')}if(!r.ok)throw Error(j.error||'Request failed.');return j;}
async function refresh(){const [league,me]=await Promise.all([api('/api/league'),api('/api/me')]);app.league=league;app.me=me.user;if(['activity','credits','admin'].includes(app.tab))await loadBoard();app.tickets=me.tickets||[];if(app.week===null)app.week=league.currentWeek;if(!league.weeks.some(w=>w.week===app.week))app.week=league.currentWeek;draw();}
async function loadBoard(){
 if(app.tab==='admin'&&app.me?.role!=='admin')return;
 const tab=app.tab;
 const data=await api(tab==='admin'?'/api/admin/dashboard':'/api/activity');
 if(app.tab!==tab)return;
 app.activity=data;
 if(tab==='admin'){
  app.league=data.league;
  app.adminDraft=structuredClone(actualWeek());
 }
}
async function navigate(tab){
 app.tab=tab;
 app.slipOpen=false;
 app.activity=null;
 app.filterStatus='';
 app.filterPlayer='';
 app.activitySort='new';
 draw();
 window.scrollTo({top:0,behavior:'smooth'});
 if(!['admin','credits','activity'].includes(tab))return;
 try{await loadBoard();draw();}catch(e){toast(e.message,'error');}
}
function selectPick(matchId,pId){const w=curWeek();const m=w?.matches.find(m=>m.id===matchId);if(!w||!m||m.open===false||m.winner!==null||!w.open||w.week!==app.league.currentWeek){toast('These markets are closed.','error');return;}app.futurePick=null;const key=id(w.week,matchId);if(app.picks.get(key)===pId)app.picks.delete(key);else app.picks.set(key,pId);draw();}
function topNav(){document.querySelectorAll('[data-route]').forEach(n=>n.classList.toggle('active',n.dataset.route===app.tab));$('#accountButton').innerHTML=app.me?`${esc(app.me.name)} <span>⌄</span>`:'Sign in <span>↗</span>';$('#balanceLabel').textContent=app.me?.role==='user'?Number(app.me.balance).toLocaleString():'—';$('#leftMatchCount').textContent=actualWeek()?.matches.length||0;}
function draw(){if(!app.league)return;topNav();const main=$('#mainContent');if(app.tab==='markets')main.innerHTML=marketsHTML();else if(app.tab==='bets')main.innerHTML=betsHTML();else if(app.tab==='standings')main.innerHTML=standingsHTML();else if(app.tab==='admin')main.innerHTML=adminHTML();else if(app.tab==='credits')main.innerHTML=creditsHTML();else if(app.tab==='activity')main.innerHTML=activityHTML();else if(app.tab==='futures')main.innerHTML=futuresHTML();drawSlip();}
function marketsHTML(){const w=curWeek();const matchCount=w.matches.length;return `
<div class="breadcrumb">HOME &nbsp; › &nbsp; <strong>TENNIS</strong> &nbsp; › &nbsp; BTA LEAGUE</div>
<section class="hero"><div class="hero-tennis">◉</div><div class="hero-text-shade"></div><div class="hero-inner"><div class="eyebrow"><span class="live-dot"></span> THE 2026 BTA SEASON</div><h1>BIG MATCHUPS.<br><span>BIG BRAGGING RIGHTS.</span></h1><p>Your league. Your picks. Build parlays and compete with virtual credits.</p><div class="hero-chips"><span class="hero-chip">🎾 WEEK ${esc(app.league.currentWeek)}</span><span class="hero-chip">${actualWeek()?.matches.length||0} MATCHUPS</span></div></div><img class="hero-face one" src="/assets/fish.webp" alt="Fish portrait"/><img class="hero-face two" src="/assets/vic.webp" alt="Vic portrait"/></section>
<div class="section-head"><div><h2>🎾 Week ${w.week} Matchups</h2><span class="section-sub">${matchCount} games on the board · Pick winners to build your slip</span></div><div class="week-switcher">WEEK <select id="weekSelect">${app.league.weeks.slice().reverse().map(x=>`<option value="${x.week}" ${x.week===w.week?'selected':''}>${x.week}</option>`).join('')}</select></div></div>
<p class="section-sub">All wagers use virtual, non-redeemable BTA credits.</p>
<section><h3>Upcoming &amp; Active Matches</h3><div class="match-list">${w.matches.filter(m=>!m.winner).map(m=>matchHTML(m,w,w.matches.indexOf(m))).join('')||'<p class="section-sub">No upcoming matches this week.</p>'}</div></section>
<section><h3>Past Matches</h3><div class="match-list">${w.matches.filter(m=>m.winner).map(m=>matchHTML(m,w,w.matches.indexOf(m))).join('')||'<p class="section-sub">No completed matches this week.</p>'}</div></section>`;}
function matchHTML(m,w,i){const a=player(m.home),b=player(m.away),selectedA=app.picks.get(id(w.week,m.id))===m.home,selectedB=app.picks.get(id(w.week,m.id))===m.away;const can=m.open!==false&&w.open&&w.week===app.league.currentWeek&&m.winner===null;const status=m.winner===null?(can?'MARKET OPEN':'MARKET CLOSED'):(m.winner==='void'?'VOID / NO CONTEST':`${player(m.winner).name.toUpperCase()} WON`);return `
<article class="match-card"><div class="match-top"><span><span class="match-dot" style="background:${can?'#03cbb8':'#adb9c5'}"></span> BTA TENNIS · MATCH ${i+1} ${m.featured?'<span class="featured-badge">★ MATCH OF THE WEEK</span>':''} ${movement(m)}</span><span class="${can?'':'closed-badge'}">${esc(status)}</span></div>
<div class="match-body"><div class="contestant"><img class="player-portrait" src="${a.image}" alt="${esc(a.name)}"/><div class="player-info"><strong>${esc(a.name)}</strong><span>${esc(a.tagline)}</span><button class="pick-button ${selectedA?'selected':''}" data-pick="${esc(m.id)}" data-player="${a.id}" ${can?'':'disabled'}>${m.winner?'—':odds(m.homeOdds)} ${selectedA?'✓':''}</button></div></div>
<div class="versus">VS</div>
<div class="contestant right"><img class="player-portrait" src="${b.image}" alt="${esc(b.name)}"/><div class="player-info"><strong>${esc(b.name)}</strong><span>${esc(b.tagline)}</span><button class="pick-button ${selectedB?'selected':''}" data-pick="${esc(m.id)}" data-player="${b.id}" ${can?'':'disabled'}>${m.winner?'—':odds(m.awayOdds)} ${selectedB?'✓':''}</button></div></div></div><div class="match-footer">📍 <strong>${esc(m.venue||'TBD')}</strong> ${m.setScore?` · Sets ${m.setScore.join('–')}`:m.winner?'':' · Match winner'}</div></article>`;}
function drawSlip(){const legs=slipLegs(),selected=selectedLegs(),factor=legs.reduce((a,p)=>a*p.decimal,1),stake=Math.max(0,Number(app.stake)||0),payout=factor*stake;const isSingle=legs.length===1;$('#slipContent').innerHTML=`
<div class="slip-box"><div class="slip-heading"><div><strong>◎ &nbsp;Bet Slip</strong><small>BUILD YOUR BTA PICK</small></div><div style="display:flex;gap:9px;align-items:center"><span class="slip-count">${selected.length}</span><button class="mobile-close" id="closeSlip" style="background:transparent;color:white;border:0;font-size:22px">×</button></div></div>
<div class="slip-tabs"><button class="slip-tab ${app.slipMode==='parlay'?'active':''}" data-slipmode="parlay">Parlay ${selected.length>1?`(${selected.length})`:''}</button><button class="slip-tab ${app.slipMode==='single'?'active':''}" data-slipmode="single">Straight</button></div>
${selected.length===0?`<div class="slip-empty"><div class="slip-empty-icon">🎾</div><strong>Your slip is empty</strong><p>Tap the odds next to a player to start your winning picks.</p></div>`:
`${app.slipMode==='single'&&selected.length>1?`<div style="padding:11px 16px 0"><label class="form-label">STRAIGHT PICK</label><select class="form-control" id="singleSelect">${selected.map(l=>`<option value="${esc(l.matchId)}" ${legs[0]?.matchId===l.matchId?'selected':''}>${esc(player(l.playerId).name)} (${odds(l.odds)})</option>`).join('')}</select></div>`:''}
${legs.map(l=>`<div class="leg"><img src="${player(l.playerId).image}" alt=""/><div class="leg-content"><div class="leg-title">${esc(player(l.playerId).name)} ML</div><div class="leg-opp">${l.match?'vs '+esc(player(l.playerId===l.match.home?l.match.away:l.match.home).name):'Championship winner'}</div></div><span class="leg-odds">${odds(l.odds)}</span><button title="Remove pick" aria-label="Remove pick" class="leg-remove" data-remove="${esc(l.matchId)}">×</button></div>`).join('')}
<div class="stake-panel"><div class="bet-live-note">↗ Live market prices · ticket locks odds at acceptance</div><div class="stake-title">Virtual Stake <span>Credits (CR)</span></div><div class="stake-input-wrap"><span>◎</span><input id="stakeInput" type="number" min="1" max="500" step="0.01" value="${esc(app.stake)}" aria-label="Virtual stake in credits"/></div><div class="quick-stakes"><button data-stake="10">10 CR</button><button data-stake="25">25 CR</button><button data-stake="50">50 CR</button><button data-stake="100">100 CR</button></div><div class="totals"><div><span>Bet type</span><strong>${isSingle?'Straight':`${legs.length}-Leg Parlay`}</strong></div><div><span>Combined odds</span><strong>${amer(factor)}</strong></div><div><span>Potential profit</span><strong>${credits(Math.max(0,payout-stake))} CR</strong></div><div class="payout"><span>Potential return</span><strong id="payoutValue">${credits(payout)}</strong></div></div><button id="placeBet" class="place-btn" ${app.loading?'disabled':''}>${app.loading?'Submitting...':app.me?.role==='admin'?'Admin cannot pick':app.me?'PLACE VIRTUAL BET':'SIGN IN TO PLACE PICK'} ↗</button><button id="clearSlip" class="clear-slip">Clear all selections</button></div>`}
<div class="slip-safety"><span>♧</span> Free-to-play. No real money or prizes. All users see the same lines.</div></div>`;
$('#mobileSlipCount').textContent=selected.length;$('#mobileSlipOdds').textContent=legs.length?amer(factor)+' ↗':'Add picks ↗';$('#slipSidebar').classList.toggle('open',app.slipOpen);
}
function betsHTML(){return `<div class="breadcrumb">BTA LEAGUE &nbsp; › &nbsp; <strong>MY BETS</strong></div><div class="section-head"><div><h2>My Virtual Bets</h2><span class="section-sub">Track your predictions and settle outcomes with the league.</span></div></div>${!app.me?`<div class="panel"><div class="empty-panel"><div class="bigicon">◎</div><strong>Sign in to see your bets</strong><p>Create a free account to save picks and track your virtual-credit balance.</p><button class="primary-button" id="betsSignIn">Create an account</button></div></div>`:app.me.role==='admin'?`<div class="panel"><div class="empty-panel"><strong>Commissioner account</strong><p>Switch to an ordinary player account to place demo bets.</p><button class="primary-button" data-route="admin">Admin dashboard</button></div></div>`:app.tickets.length===0?`<div class="panel"><div class="empty-panel"><div class="bigicon">🎟️</div><strong>No bets placed yet</strong><p>Choose one or more players from the markets to build your first slip.</p><button class="primary-button" data-route="markets">Browse markets</button></div></div>`:`<div class="ticket-list">${app.tickets.map(ticketHTML).join('')}</div>`}`;}
function ticketHTML(t){const w=app.league.weeks.find(x=>x.week===t.week);return `<div class="ticket"><div class="ticket-row"><div class="ticket-id">🎟️ ${t.legs[0]?.matchId==='championship'?'CHAMPIONSHIP':`WEEK ${t.week}`} · ${t.legs.length===1?'STRAIGHT':`${t.legs.length}-LEG PARLAY`}<br><span style="font-weight:500;font-size:10px;color:#91a2b4">Placed ${shortDate(t.placedAt)}</span></div><span class="ticket-status ${t.status}">${t.status.toUpperCase()}</span></div><div class="ticket-legs">${t.legs.map(l=>{const m=w?.matches.find(x=>x.id===l.matchId);const r=l.matchId==='championship'?app.league.futures.winner:m?.winner;return `<div><strong>${esc(player(l.playerId).name)} ML <span style="font-weight:400">${r==='void'?'(void)':r!==null&&r!==undefined?(r===l.playerId?'✓':'✕'):''}</span></strong><span>${odds(l.odds)}</span></div>`}).join('')}</div><div class="ticket-summary"><div><span>Stake</span><strong>${credits(t.stake)}</strong></div><div><span>Odds</span><strong>${amer(t.decimal)}</strong></div><div><span>${t.status==='won'||t.status==='void'?'Paid out':'Potential return'}</span><strong style="color:${t.status==='won'?'#07856f':'inherit'}">${credits(t.status==='won'||t.status==='void'?t.payout:t.projectedPayout)}</strong></div></div></div>`;}
function standingsHTML(){
 return `<div class="section-head"><h2>League Standings</h2></div>
 <div class="panel standings-mobile-wrap"><table class="standing-table"><thead><tr>
 <th>Rank</th><th>Player</th><th>Wins</th><th>Losses</th><th>Sets won</th><th>Sets lost</th>
 </tr></thead><tbody>${app.league.standings.map((p,i)=>`<tr><td class="rank">${i+1}</td>
 <td><div class="standing-player"><img src="${p.image}" alt=""/>${esc(p.name)}${p.alias?' · '+esc(p.alias):''}</div></td>
 <td>${p.wins}</td><td>${p.losses}</td><td>${p.setsWon}</td><td>${p.setsLost}</td></tr>`).join('')}
 </tbody></table></div><p class="section-sub">Ranked by wins, then set differential, then alphabetical name.</p>`;
}
function creditsHTML(){
 const rows=app.activity?.leaderboard;
 return `<div class="section-head"><h2>Credit Leaderboard</h2></div>
 <div class="panel standings-mobile-wrap"><table class="standing-table">
 <thead><tr><th>Rank</th><th>Player</th><th>Balance</th><th>Bets</th><th>Won</th><th>Lost</th><th>Win %</th><th>Net</th>${app.tab==='admin'?'<th>Staked</th><th>Returned</th>':''}</tr></thead>
 <tbody>${rows?.map(p=>`<tr><td class="rank">${p.rank}</td><td>${esc(p.name)}</td><td>${credits(p.balance)}</td><td>${p.total}</td>
 <td>${p.won}</td><td>${p.lost}</td><td>${p.won+p.lost?Math.round(100*p.won/(p.won+p.lost))+'%':'—'}</td><td>${credits(p.net)}</td>
 ${app.tab==='admin'?`<td>${credits(p.staked)}</td><td>${credits(p.returned)}</td>`:''}</tr>`).join('')??''}</tbody></table></div>
 <p class="section-sub">${rows?.length===0?'No accounts yet.':'Net credits reflect settled tickets.'}</p>`;
}
function activityHTML(){
 const data=app.activity;
 if(!data)return '<p class="section-sub">Loading betting activity…</p>';
 const tickets=data.tickets.filter(t=>(!app.filterStatus||t.status===app.filterStatus)&&(!app.filterPlayer||t.name===app.filterPlayer));
 tickets.sort((a,b)=>app.activitySort==='stake'?b.stake-a.stake:app.activitySort==='old'?a.placedAt-b.placedAt:b.placedAt-a.placedAt);
 const option=(v,label,current)=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(label)}</option>`;
 return `<div class="section-head"><h2>BTA Betting Activity</h2></div>
 <div class="filter-row">
 <label>Player <select id="filterPlayer">${option('','All players',app.filterPlayer)}${data.leaderboard.map(p=>option(p.name,p.name,app.filterPlayer)).join('')}</select></label>
 <label>Status <select id="filterStatus">${option('','All statuses',app.filterStatus)}${['pending','won','lost','void'].map(x=>option(x,x,app.filterStatus)).join('')}</select></label>
 <label>Sort <select id="activitySort">${option('new','Newest',app.activitySort)}${option('old','Oldest',app.activitySort)}${option('stake','Highest stake',app.activitySort)}</select></label>
 </div>
 <div class="ticket-list">${tickets.map(t=>`<article class="ticket">
 <div class="ticket-row"><strong>${esc(t.name)}</strong><time datetime="${Number.isFinite(t.placedAt)?new Date(t.placedAt).toISOString():''}">${shortDate(t.placedAt)}</time><span class="ticket-status ${esc(t.status)}">${esc(t.status)}</span></div>
 <div class="ticket-legs">${t.legs.map(l=>`<div><strong>${esc(player(l.playerId).name)} ${l.opponent?'vs '+esc(player(l.opponent).name):l.matchId==='championship'?'· Championship winner':''}</strong><span>${odds(l.odds)}</span></div>`).join('')}</div>
 <div class="ticket-summary"><div><span>Wager</span><strong>${credits(t.stake)} CR</strong></div>
 <div><span>Ticket odds</span><strong>${amer(t.decimal)}</strong></div><div><span>Potential payout</span><strong>${credits(t.projectedPayout)} CR</strong></div></div>
 </article>`).join('')||'<p class="section-sub">No tickets match these filters.</p>'}</div>`;
}
function futuresHTML(){
 const market=app.league.futures;
 return `<div class="section-head"><div><h2>Championship Futures</h2><p class="section-sub">${market.winner?'Champion · '+esc(player(market.winner).name):market.open?'Straight picks on the league champion':'Market closed'}</p></div></div>
 <div class="futures-grid">${market.lines.map(l=>{const p=player(l.playerId);return `<article class="panel future-card">
 <img src="${p.image}" alt=""/><div><strong>${esc(p.name)}</strong><small>${(100*l.probability).toFixed(1)}% model probability</small></div>
 <button class="pick-button ${app.futurePick===p.id?'selected':''}" data-future="${p.id}" ${market.open&&l.odds&&app.tab!=='admin'?'':'disabled'}>${l.odds?odds(l.odds):'—'}</button>
 </article>`;}).join('')}</div>`;
}
function adminHTML(){if(app.me?.role!=='admin')return `<div class="section-head"><h2>Admin access required</h2></div><div class="panel"><div class="panel-body"><p>Log in as <strong>admin</strong> using your server administrator password.</p><button id="adminSignIn" class="primary-button">Sign in</button></div></div>`;
if(!app.activity||!app.adminDraft)return '<p class="section-sub">Loading commissioner dashboard…</p>';
const d=app.adminDraft,w=d;return `<div class="breadcrumb">BTA LEAGUE &nbsp; › &nbsp; <strong>COMMISSIONER</strong></div><div class="section-head"><div><h2>Commissioner Dashboard</h2><span class="section-sub">Markets, results, exposure, and player credit activity.</span></div></div><label class="filter-row">Manage week <select id="adminWeek">${app.league.weeks.map(x=>`<option value="${x.week}" ${x.week===w.week?'selected':''}>${x.week}</option>`).join('')}</select></label><div class="admin-banner"><div><strong>⚙️ &nbsp; WEEK ${w.week} — MARKET MANAGEMENT</strong><br><small>Updates publish to every account on this server.</small></div><span class="ticket-status ${d.open?'won':'lost'}">${d.open?'OPEN':'CLOSED'}</span></div><div class="panel"><div class="panel-head">Edit Week ${w.week} Matchups</div><div class="panel-body"><p class="help-text">Set fair reference lines, then apply the house overround and market-wide volume adjustment. Every fan sees identical prices; accepted tickets lock their odds. Recorded results cannot be reversed.</p>
<div class="risk-settings"><div class="risk-head"><strong>◎ Dynamic Odds Engine</strong><span>Changes affect new virtual bets only</span></div><div class="risk-grid"><label><span>HOUSE VIG / OVERROUND (%)</span><input class="form-control" id="riskVig" data-risk="vigPct" type="number" min="4" max="30" step="1" value="${d.risk.vigPct}"/><small>4–30%. Default 20%. This is pricing overround, not guaranteed profit.</small></label><label><span>LINE MOVE / 100 CR (PP)</span><input class="form-control" id="riskMove" data-risk="movePer100" type="number" min="0" max="4" step="0.25" value="${d.risk.movePer100}"/><small>Implied-probability points moved per 100-credit net exposure.</small></label><label><span>MAX PRICE MOVEMENT (PP)</span><input class="form-control" id="riskCap" data-risk="maxMovePct" type="number" min="0" max="12" step="0.5" value="${d.risk.maxMovePct}"/><small>Maximum shift from the reference line.</small></label></div><p class="risk-footnote">Odds adjust based only on combined virtual stakes per selection — never on an individual player's identity, bet history, or device.</p></div><div class="admin-form">${d.matches.map((m,i)=>adminMatchHTML(m,i)).join('')}</div><div class="admin-footer"><label class="switch-row"><input id="openMarkets" type="checkbox" ${d.open?'checked':''}/> Markets open for virtual picks</label><div><button id="saveWeek" class="primary-button">Save & Publish Week ${w.week}</button></div></div><div class="admin-section-actions">${app.league.currentWeek<9?'<button id="nextWeek" class="secondary-button">Advance active week</button>':''}</div><p class="danger-text">Finalize winners only after independently verifying real match results. A settled result is final.</p></div></div>
 <div class="panel"><div class="panel-head">Outstanding Exposure</div><div class="panel-body">
 ${app.activity.exposure.count} pending tickets · ${credits(app.activity.exposure.stake)} CR at stake · up to ${credits(app.activity.exposure.maxReturn)} CR in gross payouts</div></div>
 ${futuresHTML()}<button id="toggleFutures" class="secondary-button" ${app.league.futures.winner?'disabled':''}>${app.league.futures.open?'Close':'Open'} futures market</button>
 ${standingsHTML()}${creditsHTML()}${activityHTML()}`;}
function adminMatchHTML(m,i){const pOpts=(sel)=>app.league.players.map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${esc(p.name)}</option>`).join('');return `<div class="admin-row" data-adminmatch="${i}"><div class="admin-row-header"><span> MATCH ${i+1} · ${esc(m.id)}</span><span>${m.winner===null?'NOT SETTLED':m.winner==='void'?'VOID':`WINNER: ${esc(player(m.winner).name)}`}</span></div><div><label class="form-label">PLAYER ONE</label><select class="form-control" data-adminfield="home" ${m.winner!==null||m.seasonFixture?'disabled':''}>${pOpts(m.home)}</select></div><div><label class="form-label">REFERENCE ML</label><input class="form-control" type="number" data-adminfield="baseHomeOdds" value="${m.baseHomeOdds}" ${m.winner!==null?'disabled':''}/></div><div><label class="form-label">PLAYER TWO</label><select class="form-control" data-adminfield="away" ${m.winner!==null||m.seasonFixture?'disabled':''}>${pOpts(m.away)}</select></div><div><label class="form-label">REFERENCE ML</label><input class="form-control" type="number" data-adminfield="baseAwayOdds" value="${m.baseAwayOdds}" ${m.winner!==null?'disabled':''}/></div><div class="result-actions"><span class="admin-exposure">LIVE ${odds(m.homeOdds)} / ${odds(m.awayOdds)} · VIRTUAL ACTION ${credits(m.exposureHome)} / ${credits(m.exposureAway)} CR</span><label class="admin-featured"><input type="checkbox" data-adminfield="featured" ${m.featured?'checked':''}/> ★ Featured</label><span>📍 <input data-adminfield="venue" class="form-control" style="display:inline-block;width:92px;padding:6px" value="${esc(m.venue||'TBD')}" aria-label="Venue"/></span><label><input type="checkbox" data-adminfield="open" ${m.open!==false?'checked':''} ${m.winner?'disabled':''}/> Match open</label>${m.winner===null?`<button class="mini-btn filled" data-result="${esc(m.id)}" data-winner="${m.home}">✓ ${esc(player(m.home).name)} won</button><button class="mini-btn filled" data-result="${esc(m.id)}" data-winner="${m.away}">✓ ${esc(player(m.away).name)} won</button><button class="mini-btn" data-result="${esc(m.id)}" data-winner="void">Void</button>`:m.historicalReview||(!m.setScore&&m.winner!=='void')?`<button class="mini-btn" data-result="${esc(m.id)}" data-winner="${esc(m.winner)}">${m.historicalReview?'Review and settle historical wagers':'Record missing set score'}</button>`:`<span class="match-settled">✓ ${m.setScore?.join('–')||'Final result'}</span>`}</div></div>`;}
function authHTML(){return `<div class="modal-backdrop" id="authBackdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="authTitle"><div class="modal-top"><button class="modal-close" id="closeAuth" aria-label="Close">×</button><img src="/assets/bta-logo.webp" alt=""/><h2 id="authTitle">${app.me?'Your BTA account':'Welcome to BTA'}</h2><p>${app.me?'Manage your profile and virtual credits.':'Join the league. Make your picks. Win bragging rights.'}</p></div>${app.me?`<div class="account-summary"><strong>${esc(app.me.name)} ${app.me.role==='admin'?'⚙️':''}</strong><p>${app.me.role==='admin'?'League commissioner':'Virtual balance: '+credits(app.me.balance)+' CR'}</p>${app.me.role==='admin'?'<button class="primary-button" id="goAdmin">Open Commissioner Dashboard</button>':''}<button class="secondary-button" id="signOut">Sign out</button></div>`:`<div class="modal-form"><div class="auth-switch"><button data-authmode="register" class="${app.authMode==='register'?'active':''}">Create account</button><button data-authmode="login" class="${app.authMode==='login'?'active':''}">Sign in</button></div><form id="authForm" class="form-stack"><div><label class="form-label">USERNAME</label><input name="username" type="text" autocomplete="username" required maxlength="22" placeholder="Your BTA username"/></div><div><label class="form-label">PASSWORD</label><input name="password" type="password" autocomplete="${app.authMode==='login'?'current-password':'new-password'}" minlength="8" required placeholder="At least 8 characters"/></div><button class="place-btn" type="submit">${app.authMode==='register'?'CREATE ACCOUNT — 1,000 FREE CREDITS':'SIGN IN'} ↗</button><p class="help-text">${app.authMode==='register'?'No payment information required.':'Admin? Sign in with username admin and your configured admin password.'} Free-to-play only.</p></form></div>`}</div></div>`;}
function showAuth(mode='register'){app.authMode=mode;app.showAuth=true;$('#modalLayer').innerHTML=authHTML();}
function hideAuth(){app.showAuth=false;$('#modalLayer').innerHTML='';}
async function placeBet(){if(!app.me)return showAuth('register');if(app.me.role==='admin')return toast('Commissioner accounts cannot place picks.','error');const legs=slipLegs(),stake=Number(app.stake);if(!legs.length)return toast('Choose a player first.','error');if(!Number.isFinite(stake)||stake<1||stake>500||Math.round(stake*100)/100!==stake)return toast('Choose a virtual stake between 1 and 500 credits.','error');if(stake>app.me.balance)return toast('Insufficient credits.','error');const factor=legs.reduce((a,l)=>a*l.decimal,1);if(!confirm(`Place ${legs.length===1?'a straight pick':'a '+legs.length+'-leg parlay'} for ${credits(stake)} virtual credits?\nCombined odds: ${amer(factor)}\nPotential payout: ${credits(factor*stake)} credits.\n\nPrices move based on league-wide virtual betting activity. No real money involved.`))return;try{app.loading=true;drawSlip();const r=await api('/api/tickets','POST',{stake,week:curWeek().week,picks:legs.map(l=>({matchId:l.matchId,playerId:l.playerId,expectedOdds:l.odds}))});app.me.balance=r.balance;app.futurePick=null;for(const l of legs)app.picks.delete(id(curWeek().week,l.matchId));app.slipOpen=false;app.tab='bets';await refresh();toast('Virtual bet placed! Good luck 🎾');}catch(e){if(e.message.includes('Line moved'))await refresh();toast(e.message,'error');}finally{app.loading=false;drawSlip();}}
async function reloadAdmin(week){
 await loadBoard();
 if(week!==undefined)app.adminDraft=structuredClone(app.league.weeks.find(w=>w.week===week));
 draw();
}
async function saveAdmin(){
 const d=app.adminDraft;
 try{
  await api('/api/admin/week','POST',{week:d.week,matches:d.matches,risk:d.risk,open:d.open});
  await reloadAdmin(d.week);
  toast(`Week ${d.week} published.`);
 }catch(e){toast(e.message,'error');}
}
async function setResult(matchId,winner){
 const week=app.adminDraft.week;
 const match=app.league.weeks.find(w=>w.week===week).matches.find(m=>m.id===matchId);
 let setScore=match.setScore;
 if(winner!=='void'&&!setScore){
  const score=prompt(`Sets won by ${player(match.home).name} and ${player(match.away).name}, in that order (for example, 2-1)`);
  if(score===null)return;
  if(!/^[012]\s*-\s*[012]$/.test(score.trim()))return toast('Enter a score such as 2-1.','error');
  setScore=score.split('-').map(Number);
 }
 if(!confirm(`Finalize ${winner==='void'?'a void result':player(winner).name+' as winner'} for ${player(match.home).name} vs ${player(match.away).name}? This settles eligible tickets.`))return;
 try{
  await api('/api/admin/result','POST',{week,matchId,winner,setScore});
  await reloadAdmin(week);
  toast('Result saved and eligible tickets settled.');
 }catch(e){toast(e.message,'error');}
}
async function nextWeek(){
 if(!confirm('Advance the active week? Both weeks’ markets will close until you publish the new week.'))return;
 try{
  await api('/api/admin/next-week','POST',{});
  await reloadAdmin();
  app.week=app.league.currentWeek;
  app.picks.clear();
  toast('Active week advanced.');
 }catch(e){toast(e.message,'error');}
}
async function toggleFutures(){
 try{
  await api('/api/admin/futures','POST',{open:!app.league.futures.open});
  await reloadAdmin(app.adminDraft.week);
 }catch(e){toast(e.message,'error');}
}
function updateOddsPreview(){const legs=slipLegs();const stake=Math.max(0,Number(app.stake)||0);const d=legs.reduce((a,l)=>a*l.decimal,1);const el=$('#payoutValue');if(el)el.textContent=credits(stake*d);}
function safeClick(e){const target=e.target.closest('button,[role="button"]');if(!target)return;
 if(target.id==='brandHome')return navigate('markets');
 if(target.dataset.route)return navigate(target.dataset.route);
 if(target.dataset.pick)return selectPick(target.dataset.pick,target.dataset.player);
 if(target.dataset.future&&app.tab==='futures'){app.futurePick=app.futurePick===target.dataset.future?null:target.dataset.future;app.picks.clear();return draw();}
 if(target.id==='toggleFutures')return toggleFutures();
 if(target.dataset.remove==='championship'){app.futurePick=null;return draw();}
 if(target.dataset.remove){app.picks.delete(id(curWeek().week,target.dataset.remove));return draw();}
 if(target.dataset.slipmode){app.slipMode=target.dataset.slipmode;return drawSlip();}
 if(target.dataset.stake){app.stake=target.dataset.stake;return drawSlip();}
 if(target.id==='clearSlip'){app.futurePick=null;for(const l of selectedLegs())app.picks.delete(id(curWeek().week,l.matchId));return draw();}
 if(target.id==='placeBet')return placeBet();
 if(target.id==='mobileSlipButton'){app.slipOpen=!app.slipOpen;return drawSlip();}
 if(target.id==='closeSlip'){app.slipOpen=false;return drawSlip();}
 if(target.id==='accountButton'||target.id==='walletButton'||target.id==='betsSignIn'||target.id==='adminSignIn')return showAuth(target.id==='adminSignIn'?'login':'register');
 if(target.id==='closeAuth')return hideAuth();
 if(target.dataset.authmode){app.authMode=target.dataset.authmode;return $('#modalLayer').innerHTML=authHTML();}
 if(target.id==='goAdmin'){hideAuth();return navigate('admin');}
 if(target.id==='signOut'){api('/api/logout','POST',{}).then(()=>{app.me=null;app.tickets=[];hideAuth();navigate('markets');toast('Signed out.');}).catch(e=>toast(e.message,'error'));return;}
 if(target.id==='saveWeek')return saveAdmin();
 if(target.id==='nextWeek')return nextWeek();
 if(target.dataset.result)return setResult(target.dataset.result,target.dataset.winner);
}
document.addEventListener('click',e=>{if(e.target?.id==='authBackdrop')hideAuth();safeClick(e);});
document.addEventListener('change',e=>{
 if(e.target.id==='weekSelect'){app.week=Number(e.target.value);app.picks.clear();draw();}
 if(['filterStatus','filterPlayer','activitySort'].includes(e.target.id)){app[e.target.id]=e.target.value;draw();document.getElementById(e.target.id)?.focus();}
 if(e.target.id==='adminWeek'){app.adminDraft=structuredClone(app.league.weeks.find(w=>w.week===Number(e.target.value)));draw();}
 if(e.target.id==='singleSelect'){app.singlePick=e.target.value;drawSlip();}
 if(e.target.id==='openMarkets')app.adminDraft.open=e.target.checked;
 if(e.target.dataset.risk)app.adminDraft.risk[e.target.dataset.risk]=Number(e.target.value);
 if(e.target.dataset.adminfield){const row=e.target.closest('[data-adminmatch]');const i=Number(row?.dataset.adminmatch);if(!Number.isInteger(i))return;const field=e.target.dataset.adminfield;app.adminDraft.matches[i][field]=(field==='featured'||field==='open')?e.target.checked:field==='homeOdds'||field==='awayOdds'||field==='baseHomeOdds'||field==='baseAwayOdds'?Number(e.target.value):e.target.value;}
});
document.addEventListener('input',e=>{if(e.target.id==='stakeInput'){app.stake=e.target.value;updateOddsPreview();}});
document.addEventListener('submit',async e=>{if(e.target.id!=='authForm')return;e.preventDefault();const fields=new FormData(e.target),username=fields.get('username'),password=fields.get('password');const btn=e.target.querySelector('button[type="submit"]');btn.disabled=true;try{const result=await api('/api/'+(app.authMode==='register'?'register':'login'),'POST',{username,password});hideAuth();await refresh();toast(`Welcome${result.user.role==='admin'?', Commissioner':' to BTA, '+result.user.name}!`);if(result.user.role==='admin')navigate('admin');}catch(error){toast(error.message,'error');}finally{btn.disabled=false;}});
// Shared server-side prices refresh across spectators every eight seconds. Avoid
// interrupting the commissioner while editing market configuration.
setInterval(async()=>{if(!app.league||app.tab==='admin'||app.loading||app.showAuth)return;try{
 const data=await api('/api/league');if(data.revision!==app.league.revision){
  const oldWeek=app.league.currentWeek;app.league=data;
  if(app.week===oldWeek&&data.currentWeek!==oldWeek){app.week=data.currentWeek;app.picks.clear();}
  const me=await api('/api/me');app.me=me.user;app.tickets=me.tickets;
  if(['credits','activity'].includes(app.tab))await loadBoard();
  draw();
 }
}catch{}},8000);
refresh().catch(e=>{$('#mainContent').innerHTML=`<div class="panel"><div class="empty-panel"><div class="bigicon">⚠</div><strong>Could not connect to BTA server</strong><p>${esc(e.message)}. Run <code>npm start</code> in the project folder and open the local address shown in the terminal.</p></div></div>`;toast('BTA server connection failed.','error');});
