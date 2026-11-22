// Bounded algebraic checks and failure witnesses, plus independent real MySQL observations.
const assert=require('node:assert/strict');const fs=require('node:fs');
global.window={};require('../assets/sim-replication.js');const S=window.ReplicationSim;
const M=require('../experiments/replication/results/mysql-results.json');
assert.equal(M.mysql_version,'8.4.13');
assert.equal(M.lag.before_apply_count,0);assert.equal(M.lag.wait_while_stopped,1);
assert.equal(M.lag.after_apply_count,1);assert.equal(M.lag.wait_after_apply,0);
assert.ok(M.lag.received_gtids&&M.lag.received_gtids===M.lag.source_gtids);
assert.equal(M.semisync.acknowledged_transactions_delta,1);assert.equal(M.semisync.replica_visible_rows_at_ack,0);assert.equal(M.semisync.source_status,'ON');
assert.equal(M.stale_promotion_and_split_brain.acknowledged_row_on_promoted_c,0);
assert.equal(M.stale_promotion_and_split_brain.same_row_on_b,1);
assert.equal(M.stale_promotion_and_split_brain.source_rows,'1\n2\n3\n4\n5');
assert.equal(M.stale_promotion_and_split_brain.promoted_c_rows,'1\n2\n3\n6');
const inventory=fs.readFileSync(__dirname+'/../experiments/replication/results/binlog-events.txt','utf8');
for(const kind of ['Gtid','Table_map','Write_rows','Xid'])assert.ok(inventory.includes(kind));
// Reply stage, durable receipt and visible apply must remain separate.
assert.equal(S.ack('async',true,true,false,1).remoteCopies,0);
const receipt=S.ack('semi',true,true,false,4);assert.equal(receipt.acked,true);assert.equal(receipt.nodes[1].durable,true);assert.equal(receipt.nodes[1].applied,false);
assert.equal(S.ack('semi',false,false,false,14).ackAt,null);
assert.equal(S.ack('semi',false,false,true,5).acked,true);
assert.equal(S.ack('semi',false,false,true,5).remoteCopies,0);
assert.equal(S.ack('sync',true,true,false,11).acked,false);
assert.equal(S.ack('sync',true,true,false,12).acked,true);
for(const node of ['B','C'])for(const fence of [false,true])for(const drain of [false,true]){
 const r=S.failover(node,fence,drain);assert.equal(r.splitBrain,!fence);assert.equal(r.old.includes(4),!fence);
 assert.deepEqual(r.missing,node==='B'&&drain?[]:[3]);
 if(r.missing.length)assert.deepEqual(r.recoverableElsewhere,[3]);
}
assert.equal(S.logReplay('statement',10,false,true).replicaAfter,100);
assert.equal(S.logReplay('row',10,false,true).replicaAfter,110);
assert.equal(S.logReplay('statement',0,true,false).replicaAfter,120);
assert.equal(S.logReplay('statement',0,true,true).replicaAfter,110);
for(const kind of ['ryw','mono']){assert.ok(S.lag(kind,'any').violation);assert.ok(!S.lag(kind,'sticky').violation);}
assert.ok(S.lag('prefix','sticky').violation);assert.ok(S.lag('prefix','barrier').blocked);
assert.equal(S.multi('same','lww',10).winner,'A');assert.equal(S.multi('same','lww',-10).winner,'B');
assert.deepEqual(JSON.parse(S.multi('different','field',0).result),{name:'Alice',city:'Mutare'});
// Enumerate all nonempty read/write set sizes up to N=7, checking the independent inequality.
let setPairs=0;
for(let n=1;n<=7;n++)for(let w=1;w<=n;w++)for(let r=1;r<=n;r++){
 const q=S.quorum(n,w,r);setPairs+=q.pairs;assert.equal(q.intersects,w+r>n);
 if(q.witness){assert.equal(q.witness.write.length,w);assert.equal(q.witness.read.length,r);assert.ok(q.witness.write.every(x=>!q.witness.read.includes(x)));}
}
assert.equal(S.quorumTrace('strict',false,false).read,1);
assert.equal(S.quorumTrace('sloppy',true,false).read,0);
assert.equal(S.quorumTrace('sloppy',true,true).read,1);
const partial=S.quorumTrace('partial',false,false);assert.equal(partial.acked,false);assert.equal(partial.firstRead,1);assert.equal(partial.read,0);
assert.equal(S.quorumTrace('partial',true,false).read,1);
// Vector order properties on the full 0..2 cube of three actors.
const clocks=[];for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++)clocks.push({A:a,B:b,C:c});
const le=(a,b)=>['before','equal'].includes(S.relation(a,b));
for(const a of clocks){assert.equal(S.relation(a,a),'equal');for(const b of clocks){
 assert.deepEqual(S.join(a,b),S.join(b,a));assert.ok(le(a,S.join(a,b))&&le(b,S.join(a,b)));
 if(S.relation(a,b)==='concurrent')assert.equal(S.relation(b,a),'concurrent');
 for(const c of clocks)if(le(a,b)&&le(b,c))assert.ok(le(a,c));
}}
assert.equal(S.vector('fork').survivors.length,2);assert.equal(S.vector('observed').survivors.length,1);
assert.equal(S.vector('resolved').survivors.length,1);assert.equal(S.vector('resolved').survivors[0].clock.C,1);
assert.equal(S.tombstone(false).result,null);assert.equal(S.tombstone(true).result,'old profile');
// PN-counter merge laws across bounded states, plus actual independent updates.
const states=[];for(let bits=0;bits<16;bits++)states.push({p:{A:bits&1,B:(bits>>1)&1},n:{A:(bits>>2)&1,B:(bits>>3)&1}});
for(const a of states){assert.deepEqual(S.counterMerge(a,a),a);for(const b of states){
 assert.deepEqual(S.counterMerge(a,b),S.counterMerge(b,a));
 for(const c of states)assert.deepEqual(S.counterMerge(S.counterMerge(a,b),c),S.counterMerge(a,S.counterMerge(b,c)));
}}
let a=S.counterUpdate(S.counter(),'A',3),b=S.counterUpdate(S.counter(),'B',2);a=S.counterUpdate(a,'A',-1);
const merged=S.counterMerge(a,b);assert.equal(S.counterValue(merged),4);assert.deepEqual(S.counterMerge(merged,b),merged);
const stock=S.counterUpdate(S.counter(),'S',1);
assert.equal(S.counterValue(S.counterMerge(S.counterUpdate(stock,'A',-1),S.counterUpdate(stock,'B',-1))),-1);
// Observed-remove merge laws and stale-state replay; unique tag meaning is fixed.
const os=[];for(let bits=0;bits<16;bits++){const adds={};if(bits&1)adds['A:1']='book';if(bits&2)adds['B:1']='book';os.push({adds,removed:[...(bits&4?['A:1']:[]),...(bits&8?['B:1']:[])]});}
for(const a of os){assert.deepEqual(S.setMerge(a,a),a);for(const b of os){
 assert.deepEqual(S.setMerge(a,b),S.setMerge(b,a));
 for(const c of os)assert.deepEqual(S.setMerge(S.setMerge(a,b),c),S.setMerge(a,S.setMerge(b,c)));
}}
assert.deepEqual(S.setDemo(true).value,['book']);assert.deepEqual(S.setDemo(false).value,[]);
const old={adds:{'A:1':'book'},removed:[]},deleted=S.observedRemove(old,'book');
assert.deepEqual(S.setValue(S.setMerge(deleted,old)),[]);
console.log(`replication: real MySQL boundaries, ${setPairs} quorum set pairs, causal order, counter/set merge laws and failure traces OK`);
