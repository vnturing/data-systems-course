global.window={}; global.document={addEventListener(){}};
require('../assets/sim-schema.js'); const S=window.SchemaSim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const all={1:true,2:true,3:true}, v1={1:true,2:false,3:false}, v12={1:true,2:true,3:false};
const recs=S.stream(3000),share=v=>recs.filter(r=>r.v===v).length/recs.length;
chk('stream is 50% v1, 30% v2, 20% v3',share(1)===0.5&&share(2)===0.3&&share(3)===0.2);
let r=S.run(all,'default');chk('a reader that knows every shape is always correct',r.correct===3000&&r.silentlyWrong===0&&r.loudErrors===0);
r=S.run(v1,'default');chk('v1-only reader with silent defaults: 50% correct, 50% silently wrong, 0 loud',r.correct===1500&&r.silentlyWrong===1500&&r.loudErrors===0);
r=S.run(v1,'throw');chk('v1-only reader that fails loudly: 50% correct, 0 silently wrong, 50% loud errors',r.correct===1500&&r.silentlyWrong===0&&r.loudErrors===1500);
r=S.run(v12,'default');chk('v1+v2 reader: only the 20% v3 records are silently wrong',r.silentlyWrong===600&&r.correct===2400);
chk('same data, same reader: failing loudly converts every silent error into a loud one',S.run(v12,'throw').loudErrors===S.run(v12,'default').silentlyWrong);
const bad2=S.stream(10).map(x=>S.truth(x));chk('ground truth is well-formed for every version',bad2.every(t=>typeof t.name==='string'&&(t.tier==='pro'||t.tier==='free')));
console.log(bad?bad+' failures':'schema model: all properties hold'); process.exit(bad?1:0);
