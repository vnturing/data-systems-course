// Mechanism and failure invariants, cross-checked against independently executed engines.
const assert=require('node:assert/strict');
const fs=require('node:fs');
global.window={};
require('../assets/sim-storage-extra.js');
const S=window.StorageExtra;
const path=__dirname+'/../experiments/storage/results/';
const plans=fs.readFileSync(path+'indexes-mysql84.txt','utf8');
for(const n of [1000,92,20])assert.ok(plans.includes('rows='+n+' loops=1'),`real MySQL plan has ${n} access rows`);
assert.ok(plans.includes('11410')&&plans.includes('Covering index range scan'));
for(const [kind,n,fetch] of [['scan',100000,100000],['tenant',1000,1000],['rangeFirst',92,92],['good',20,20],['covering',20,0]]){
  const r=S.indexes(kind,90,false);
  assert.equal(r.entries,n);assert.equal(r.lookups,fetch);assert.equal(r.matches,20);assert.equal(r.sum,11410);
}
assert.equal(S.indexes('rangeFirst',90,true).entries,92);
assert.equal(S.indexes('rangeFirst',90,true).lookups,20);
// Every access path and pushdown setting must preserve the SQL result, including boundaries.
for(const day of [0,1,50,90,99]){
  const truth=S.indexes('scan',day,false);
  for(const kind of ['tenant','rangeFirst','good','covering'])for(const icp of [false,true]){
    const r=S.indexes(kind,day,icp);assert.equal(r.sum,truth.sum);assert.equal(r.matches,truth.matches);
    assert.ok(r.lookups<=r.entries);assert.ok(r.matches<=r.entries);
  }
}
for(let crash=50;crash<=2450;crash+=50){
  for(const scope of ['process','host'])for(const policy of ['none','rdb','everysec','always','no']){
    const r=S.persistence(policy,crash,scope);
    assert.ok(r.recovered>=0&&r.recovered<=r.acknowledged);
    if(policy==='always')assert.equal(r.lost,0);
    if(policy==='none')assert.equal(r.recovered,0);
  }
  assert.ok(S.persistence('everysec',crash,'process').recovered>=S.persistence('everysec',crash,'host').recovered);
}
assert.equal(S.persistence('everysec',1950,'host').recovered,3);
assert.equal(S.persistence('everysec',1950,'process').recovered,5);
assert.equal(S.persistence('rdb',1950,'process').recovered,3);
assert.equal(S.persistence('everysec',2000,'host').recovered,5);
const redis=JSON.parse(fs.readFileSync(path+'redis-persistence.json'));
assert.equal(redis.aof_everysec_after_restart,'acknowledged');
assert.equal(redis.rdb_after_restart,'snapshot-value');
assert.equal(S.workload(0,false).max,1);
assert.ok(S.workload(200,false).p99>50);
assert.equal(S.workload(200,true).max,1);
assert.ok(S.workload(1200,false).max>S.workload(200,false).max);
const col=S.columns(10000,2,true,2048);
assert.equal(col.rowBytes,960000);assert.equal(col.columnBytes,160000);assert.equal(col.prunedBytes,8000);assert.equal(col.batchCalls,5);
assert.equal(S.columns(10000,2,false,1).prunedBytes,160000);
assert.equal(S.columns(10000,12,false,1).columnBytes,960000);
assert.equal(S.encodings(true).runs,4);assert.equal(S.encodings(false).runs,1000);
assert.ok(S.encodings(true).rle<S.encodings(true).dictionary);
assert.ok(S.encodings(false).rle>S.encodings(false).plain);
const real=JSON.parse(fs.readFileSync(path+'analytics.json'));
assert.equal(real.layouts.sorted.sum,5982595);assert.equal(real.layouts.sorted.sum,real.layouts.shuffled.sum);
assert.equal(real.layouts.sorted.eligible_row_groups,1);assert.equal(real.layouts.shuffled.eligible_row_groups,20);
assert.ok(real.encoding.sorted.dictionary<real.encoding.shuffled.dictionary);
assert.equal(real.rollup.length,5);assert.equal(real.cube_rows,7);
assert.ok(S.materialize([0,1,2,3,4],false,true).correct);
assert.ok(!S.materialize([0,1,2,3,3,4],false,true).correct);
assert.ok(S.materialize([0,1,2,3,3,4],true,true).correct);
assert.ok(!S.materialize([0,1,2,3,3,4],true,false).correct);
assert.ok(!S.materialize([0,1,2],true,true).correct);
// Any number of adjacent replays must be harmless with atomic dedupe.
for(let n=1;n<=10;n++)assert.ok(S.materialize([0,1,2,3,4].flatMap(i=>Array(n).fill(i)),true,true).correct);
const totals=S.rollup([{sum:400,count:2},{sum:900,count:1}]);
assert.equal(totals.sum,1300);assert.equal(totals.count,3);assert.equal(totals.average,1300/3);
assert.notEqual(totals.average,(200+900)/2);
console.log('storage extension: index paths, persistence boundaries, contention, columns and view maintenance OK');
