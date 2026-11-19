'use strict';
// Market-wide virtual-credit price discovery. Never personalizes odds per user.
const DEFAULT_RISK = Object.freeze({vigPct:20,movePer100:1.25,maxMovePct:8});
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
function validMoneyline(n){return Number.isInteger(n)&&((n>=100&&n<=10000)||(n<=-100&&n>=-10000));}
function decimal(n){return n>0?1+n/100:1+100/-n;}
function implied(n){return 1/decimal(n);}
function moneyline(p){
 p=clamp(p,.010001,.989999);
 return p>=.5? -Math.max(100,Math.round(100*p/(1-p))):Math.max(100,Math.round(100*(1-p)/p));
}
function riskSettings(x={}){
 return {
  vigPct:x.vigPct===undefined?DEFAULT_RISK.vigPct:Number(x.vigPct),
  movePer100:x.movePer100===undefined?DEFAULT_RISK.movePer100:Number(x.movePer100),
  maxMovePct:x.maxMovePct===undefined?DEFAULT_RISK.maxMovePct:Number(x.maxMovePct)
 };
}
function validRisk(r){return Number.isFinite(r.vigPct)&&r.vigPct>=4&&r.vigPct<=30&&Number.isFinite(r.movePer100)&&r.movePer100>=0&&r.movePer100<=4&&Number.isFinite(r.maxMovePct)&&r.maxMovePct>=0&&r.maxMovePct<=12;}
function quote(baseHomeOdds,baseAwayOdds,risk,exposureHome=0,exposureAway=0){
 if(!validMoneyline(baseHomeOdds)||!validMoneyline(baseAwayOdds))throw Error('Invalid reference odds');
 if(!validRisk(risk))throw Error('Invalid house margin settings');
 const h=implied(baseHomeOdds),a=implied(baseAwayOdds);
 const fairH=h/(h+a),fairA=1-fairH;
 const shift=clamp((exposureHome-exposureAway)/100*risk.movePer100,-risk.maxMovePct,risk.maxMovePct)/100;
 const vig=risk.vigPct/100;
 // Add half the overround to each fair probability. Limit the individual quote
 // to sensible moneylines, preserving a nonnegative opposing quoted probability.
 let quotedHome=clamp(fairH+vig/2+shift,.0101,.9899);
 let quotedAway=clamp(1+vig-quotedHome,.0101,.9899);
 // Extremely skewed scenarios may hit the price cap; keep the sum near the configured vig.
 if(quotedAway===.9899)quotedHome=clamp(1+vig-quotedAway,.0101,.9899);
 return {
  homeOdds:moneyline(quotedHome),awayOdds:moneyline(quotedAway),
  homeProbability:quotedHome,awayProbability:quotedAway,
  estimatedOverroundPct:Math.round(((implied(moneyline(quotedHome))+implied(moneyline(quotedAway)))-1)*10000)/100,
  lineMovePct:Math.round(shift*10000)/100,
  exposureHome:Math.round(exposureHome*100)/100,exposureAway:Math.round(exposureAway*100)/100
 };
}
module.exports={DEFAULT_RISK,validMoneyline,decimal,implied,moneyline,riskSettings,validRisk,quote};
