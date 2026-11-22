global.window={}; global.document={addEventListener(){}};
require('../assets/sim-wal.js'); const W=window.WalSim; let bad=0;
function chk(n,c){if(!c){bad++;console.log('FAIL',n);}}
const states=(o,m)=>W.drill(o,m).map(r=>r.state).join(',');
// sanity: the two endpoints are valid trees
chk('initial disk is a valid OLD tree',W.validate(W.initial()).state==='OLD');
const full=Object.assign(W.initial(),W.final());chk('final pages form a valid NEW tree',W.validate(full).state==='NEW');
// No log, child-first (new leaf, old leaf, parent)
chk('no log, child-first: corrupt after the second write and when pages are torn',
  states('childFirst','none')==='OLD,OLD,OLD,OLD,CORRUPT,CORRUPT,CORRUPT,NEW');
chk('no log, parent-first: corrupt from the first write onward until the last',
  states('parentFirst','none')==='OLD,OLD,CORRUPT,CORRUPT,CORRUPT,CORRUPT,CORRUPT,NEW');
// Log only: every untorn crash recovers; every torn page is unrecoverable
for(const o of Object.keys(W.ORDERS)){
  chk('log only ('+o+'): never CORRUPT; torn pages are UNRECOVERABLE; others OLD/NEW',states(o,'wal')==='OLD,NEW,UNRECOVERABLE,NEW,UNRECOVERABLE,NEW,UNRECOVERABLE,NEW');
  chk('log + doublewrite ('+o+'): every crash point recovers to OLD or NEW',states(o,'wal+dwb')==='OLD,NEW,NEW,NEW,NEW,NEW,NEW,NEW');
}
// the log must make recovery independent of write order
chk('with a log, the write order does not matter',states('childFirst','wal+dwb')===states('parentFirst','wal+dwb'));
// recovery is idempotent: recovering already-complete pages changes nothing
const done=W.points().find(p=>p.id==='after3');chk('redo is idempotent on a fully written tree',W.run('childFirst','wal',done).state==='NEW');
// bad outcomes counts used by the lesson
const cnt=(o,m)=>W.drill(o,m).filter(r=>r.state==='CORRUPT'||r.state==='UNRECOVERABLE').length;
chk('bad outcomes: no log 3 (child-first) / 5 (parent-first), log only 3, log+doublewrite 0',cnt('childFirst','none')===3&&cnt('parentFirst','none')===5&&cnt('childFirst','wal')===3&&cnt('childFirst','wal+dwb')===0);
console.log(bad?bad+' failures':'wal drill: all properties hold'); process.exit(bad?1:0);
