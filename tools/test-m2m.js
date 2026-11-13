global.window={}; global.document={addEventListener(){}};
require('../assets/sim-m2m.js'); const M=window.M2MSim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const c=(r,op,o)=>M.cost(r,op,o);
chk('250 articles per tag by default',M.A(M.DEF)===250);
chk('one-sided: reverse lookup with array index = 1+A reads; without = N+3 (measured pattern)',c('one','articles').reads===251&&c('one','articles',{reverseIndex:false}).reads===100003);
chk('one-sided delete rewrites every article that had the tag plus the tag',c('one','del').writes===251);
chk('two-sided: reverse lookup is one read but attaching needs two writes',c('two','articles').reads===1&&c('two','add').writes===2);
chk('two-sided attach has exactly one torn state without multi-document commit, none with',c('two','add',{multiDocTxn:false}).torn===1&&c('two','add',{multiDocTxn:true}).torn===0);
chk('junction: attach is a single write and never torn',c('junction','add').writes===1&&c('junction','add',{multiDocTxn:false}).torn===0);
chk('junction: both directions cost proportional to the answer, not the table',c('junction','tags').reads===5&&c('junction','articles').reads===250);
chk('delete tag: one-sided and two-sided tear without multi-document commit; junction does not',
  c('one','del',{multiDocTxn:false}).torn===250&&c('two','del',{multiDocTxn:false}).torn===250&&c('junction','del',{multiDocTxn:false}).torn===0);
chk('more tags per article => more articles per tag => bigger deletes',c('one','del',{k:10}).writes>c('one','del',{k:5}).writes);
const d=M.attachDrill('two');chk('drill: two-sided has a bad intermediate state',d.some(s=>!s.ok)&&M.attachDrill('junction').every(s=>s.ok));
console.log(bad?bad+' failures':'many-to-many model: all properties hold'); process.exit(bad?1:0);
