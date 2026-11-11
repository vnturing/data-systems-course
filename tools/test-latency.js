global.window={}; global.document={addEventListener(){}};
require('../assets/sim-latency.js'); const L=window.LatencySim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const trialsFor=N=>Math.min(50000,Math.max(2000,Math.floor(200000/N)));
const s=L.stats(L.samples(100000,L.defaults,7));
chk('median near the fast mode (50 ms)',s.p50>45&&s.p50<56);
chk('p99 sits in the slow mode (>1000 ms)',s.p99>1000);
chk('mean is far from both modes: mean < p99/10 and mean > 1.3*p50',s.mean<s.p99/10&&s.mean>1.3*s.p50);
// The Tail at Scale arithmetic (Dean and Barroso 2013)
chk('100 servers, 1% slow each => 63% of requests slow',Math.abs(L.fanoutSlowProb(0.01,100)-0.634)<0.001);
chk('2000 servers, 1 in 10,000 slow => ~18% (almost one in five)',Math.abs(L.fanoutSlowProb(1e-4,2000)-0.181)<0.001);
// fan-out simulation agrees with the formula
const b1=L.fanout(1,L.defaults,0,trialsFor(1),11),b100=L.fanout(100,L.defaults,0,trialsFor(100),11);
chk('N=1: median is the typical (fast) latency',b1.p50<60);
chk('N=1: p99 reflects the 1.2% slow share',b1.p99>1000);
chk('N=100: most requests (median) hit a slow call',b100.p50>1000);
// hedging
const sorted=L.samples(100000,L.defaults,9).sort((a,b)=>a-b),h95=sorted[Math.floor(.95*sorted.length)];
const h100=L.fanout(100,L.defaults,h95,trialsFor(100),11);
chk('hedging after p95 sends ~5% extra calls',h100.extraLoad>0.04&&h100.extraLoad<0.06);
chk('hedging cuts N=100 median by >5x',h100.p50<b100.p50/5);
chk('hedging does not remove double-slow events (p99 still large at N=100)',h100.p99>500);
// merging percentiles
const A=L.samples(50000,{slowFrac:0.04},7),B=L.samples(50000,{slowFrac:0.004},8);
const fleet=L.stats(A.concat(B)).p99,avg=(L.stats(A).p99+L.stats(B).p99)/2;
chk('average of host p99s differs from the fleet p99 by >20%',Math.abs(avg-fleet)/fleet>0.2);
// coordinated omission
const c=L.co(L.coDefaults);
chk('closed loop omits roughly the stall length of samples (~500)',L.coDefaults.n-c.closed.n>=450&&L.coDefaults.n-c.closed.n<=550);
chk('closed loop p99 is tiny',c.closed.p99<2);
chk('open loop p99 is hundreds of ms',c.open.p99>300);
chk('both saw the same worst request (~stall length)',Math.abs(c.closed.max-c.open.max)<5);
chk('deterministic',JSON.stringify(L.co(L.coDefaults))===JSON.stringify(c));
console.log(bad?bad+' failures':'latency models: 16 properties hold'); process.exit(bad?1:0);
