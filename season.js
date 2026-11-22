'use strict';

const { implied } = require('./odds-engine');
const schedule = [
  'jack:morris:1:2 eric:ryan:2:0 soly:fish:0:2 vic:joe-d:2:0 joey:jacob:2:1',
  'jack:jacob joe-d:joey fish:vic:0:2 ryan:soly morris:eric:0:2',
  'jack:fish ryan:joe-d morris:jacob eric:joey soly:vic',
  'jack:joe-d fish:jacob ryan:joey morris:vic eric:soly',
  'jack:ryan morris:fish eric:joe-d soly:jacob vic:joey',
  'jack:joey jacob:vic joe-d:soly fish:eric ryan:morris',
  'jack:vic joey:soly jacob:eric joe-d:morris fish:ryan',
  'jack:soly vic:eric joey:morris jacob:ryan joe-d:fish',
  'jack:eric soly:morris vic:ryan joe-d:jacob fish:joey'
].map(week => week.split(' ').map(entry => entry.split(':')));

const pair = (a,b) => [a,b].sort().join(':');

function seedSeason(db, defaultRisk) {
  for (const [index, fixtures] of schedule.entries()) {
    const number = index + 1;
    let week = db.weeks.find(w => w.week === number);
    if (!week) {
      week = {week:number, open:false, risk:{...defaultRisk}, matches:[], updatedAt:Date.now()};
      db.weeks.push(week);
    }
    for (const [slot, [home, away, hs, as]] of fixtures.entries()) {
      const candidates = week.matches.filter(m => pair(m.home,m.away) === pair(home,away));
      const matchId = `w${number}m${slot+1}`;
      let match = candidates.find(m => m.id === matchId) || candidates.find(m => m.winner) || candidates[0];
      if (!match) {
        const id = week.matches.some(m => m.id === matchId) ? `season-${matchId}` : matchId;
        match = {id, home, away, homeOdds:100, awayOdds:100,
          baseHomeOdds:100, baseAwayOdds:100, venue:'TBD', winner:null, lineHistory:[]};
        week.matches.push(match);
      }
      match.seasonFixture = true;
      if (hs !== undefined) {
        const score = match.home === home ? [Number(hs),Number(as)] : [Number(as),Number(hs)];
        const winner = score[0] === 2 ? match.home : match.away;
        if (!match.winner) {
          match.winner = winner;
          match.historicalReview = db.tickets.some(t => t.status === 'pending' &&
            t.week === number && t.legs.some(l => l.matchId === match.id));
        }
        if (match.winner === winner) match.setScore ??= score;
      }
    }
  }
}

function standings(players, weeks) {
  const rows = new Map(players.map(p => [p.id,{...p,wins:0,losses:0,setsWon:0,setsLost:0}]));
  for (const {matches} of weeks) for (const m of matches) {
    if (!m.seasonFixture || ![m.home,m.away].includes(m.winner)) continue;
    const home = rows.get(m.home), away = rows.get(m.away);
    rows.get(m.winner).wins++;
    rows.get(m.winner === m.home ? m.away : m.home).losses++;
    if (m.setScore) {
      const [hs,as] = m.setScore;
      home.setsWon += hs; home.setsLost += as;
      away.setsWon += as; away.setsLost += hs;
    }
  }
  return [...rows.values()].sort((a,b) => b.wins-a.wins ||
    (b.setsWon-b.setsLost)-(a.setsWon-a.setsLost) || a.name.localeCompare(b.name));
}

// The simulation is stable across requests, and uses the same ranking rules as
// settlement. Reference prices are normalized before blending with form.
function championship(players, weeks, settings = {}) {
  const rows = standings(players,weeks);
  const fixturesForSeason = weeks.flatMap(w => w.matches.filter(m => m.seasonFixture));
  const remaining = fixturesForSeason.filter(m => !m.winner);
  const unscored = fixturesForSeason.some(m => m.winner && m.winner !== 'void' && !m.setScore);
  const review = fixturesForSeason.some(m => m.historicalReview);
  const index = new Map(rows.map((p,i) => [p.id,i]));
  const counts = rows.map(() => 0);
  const fixtures = remaining.map(m => {
    const h = index.get(m.home), a = index.get(m.away);
    const form = p => (p.wins+2)/(p.wins+p.losses+4);
    const fh = form(rows[h]), fa = form(rows[a]);
    const home = implied(m.baseHomeOdds), away = implied(m.baseAwayOdds);
    return {h,a,p:(home/(home+away)+fh/(fh+fa))/2};
  });
  let seed = 744859;
  const draw = () => {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    return seed / 2**32;
  };
  const trials = remaining.length ? 8192 : 1;
  for (let i=0;i<trials;i++) {
    const wins = rows.map(p => p.wins);
    const sets = rows.map(p => p.setsWon-p.setsLost);
    for (const {h,a,p} of fixtures) {
      const homeWins = draw() < p;
      const diff = draw() < 0.5 ? 1 : 2;
      wins[homeWins?h:a]++;
      sets[h] += homeWins ? diff : -diff;
      sets[a] += homeWins ? -diff : diff;
    }
    let best = 0;
    for (let j=1;j<rows.length;j++) {
      if (wins[j]>wins[best] || wins[j]===wins[best] &&
        (sets[j]>sets[best] || sets[j]===sets[best] && rows[j].name.localeCompare(rows[best].name)<0)) best=j;
    }
    counts[best]++;
  }
  const winner = remaining.length || unscored || review ? null : rows[counts.indexOf(trials)].id;
  return {open:remaining.length>0 && settings.open!==false,winner,lines:rows.map((p,i) => {
    const probability = counts[i]/trials;
    // Decimal quotes are rounded down to cents. Zero/locked outcomes are unpriced.
    const price = probability>0 ? Math.floor(100/probability)/100 : 0;
    const decimal = price>1 ? price : null;
    return {playerId:p.id,probability,decimal,odds:decimal===null?null:
      decimal>=2?Math.round((decimal-1)*100):-Math.round(100/(decimal-1))};
  })};
}

module.exports = {schedule,seedSeason,standings,championship};
