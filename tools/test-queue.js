global.window={}; global.document={addEventListener(){}};
require('../assets/sim-queue.js'); const Q=window.QueueSim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const N=300000, rel=(a,b)=>Math.abs(a/b-1);
// the simulator reproduces the closed forms
for(const rho of [0.5,0.7,0.8]){
  chk('M/M/1 mean matches s/(1-rho) at rho='+rho,rel(Q.simulate(rho,'exp',N,5).mean,1/(1-rho))<0.03);
  chk('M/M/1 p99 matches ln(100)/(1-rho) at rho='+rho,rel(Q.simulate(rho,'exp',N,5).p99,Q.theoryP99Exp(rho))<0.06);
}
chk('M/D/1 mean matches Pollaczek-Khinchine at 0.8',rel(Q.simulate(0.8,'det',N,5).mean,Q.theoryMean(0.8,0))<0.03);
chk('M/H2/1 mean matches Pollaczek-Khinchine at 0.8 (SCV 4)',rel(Q.simulate(0.8,'h2',N,5).mean,Q.theoryMean(0.8,4))<0.05);
// the headline shapes
const m=r=>Q.simulate(r,'exp',N,5);
chk('mean latency is ~2x at 50% utilization',rel(m(0.5).mean,2)<0.03);
chk('mean latency is ~5x at 80% and ~10x at 90%',rel(m(0.8).mean,5)<0.03&&rel(m(0.9).mean,10)<0.05);
chk('p99 grows faster than the mean from 50% to 90%',m(0.9).p99/m(0.5).p99>m(0.9).mean/m(0.5).mean*0.9);
chk('same utilization, more service-time variance => more waiting',Q.simulate(0.8,'h2',N,5).mean>Q.simulate(0.8,'exp',N,5).mean&&Q.simulate(0.8,'exp',N,5).mean>Q.simulate(0.8,'det',N,5).mean);
chk('mean response is increasing in utilization',[0.3,0.5,0.7,0.9].every((r,i,a)=>i===0||m(r).mean>m(a[i-1]).mean));
chk("Little's law: 500 req/s x 40 ms = 20 in flight",Math.abs(Q.little(500,0.04)-20)<1e-9);
chk('deterministic given the seed',JSON.stringify(Q.simulate(0.7,'exp',50000,3))===JSON.stringify(Q.simulate(0.7,'exp',50000,3)));
console.log(bad?bad+' failures':'queue model: 15 properties hold'); process.exit(bad?1:0);
