global.window={}; global.document={addEventListener(){}};
require('../assets/sim-retry.js');
const R=window.RetrySim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
// Herd lab (Lab A)
const H=(k,rc)=>R.herd(k,Object.assign({},R.herdDefaults,{rejCost:rc}));
let i0=H('immediate',0),b0=H('backoff',0),j0=H('jitter',0);
chk('free failures: jitter uses fewer calls than unjittered backoff',j0.callsPerClient<b0.callsPerClient);
chk('free failures: jitter finishes sooner than unjittered backoff',j0.finish<b0.finish);
chk('free failures: immediate is fastest but wasteful',i0.finish<j0.finish&&i0.callsPerClient>j0.callsPerClient);
for(const rc of [0.1,0.2,0.3]){
  chk('costly failures: immediate never finishes (rc='+rc+')',!H('immediate',rc).finished);
  chk('costly failures: synchronized backoff never finishes (rc='+rc+')',!H('backoff',rc).finished);
  chk('costly failures: jitter finishes (rc='+rc+')',H('jitter',rc).finished);
}
chk('conservation: free-failure jitter serves everyone (calls >= clients)',j0.callsPerClient>=1);
// Outage lab (Lab B)
const O=(k,m,l)=>R.simulate(k,Object.assign({},R.defaults,{maxRetries:m,outLen:l}));
chk('no retries => exactly 1 attempt per request',Math.abs(O('none',5,5).amplification-1)<1e-9);
chk('retry budget bounds amplification',O('budget',12,15).amplification<1.1);
chk('immediate retries amplify more as max retries grows',O('immediate',10,5).amplification>O('immediate',5,5).amplification);
chk('immediate with many retries fails to recover',O('immediate',10,5).recovery===null);
chk('jitter recovers at default settings',O('jitter',5,5).recovery!==null);
chk('budget recovers immediately in every tested case',[[5,5],[10,5],[15,12]].every(a=>O('budget',a[0],a[1]).recovery===0));
chk('deterministic',JSON.stringify(O('jitter',5,5))===JSON.stringify(O('jitter',5,5)));
console.log(bad?bad+' failures':'retry models: 14 properties hold'); process.exit(bad?1:0);
