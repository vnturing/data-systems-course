global.window={}; global.document={addEventListener(){}};
require('../assets/sim-fanout.js'); const F=window.FanoutSim,D=F.defaults; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const M=o=>F.model(Object.assign({},D,o));
let m=M({});
const mass=F.bins(D).reduce((a,b)=>a+b.authors,0);
chk('bins account for every author',Math.abs(mass-D.users)/D.users<1e-9);
chk('largest account is capped at capFrac*users',Math.abs(m.maxF-D.capFrac*D.users)<1);
chk('pure pull does no inserts',m.pull.writes===0);
chk('pure push reads are exactly one timeline fetch per read',Math.abs(m.push.reads-D.readsPerUser*D.users)<1);
for(let i=1;i<m.rows.length;i++){
  chk('burst non-decreasing in threshold',m.rows[i].maxBurst>=m.rows[i-1].maxBurst);
  chk('write work non-decreasing in threshold',m.rows[i].writes>=m.rows[i-1].writes);
  chk('read work non-increasing in threshold',m.rows[i].reads<=m.rows[i-1].reads+1e-6);
}
// defaults: push is the cheapest in total work, but violates the delivery deadline; the deadline picks the threshold
chk('defaults: pure push is cheapest in total work',m.cheapest.T===Infinity);
chk('defaults: pure push misses the deadline (worst fan-out >> 5 s)',!m.push.feasible&&m.push.burstSeconds>100);
chk('defaults: chosen design is a hybrid, not push and not pull',m.bestFeasible.T>0&&m.bestFeasible.T<Infinity);
chk('defaults: chosen threshold is feasible and cheaper than pull',m.bestFeasible.feasible&&m.bestFeasible.total<m.pull.total);
// the follower count cancels: crossover at readsPerUser*mergeCost == tweetsPerUser*insertCost (here 60*mc == 3)
chk('cheap merges (60*0.04=2.4 < 3): pull is cheaper than push',M({mergeCost:0.04}).pull.total<M({mergeCost:0.04}).push.total);
chk('dear merges (60*0.06=3.6 > 3): push is cheaper than pull',M({mergeCost:0.06}).push.total<M({mergeCost:0.06}).pull.total);
chk('cheap merges: pure pull is chosen',M({mergeCost:0.02}).bestFeasible.T===0);
chk('faster fan-out admits a higher threshold',M({insertRate:500000}).bestFeasible.T>=m.bestFeasible.T);
console.log(bad?bad+' failures':'fan-out model: 21 properties hold'); process.exit(bad?1:0);
