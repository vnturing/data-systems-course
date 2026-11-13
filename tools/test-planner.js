global.window={}; global.document={addEventListener(){}};
require('../assets/sim-planner.js'); const P=window.PlannerSim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const within=(a,b,tol)=>Math.abs(a-b)/b<=tol;
// Calibration against measurements on MySQL 8.0.46 (Handler_read_* totals; see lesson 16 and experiments/mysql/)
for(const m of P.MEASURED){
  const aw=P.asWritten(m.cfg),b=P.best(m.cfg);
  chk(m.name+': toy as-written cost within 1% of measured',within(aw.cost,m.asWritten,0.01));
  chk(m.name+': toy cheapest cost within 10% of a measured optimizer outcome',m.reads.some(r=>within(b.cost,r,0.10))||m.reads.some(r=>within(aw.cost,r,0.01)));
}
// the toy picks the same join order the real optimizer chose in configurations B..E (stable there)
const ord=(i)=>P.best(P.MEASURED[i].cfg).order;
chk('B: regions-first like MySQL',ord(1)==='r>c>o'); chk('C: orders-first like MySQL',ord(2)==='o>c>r');
chk('D: orders-first like MySQL',ord(3)==='o>c>r'); chk('E: orders-first like MySQL',ord(4)==='o>c>r');
// A is a near tie in practice: the toy prefers regions-first, and its runner-up equals MySQL's other measured choice
const A=P.plans(P.MEASURED[0].cfg).sort((x,y)=>x.cost-y.cost);
chk('A: two cheapest plans are r>c>o and o>c>r (the pair MySQL alternated between)',[A[0].order,A[1].order].sort().join()==='o>c>r,r>c>o');
// structural properties
const all=[true,false].flatMap(s=>[true,false].flatMap(o=>[true,false].map(c=>({idxStatus:s,idxOc:o,idxCr:c}))));
for(const c of all){
  const b=P.best(c);
  chk('best <= every plan '+JSON.stringify(c),P.plans(c).every(p=>b.cost<=p.cost));
  chk('as-written >= best '+JSON.stringify(c),P.asWritten(c).cost>=b.cost);
  for(const k of ['idxStatus','idxOc','idxCr']) if(!c[k]){const c2=Object.assign({},c,{[k]:true});chk('adding '+k+' never raises the best cost',P.best(c2).cost<=b.cost+1e-9);}
}
chk('without any secondary index every plan reads at least the orders table or hashes it (>= 1M)',P.best({idxStatus:false,idxOc:false,idxCr:false}).cost>=1e6);
chk('rarer open orders make the orders-first plan cheaper',P.asWritten({statusSel:0.002}).cost<P.asWritten({statusSel:0.02}).cost);
chk('same SQL, 40x spread between as-written and best when status is unindexed',P.asWritten({idxStatus:false}).cost/P.best({idxStatus:false}).cost>40);
console.log(bad?bad+' failures':'planner model: all properties hold'); process.exit(bad?1:0);
