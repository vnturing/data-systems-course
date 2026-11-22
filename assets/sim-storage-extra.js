/* Lessons 23–27. Pure, deterministic teaching models; no measured latency claims.
   See experiments/storage/ for independent MySQL, Redis and Parquet cross-checks. */
(function(){
  'use strict';
  // Enumerates records in a forced index's contiguous search range. Not a page/cache simulation.
  function indexes(kind,day,icp){
    var entries=0,lookups=0,matches=0,sum=0,sample=[];
    for(var n=0;n<100000;n++){
      var r={id:n+1,tenant:Math.floor(n/1000),status:Math.floor(n/100)%5===0?'paid':'open',day:n%100,amount:100+n%997};
      var candidate=kind==='scan'||(r.tenant===42&&(kind==='tenant'||
        (kind==='rangeFirst'?(r.day>day||(r.day===day&&r.status>='paid')):r.status==='paid'&&r.day>=day)));
      if(!candidate)continue;
      entries++;
      var match=r.tenant===42&&r.status==='paid'&&r.day>=day;
      // ICP can reject status from rangeFirst before fetching the clustered record.
      if(kind!=='covering'&&!(kind==='rangeFirst'&&icp&&!match))lookups++;
      if(match){matches++;sum+=r.amount;}
      if(sample.length<6)sample.push(r);
    }
    return {entries:entries,lookups:lookups,matches:matches,sum:sum,sample:sample};
  }
  var WRITES=[100,300,800,1200,1700,2200];
  function persistence(policy,crash,scope){
    var acknowledged=WRITES.filter(function(t){return t<=crash;}).length;
    var lastSync=Math.floor(crash/1000)*1000;
    var durable=WRITES.filter(function(t){return t<=lastSync;}).length;
    var recovered=0;
    if(policy==='always')recovered=acknowledged;
    if(policy==='everysec')recovered=scope==='process'?acknowledged:durable;
    if(policy==='no')recovered=scope==='process'?acknowledged:0;
    if(policy==='rdb')recovered=durable; // Completed, durable snapshot at each whole second.
    return {acknowledged:acknowledged,recovered:recovered,lost:acknowledged-recovered,lastSync:lastSync,
      events:WRITES.map(function(t,i){return {time:t,value:i+1,acknowledged:t<=crash,recovered:i<recovered};})};
  }
  // One non-preemptive FIFO resource, checkout every 5 ms, 1 ms service, 10 seconds.
  // Reports arrive 1 ms BEFORE each next checkout, every 1000 ms; no CPU/I/O parallelism modeled.
  function workload(reportMs,separate){
    var events=[],end=0,reportEnd=0,latencies=[];
    for(var t=0;t<10000;t+=5)events.push({t:t,kind:'checkout',service:1});
    for(var s=999;s<10000;s+=1000)if(reportMs>0)events.push({t:s,kind:'report',service:reportMs});
    events.sort(function(a,b){return a.t-b.t;});
    events.forEach(function(e){
      if(separate&&e.kind==='report'){reportEnd=Math.max(reportEnd,e.t)+e.service;return;}
      end=Math.max(end,e.t)+e.service;
      if(e.kind==='checkout')latencies.push(end-e.t);
    });
    latencies.sort(function(a,b){return a-b;});
    return {p99:latencies[Math.floor(.99*latencies.length)],max:latencies[latencies.length-1],
      misses:latencies.filter(function(v){return v>50;}).length,total:latencies.length,
      busyMs:2000+Math.floor(10000/1000)*reportMs};
  }
  function columns(rows,projected,sorted,batch){
    // 12 fixed-width 8-byte fields, 100 rows/group, 100 groups; last 5% qualify.
    var total=12*rows*8,selected=projected*rows*8,groups=Math.ceil(rows/100);
    var kept=sorted?Math.ceil(groups*.05):groups;
    return {rowBytes:total,columnBytes:selected,prunedBytes:kept*100*projected*8,
      groups:groups,kept:kept,tupleCalls:rows,batchCalls:Math.ceil(rows/batch)};
  }
  function encodings(sorted){
    var values=Array.from({length:1000},function(_,i){return sorted?Math.floor(i/250):i%4;});
    var runs=0,prev;values.forEach(function(v){if(v!==prev){runs++;prev=v;}});
    // Defined teaching encodings, not Parquet: plain int32; 4 int32 dictionary entries + 2-bit IDs;
    // RLE stores one 1-byte ID and one 4-byte count per run, plus that dictionary.
    return {plain:4000,dictionary:16+Math.ceil(values.length*2/8),rle:16+5*runs,runs:runs};
  }
  var CHANGES=[
    {id:'e1',order:1,before:null,after:{region:'EU',amount:100}},
    {id:'e2',order:2,before:null,after:{region:'EU',amount:300}},
    {id:'e3',order:3,before:null,after:{region:'US',amount:900}},
    {id:'e4',order:2,before:{region:'EU',amount:300},after:{region:'US',amount:500}},
    {id:'e5',order:1,before:{region:'EU',amount:100},after:null}
  ];
  function summarize(facts){
    var out={};Object.keys(facts).forEach(function(k){var f=facts[k],a=out[f.region]||(out[f.region]={sum:0,count:0});a.sum+=f.amount;a.count++;});return out;
  }
  function materialize(delivered,dedupe,checkpointAtomic){
    var facts={},truth={},view={},seen={},applied=0;
    CHANGES.forEach(function(e){if(e.after)truth[e.order]=e.after;else delete truth[e.order];});
    function delta(v,sign){if(!v)return;var a=view[v.region]||(view[v.region]={sum:0,count:0});a.sum+=sign*v.amount;a.count+=sign;}
    delivered.forEach(function(i){var e=CHANGES[i];if(dedupe&&seen[e.id])return;
      delta(e.before,-1);delta(e.after,1);applied++;
      if(e.after)facts[e.order]=e.after;else delete facts[e.order];
      // In the broken variant, inject one crash after e4's delta but before its marker.
      if(dedupe&&(checkpointAtomic||e.id!=='e4'))seen[e.id]=true;
    });
    Object.keys(view).forEach(function(k){if(view[k].count===0&&view[k].sum===0)delete view[k];});
    return {view:view,truth:summarize(truth),current:summarize(facts),applied:applied,
      correct:JSON.stringify(view)===JSON.stringify(summarize(truth))};
  }
  // count/sum roll up; averaging per-group averages would weight groups equally.
  function rollup(groups){var sum=0,count=0;groups.forEach(function(g){sum+=g.sum;count+=g.count;});return {sum:sum,count:count,average:count?sum/count:null};}
  window.StorageExtra={indexes:indexes,persistence:persistence,WRITES:WRITES,workload:workload,
    columns:columns,encodings:encodings,CHANGES:CHANGES,materialize:materialize,rollup:rollup};
})();
