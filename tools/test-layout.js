global.window={}; global.document={addEventListener(){}};
require('../assets/sim-layout.js'); const L=window.LayoutSim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const c=(l,op,o)=>L.cost(l,op,o);
// --- calibration against MySQL 8.0.46 handler counts (20,000 employees, 4 positions, 2 educations, 200 companies => 400 people per company)
chk('people per company = 400',L.C(L.DEF)===400);
chk('relational profile: 13 reads in 3 round trips (measured 1+9+3)',c('rel','profile').reads===13&&c('rel','profile').trips===3);
chk('document profile: 1 read in 1 round trip (measured 1)',c('embed','profile').reads===1&&c('embed','profile').trips===1);
chk('document size model reproduces the measured ~390 bytes',L.docBytes(L.DEF)===390);
chk('relational reverse lookup: 801 reads (measured)',c('rel','reverse').reads===801);
chk('document reverse lookup with multi-valued index: 401 reads (measured)',c('embed','reverse').reads===401);
chk('document reverse lookup without index: 20,003 reads (measured)',c('embed','reverse',{reverseIndex:false}).reads===20003);
chk('rename: relational writes 1 row (measured), embedded document rewrites 400 documents (measured)',c('rel','rename').writes===1&&c('embed','rename').writes===400);
chk('referenced companies: rename writes 1, profile needs 2 round trips',c('ref','rename').writes===1&&c('ref','profile').trips===2);
// --- structural properties
chk('summary: both read one item, but the document reads the whole thing',c('rel','summary').bytes<c('embed','summary').bytes/5);
chk('embedded rename can be torn only if the engine lacks multi-document atomic commit',c('embed','rename',{multiDocTxn:false}).torn===399&&c('embed','rename',{multiDocTxn:true}).torn===0);
chk('relational and referenced layouts never tear on rename',c('rel','rename',{multiDocTxn:false}).torn===0&&c('ref','rename',{multiDocTxn:false}).torn===0);
chk('rename cost for embedded scales with people per company',c('embed','rename',{M:100}).writes===2*c('embed','rename',{M:200}).writes);
chk('more positions per person => bigger relational profile and bigger documents',c('rel','profile',{P:8}).reads>c('rel','profile',{P:4}).reads&&L.docBytes({P:8,E:2})>L.docBytes({P:4,E:2}));
// --- workbook: a read-heavy profile workload favors the document layout; a rename-heavy one does not
const W1=L.workbook({profile:100000,summary:0,rename:0,reverse:0,append:0},{});
chk('profile-only workload: embedded document has the fewest reads and round trips',W1.embed.reads<W1.rel.reads&&W1.embed.trips<W1.rel.trips);
const W2=L.workbook({profile:10,summary:0,rename:100,reverse:0,append:0},{});
chk('rename-heavy workload: embedding is worse on writes than relational',W2.embed.writes>W2.rel.writes*100);
chk('workbook flags torn-state risk only when the engine lacks multi-document commit',L.workbook({rename:1},{multiDocTxn:false}).embed.torn===1&&L.workbook({rename:1},{multiDocTxn:true}).embed.torn===0);
console.log(bad?bad+' failures':'layout model: all properties hold'); process.exit(bad?1:0);
