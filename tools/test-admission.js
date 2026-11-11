global.window={}; global.document={addEventListener(){}};
require('../assets/sim-admission.js'); const A=window.AdmissionSim,D=A.defaults; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const sum=(s,a,b,k)=>s.slice(a,b).reduce((x,y)=>x+y[k],0);
for(const p of Object.keys(A.POLICIES)){
  const r=A.run(p,D),T=r.T;
  chk('conservation under '+p,Math.abs(T.arrived-(T.good+T.wasted+T.rejected+T.dropped+T.remaining))<1e-6);
}
const none=A.run('none',D),bnd=A.run('bounded',D),ddl=A.run('deadline',D),both=A.run('both',D);
chk('none: work is wasted on requests nobody is waiting for',none.T.wasted>1000);
// collapse begins once the head of the queue is older than client patience (~tick 34 at the defaults), not at surge start
const firstWaste=none.series.findIndex(s=>s.wasted>0),lastZero=none.series.map((s,i)=>s.good<1?i:-1).filter(i=>i>=0).pop();
chk('none: full goodput until the backlog outgrows client patience, then waste begins (tick 34)',firstWaste===34&&sum(none.series,20,34,'good')>=14*D.cap-1e-6);
chk('none: goodput is ~zero from shortly after waste begins',sum(none.series,36,50,'good')<1);
chk('none: collapse OUTLASTS the surge (hysteresis): still ~zero goodput 20 ticks after it ends',sum(none.series,50,70,'good')<1);
chk('none: eventually recovers',sum(none.series,100,120,'good')>0.9*20*D.base);
chk('bounded: goodput stays at capacity through the surge',none.series.length&&bnd.series.slice(25,50).every(s=>Math.abs(s.good-D.cap)<1e-6));
chk('bounded: no wasted work',bnd.T.wasted<1e-6);
chk('bounded: goodput never dips after the surge (retained backlog drains at full capacity)',bnd.series.slice(50).every(s=>s.good>=D.base-1e-6));
chk('bounded: queue empty within 6 ticks of the surge ending',bnd.series[56].queue<1e-6);
chk('deadline-only: goodput also holds at capacity during the surge',ddl.series.slice(30,50).every(s=>Math.abs(s.good-D.cap)<1e-6));
chk('deadline-only serves slower than bounded (longer waits)',ddl.T.meanGoodLatency>bnd.T.meanGoodLatency);
chk('both policies beat none on requests served in time',bnd.T.good>none.T.good&&ddl.T.good>none.T.good&&both.T.good>none.T.good);
const calm=Object.assign({},D,{surge:D.base});
for(const p of Object.keys(A.POLICIES)){const r=A.run(p,calm).T;chk('no surge => '+p+' serves everything with no waste',Math.abs(r.good-r.arrived)<1e-6&&r.wasted<1e-6&&r.rejected<1e-6);}
chk('more patient clients shrink the damage of an unbounded queue',A.run('none',Object.assign({},D,{deadline:12})).T.good>none.T.good);
console.log('[info] unbounded queue: first wasted work at tick',firstWaste,'; last near-zero-goodput tick',lastZero,'; surge ends at tick',D.surgeEnd);
console.log(bad?bad+' failures':'admission model: 21 properties hold'); process.exit(bad?1:0);
