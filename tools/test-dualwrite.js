global.window={}; global.document={addEventListener(){}};
require('../assets/sim-dualwrite.js');
const {run}=window.DualWriteSim; let bad=0;
function ex(k,crash,fault,db,kafka,re,label){
  const r=run(k,crash,fault); const ok=r.db===db&&r.kafka===kafka&&re.test(r.verdict);
  if(!ok){bad++;console.log('FAIL',label,JSON.stringify(r));}
}
// A: commit then publish
ex('commitFirst',-1,null,false,0,/Clean/,'A-before');
ex('commitFirst',0,null,false,0,/Clean/,'A-after insert (rolled back)');
ex('commitFirst',1,null,true,0,/LOST/,'A-after commit');
ex('commitFirst',2,null,true,1,/Consistent/,'A-after produce (client timeout)');
ex('commitFirst',3,null,true,1,/Consistent/,'A-after reply');
ex('commitFirst',null,'commitError',false,0,/Clean/,'A-commit error');
// B: publish then commit
ex('publishFirst',0,null,false,0,/Clean/,'B-after insert');
ex('publishFirst',1,null,false,1,/PHANTOM/,'B-after produce');
ex('publishFirst',2,null,true,1,/Consistent/,'B-after commit');
ex('publishFirst',null,'commitError',false,1,/PHANTOM/,'B-commit error');
// C: outbox
ex('outbox',0,null,false,0,/Clean/,'C-after insert (rolled back)');
ex('outbox',1,null,true,1,/Consistent/,'C-after commit (relay delivers)');
ex('outbox',2,null,true,1,/Consistent/,'C-after reply');
ex('outbox',3,null,true,1,/Consistent/,'C-relay crash after select');
ex('outbox',4,null,true,2,/DUPLICATE/,'C-relay crash after produce');
ex('outbox',5,null,true,1,/Consistent/,'C-relay crash after mark sent');
ex('outbox',null,'commitError',false,0,/Clean/,'C-commit error');
console.log(bad?bad+' failures':'dual-write model: all 17 cases match'); process.exit(bad?1:0);
