global.window={}; global.document={addEventListener(){}};
require('../assets/sim-detector.js');
const D=window.DetectorSim, Ts=[1.5,2,3,5,8,12,20,30,60]; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
for(const heavy of [false,true]){
  const rows=D.sweep(Object.assign({},D.defaults,{heavy,spikeP:0.001}),Ts);
  for(let i=1;i<rows.length;i++){
    chk('false suspicions non-increasing in T (heavy='+heavy+')',rows[i].falsePerDay<=rows[i-1].falsePerDay);
    chk('detection delay increasing in T',rows[i].meanDetect>rows[i-1].meanDetect);
  }
  if(!heavy) chk('bounded stalls: zero false suspicions once T exceeds the bound',rows.find(r=>r.T===12).falsePerDay===0);
  if(heavy)  chk('heavy tail: still false suspicions at T=30',rows.find(r=>r.T===30).falsePerDay>0);
}
const a=D.sweep(D.defaults,Ts), b=D.sweep(D.defaults,Ts);
chk('deterministic (seeded)',JSON.stringify(a)===JSON.stringify(b));
const z=D.sweep(Object.assign({},D.defaults,{spikeP:0}),Ts); chk('no stalls => no false suspicions',z.every(r=>r.falsePerDay===0));
console.log(bad?bad+' failures':'detector model: invariants hold'); process.exit(bad?1:0);
