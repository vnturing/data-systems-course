// Sanity tests for the simulator's outcome matrix. Run: node tools/test-sim.js
global.window={}; global.document={addEventListener(){}};
require('../assets/sim-timeout.js');
const {simulate}=window.TimeoutSim;
const expect={
 none:{lost:[0,'failed'],crash:[0,'failed'],lostresp:[1,'failed'],slow:[1,'failed']},
 blind:{lost:[1,'success'],crash:[1,'success'],lostresp:[2,'success'],slow:[2,'success']},
 key:{lost:[1,'success'],crash:[1,'success'],lostresp:[1,'success'],slow:[1,'success']},
 keynonatomic:{lost:[1,'success'],crash:[0,'success'],lostresp:[1,'success'],slow:[1,'success']}};
let bad=0;
for(const st in expect)for(const sc in expect[st]){
  const r=simulate(sc,st),[c,b]=expect[st][sc];
  if(r.charges!==c||r.belief!==b){bad++;console.log('FAIL',st,sc,r.charges,r.belief)}
}
console.log(bad?bad+' failures':'all 16 cells match expected outcomes');
process.exit(bad?1:0);
