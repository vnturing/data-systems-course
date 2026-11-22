// Real engine observations plus exact placement, routing and workload invariants.
const assert=require('node:assert/strict');const fs=require('node:fs');
global.window={};require('../assets/sim-partitioning.js');const S=window.PartitionSim;
const M=require('../experiments/partitioning/results/mysql-results.json');
const R=require('../experiments/partitioning/results/redis-results.json');
assert.equal(M.mysql_version,'8.4.13');assert.equal(R.redis_version,'7.4.12');
assert.deepEqual(M.queries.day_range.partitions,['p2']);assert.equal(M.queries.day_range.count,25000);
assert.equal(M.queries.id_lookup.partitions.length,4);assert.equal(M.queries.id_lookup.count,1);
assert.equal(M.queries.status_only.count,10000);assert.equal(M.queries.status_only.partitions.length,4);
assert.deepEqual(M.queries.status_and_day.partitions,['p2']);assert.equal(M.queries.status_and_day.count,2500);
assert.equal(M.unique_id_without_partition_key_error,1503);
for(const [name,q] of Object.entries(M.queries)){
 const plan=JSON.parse(fs.readFileSync(__dirname+'/../experiments/partitioning/results/'+name+'-plan.json'));
 assert.deepEqual(plan.query_block.table.partitions,q.partitions);
}
assert.equal(S.crc16('123456789'),0x31c3);
for(const [key,slot] of Object.entries(R.key_slots))assert.equal(S.redisSlot(key),slot,key);
assert.equal(S.redisSlot('orders:{42}:a'),S.redisSlot('orders:{42}:b'));
assert.notEqual(S.redisSlot('orders:{42}:a'),S.redisSlot('orders:{99}:a'));
for(const kind of ['moved_wrong_node','target_without_asking','moved_after_cutover'])assert.equal(R[kind].kind,'MOVED');
assert.equal(R.ask_during_move.kind,'ASK');assert.deepEqual(R.asking_then_get,['OK','value-before-move']);
assert.equal(R.value_after_cutover,'value-before-move');assert.match(R.crossslot_error,/^CROSSSLOT/);
const sum=a=>a.reduce((x,y)=>x+y,0);
for(const n of [1,2,3,4,7])for(const layout of ['range','hash']){
 for(const [lo,hi] of [[0,0],[0,9999],[2499,2500],[5000,7499],[9999,9999]]){
  const r=S.partition(layout,n,'uniform',lo,hi);assert.equal(sum(r.rows),10000);assert.equal(sum(r.load),10000);
  assert.equal(r.matches,hi-lo+1);
  for(let k=lo;k<=hi;k++)assert.ok(r.targets.includes(S.owner(layout,k,n,10000)));
 }
 assert.equal(sum(S.partition(layout,n,'tail',0,9999).load),10000);
 assert.equal(sum(S.partition(layout,n,'one',0,9999).load),20000);
}
assert.deepEqual(S.partition('range',4,'uniform',5000,7499).targets,[2]);
assert.equal(S.partition('hash',4,'uniform',5000,7499).targets.length,4);
assert.equal(S.partition('range',4,'tail',0,9999).maxLoad,10000);
for(const n of [2,4,8])for(const salts of [1,4,16,31])for(const kind of ['append','read','conditional'])for(const hit of [0,50,95]){
 const r=S.hot(n,salts,kind,hit);assert.equal(sum(r.load),r.total);
 assert.equal(r.buckets,kind==='append'?salts:1);
 if(kind!=='read')assert.equal(r.hot,10000);
 if(kind==='conditional')assert.equal(r.peak,10000+Math.ceil(4000/n));
}
assert.ok(S.hot(4,16,'append',0).peak<S.hot(4,1,'append',0).peak);
assert.ok(S.hot(4,16,'read',90).peak<S.hot(4,16,'read',0).peak);
for(const term of ['open','paid']){
 const local=S.indexes('local',term,false,false,true);assert.deepEqual(local.missing,[]);assert.deepEqual(local.extra,[]);assert.equal(local.indexPartitions.length,4);
 const fresh=S.indexes('global',term,true,false,true);assert.equal(fresh.results,local.results);assert.equal(fresh.indexPartitions.length,1);assert.equal(fresh.basePartitions.length,0);
 const fetch=S.indexes('global',term,true,false,false);assert.equal(fetch.basePartitions.length,4);
}
assert.deepEqual(S.indexes('global','paid',false,true,true).missing,[42]);
assert.deepEqual(S.indexes('global','open',false,false,true).extra,[42]);
assert.deepEqual(S.indexes('global','open',false,true,true).extra,[]);
const mod=S.placement('modulo',64),slots=S.placement('slots',64),ring=S.placement('ring',64);
assert.equal(mod.moved,7480);assert.equal(slots.moved,2504);assert.equal(ring.moved,2083);
assert.ok(mod.betweenOld>0);assert.equal(slots.betweenOld,0);
for(const v of [1,2,8,64,128]){
 const q=S.placement('ring',v);assert.equal(q.betweenOld,0);assert.equal(q.moved,q.after[3]);assert.equal(sum(q.after),10000);assert.equal(sum(q.before),10000);
}
for(const r of [mod,slots,ring])assert.equal(sum(r.after),r.total);
for(const capture of [false,true])for(const fence of [false,true]){
 const r=S.migration('cutover',capture,fence);assert.equal(r.caughtUp,capture);assert.equal(r.resurrected,!capture);assert.equal(r.dual,!fence);
}
assert.equal(S.routing('stable','ignore').ok,true);
assert.equal(S.routing('moving','ignore').ok,false);assert.equal(S.routing('moving','noasking').ok,false);
assert.equal(S.routing('moving','correct').ok,true);assert.equal(S.routing('moving','correct').cache,'A');
assert.equal(S.routing('done','correct').ok,true);assert.equal(S.routing('done','correct').cache,'B');
assert.equal(S.routing('done','ignore').ok,false);
console.log(`partitioning: ${Object.keys(R.key_slots).length} real Redis slots, MySQL plans, load conservation, index lag, remapping and cutover/routing invariants OK`);
