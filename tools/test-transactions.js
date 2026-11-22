// Independent engine observations, visibility boundaries and concurrency witnesses.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
global.window={};require('../assets/sim-transactions.js');const S=window.TransactionSim;
const root=path.join(__dirname,'..');
const M=require('../experiments/transactions/results/mysql-results.json');
const P=require('../experiments/transactions/results/postgres-results.json');
assert.match(M.version,/^8\.4\./);assert.match(P.version,/^18\./);
assert.equal(Object.keys(M.cases).length,17);assert.equal(Object.keys(P.cases).length,3);
const m=M.cases,p=P.cases;
assert.equal(m.rollback.value,100);
assert.deepEqual(m.dirty_ru,{during_uncommitted:900,after_rollback:100});
assert.deepEqual(m.dirty_rc,{during_uncommitted:100,after_rollback:100});
assert.equal(m.dirty_write.blocked_update_error,1205);
assert.deepEqual(m.repeat_rc.reads,[100,110]);assert.deepEqual(m.repeat_rr.reads,[100,100]);
assert.deepEqual(m.snapshot_boundary,{plain_reads:[110,110],locking_read:120});
assert.equal(m.lost_update.value,110);assert.deepEqual(m.lost_update.reads,[100,100]);
assert.equal(m.atomic_increment.value,120);assert.deepEqual(m.atomic_increment.affected,[1,1]);
assert.equal(m.compare_and_set.value,110);assert.deepEqual(m.compare_and_set.affected,[1,0]);
assert.deepEqual(m.locking_increment,{reads:[100,110],value:120});
assert.deepEqual(m.write_skew,{counts:[2,2],remaining:0});
assert.deepEqual(m.guard_row,{counts:[2,1],remaining:1});
assert.deepEqual(m.phantom_rc.counts,[2,3]);assert.deepEqual(m.phantom_rr.counts,[2,2]);
assert.equal(m.range_lock.insert_error,1205);assert.equal(m.deadlock.error,1213);
assert.ok(['A','B'].includes(m.deadlock.victim));
assert.deepEqual(p.stale_replacement_rr,{reads:[100,100],update_error:'40001',value:110});
assert.deepEqual(p.write_skew_rr,{counts:[2,2],remaining:0,commit_error:null});
assert.deepEqual(p.write_skew_ssi,{counts:[2,2],remaining:1,commit_error:'40001'});
for(const engine of ['mysql','postgres']){
 const trace=require('../experiments/transactions/results/'+engine+'-transcript.json');
 assert.ok(trace.some(r=>r.session==='A'));assert.ok(trace.some(r=>r.session==='B'));
 const submitted=new Map(),completed=new Set(),pending=new Map();
 for(const event of trace){
  assert.equal(typeof event.command_id,'string');
  if(event.event==='submit'){
   assert.equal(typeof event.sql,'string');assert.ok(!submitted.has(event.command_id));
   assert.ok(!pending.has(event.session),'a session cannot reuse a pending connection');
   submitted.set(event.command_id,event);pending.set(event.session,event.command_id);
  }else{
   assert.equal(event.event,'complete');assert.ok(Array.isArray(event.output));
   assert.ok(!completed.has(event.command_id));
   assert.equal(pending.get(event.session),event.command_id);
   assert.equal(submitted.get(event.command_id).session,event.session);
   completed.add(event.command_id);pending.delete(event.session);
  }
 }
 assert.equal(completed.size,submitted.size);assert.equal(pending.size,0);
 const errors=trace.filter(r=>r.event==='complete').flatMap(r=>r.output).filter(r=>r.startsWith('ERROR'));
 if(engine==='mysql'){
  assert.equal(errors.filter(r=>r.includes('1205')).length,2);
  assert.equal(errors.filter(r=>r.includes('1213')).length,1);
  assert.equal(errors.length,3);
  const first=trace.findIndex(r=>r.event==='submit'&&r.session==='A'&&r.sql==='SELECT id FROM doctors WHERE id=2 FOR UPDATE;');
  const other=trace.findIndex(r=>r.event==='submit'&&r.session==='B'&&r.sql==='SELECT id FROM doctors WHERE id=1 FOR UPDATE;');
  const done=trace.findIndex(r=>r.event==='complete'&&r.command_id===trace[first].command_id);
  assert.ok(first>=0&&first<other&&other<done,'the second request must start while the first is pending');
  assert.ok(trace.slice(first,other).some(r=>r.session==='wait-observer'&&r.event==='complete'&&r.output[0]==='1'));
 }else{
  assert.equal(errors.filter(r=>r.includes('40001')).length,2);
  assert.equal(errors.length,2);
 }
}
// Recovery obligations are independent: grouping, persistence, reply and escaped effect.
for(const tx of [false,true])for(const phase of [0,1,2,3,4])for(const durable of [false,true])for(const external of [false,true]){
 const r=S.transfer(tx,phase,durable,external);
 if(tx)assert.equal(r.total,200);
 assert.equal(r.acknowledged,phase>=4);
 assert.equal(r.externalEffect,external&&phase>=1);
 if(!durable)assert.deepEqual(r.balances,[100,100]);
 if(tx&&phase<3)assert.deepEqual(r.balances,[100,100]);
}
assert.deepEqual(S.transfer(false,1,true,false).balances,[70,100]);
assert.deepEqual(S.transfer(true,3,true,false).balances,[70,130]);
assert.equal(S.transfer(true,3,true,false).acknowledged,false);
for(const phase of [3,4]){
 const r=S.transfer(true,phase,false,false);
 assert.match(r.why,/only in volatile host memory/);
 assert.doesNotMatch(r.why,/acknowledged|reply/);
 assert.equal(r.acknowledged,phase===4);
}
assert.deepEqual(S.reads('ru').values,[900,100,110]);
assert.deepEqual(S.reads('rc').values,[100,100,110]);
assert.deepEqual(S.reads('rr').values,[100,100,100]);
// Compare chain traversal with an independent direct visibility filter over histories.
let visibilityChecks=0;
for(let size=1;size<=6;size++)for(let own=-1;own<size;own++)for(let boundary=0;boundary<=size+1;boundary++){
 const vs=Array.from({length:size},(_,i)=>({tx:'t'+i,value:100+i,commit:i%3===0?null:i+1}));
 const eligible=vs.filter(v=>v.tx==='t'+own||(v.commit!==null&&v.commit<=boundary));
 const expected=eligible.length?eligible[eligible.length-1]:null;
 const actual=S.visible(vs,boundary,'t'+own);
 assert.equal(actual.value,expected?expected.value:null);
 assert.equal(actual.tx,expected?expected.tx:null);visibilityChecks++;
}
assert.equal(S.mvcc(2,false).value,100);assert.equal(S.mvcc(3,false).value,110);
assert.equal(S.mvcc(4,false).value,120);assert.equal(S.mvcc(2,true).value,130);
for(const start of [-100,0,100])for(const delta of [1,10,25]){
 for(const method of ['atomic','lock','cas','si']){
  const r=S.lostUpdate(method,start,delta);assert.equal(r.balance,start+2*delta);assert.equal(r.safe,true);
 }
 assert.equal(S.lostUpdate('blind',start,delta).balance,start+delta);
}
// Enumerate every two-client read/write interleaving without sharing the model's trace.
function interleave(a,b,prefix=[]){if(!a.length)return [prefix.concat(b)];if(!b.length)return [prefix.concat(a)];return interleave(a.slice(1),b,prefix.concat(a[0])).concat(interleave(a,b.slice(1),prefix.concat(b[0])));}
const schedules=interleave(['Ar','Aw'],['Br','Bw']);let lost=0;
for(const events of schedules){let v=100;const reads={};for(const e of events){if(e[1]==='r')reads[e[0]]=v;else v=reads[e[0]]+10;}if(v===110)lost++;else assert.equal(v,120);}
assert.equal(schedules.length,6);assert.equal(lost,4);
for(const policy of ['snapshot','ownlock'])assert.equal(S.skew(policy).remaining,0);
for(const policy of ['guard','serial','ssi'])assert.equal(S.skew(policy).remaining,1);
assert.equal(S.skew('ssi').aborts,1);
// Enumerate valid serial roster decisions independently: neither can yield zero.
for(const order of [[0,1],[1,0]]){const doctors=[1,1];for(const d of order)if(doctors[0]+doctors[1]>1)doctors[d]=0;assert.equal(doctors[0]+doctors[1],1);}
assert.equal(S.phantom('snapshot').after,0);assert.equal(S.phantom('snapshot').insertCommitted,true);
assert.equal(S.phantom('snapshot').admitted,2);assert.equal(S.phantom('unique').admitted,1);
assert.equal(S.phantom('range').insertCommitted,false);
assert.equal(S.phantom('range-rc').insertCommitted,true);
assert.equal(S.phantom('range-rc').after,1);
assert.equal(S.phantom('range-rc').admitted,2);
assert.match(S.phantom('range').why,/REPEATABLE READ gap-locking/);
assert.equal(S.locks('opposite',false).deadlock,true);assert.equal(S.locks('same',true).deadlock,false);
assert.equal(S.serial('snapshot').safe,false);assert.equal(S.serial('ssi').safe,true);assert.equal(S.serial('serial').safe,true);
assert.equal(S.recommendation('roster','snapshot').fits,false);
assert.equal(S.recommendation('roster','guard').fits,true);
assert.equal(S.recommendation('report','snapshot').fits,true);
assert.equal(S.recommendation('slot','unique').fits,true);
// Publication integration: new lessons expose the evidence, model, quiz and navigation.
const lessons=fs.readdirSync(path.join(root,'lessons')).filter(f=>/^00(4[7-9]|5[0-5])-/.test(f));
assert.equal(lessons.length,9);
for(const lesson of lessons){
 const html=fs.readFileSync(path.join(root,'lessons',lesson),'utf8');
 for(const asset of ['sim-transactions.js','ui-transactions.js','quiz.js'])assert.ok(html.includes(asset));
 assert.match(html,/<noscript>/);assert.match(html,/module-7-checklist\.html/);
 const quiz=JSON.parse(html.match(/id="quiz-data">([\s\S]*?)<\/script>/)[1]);assert.equal(quiz.length,4);
 for(const q of quiz){assert.equal(q.options.length,4);assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4);assert.ok(q.why);}
 if(lesson.startsWith('0054')){
  const embedded=JSON.parse(html.match(/id="transaction-observations">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(embedded,{mysql:M,postgres:P});
 }
 for(const match of html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)){
  if(/^(https?:|mailto:)/.test(match[1]))continue;
  assert.ok(fs.existsSync(path.resolve(root,'lessons',match[1])),lesson+': missing '+match[1]);
 }
}
console.log(`transactions: 20 real schedules, ${visibilityChecks} visibility checks, all 6 read/write interleavings, recovery/admission/locking invariants and nine lessons OK`);
