/* Module 6 pure models. FNV + avalanche is a teaching placement hash, not Redis's hash.
   CRC16/Redis hash tags below are cross-checked against real CLUSTER KEYSLOT results. */
(function(){
  'use strict';
  function bytes(s){return new TextEncoder().encode(s);}
  function hash(s){var a=bytes(s),h=2166136261;for(var i=0;i<a.length;i++)h=Math.imul(h^a[i],16777619);h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);return (h^(h>>>16))>>>0;}
  function crc16(s){var a=bytes(s),crc=0;for(var i=0;i<a.length;i++){crc^=a[i]<<8;for(var j=0;j<8;j++)crc=((crc<<1)^((crc&32768)?0x1021:0))&65535;}return crc;}
  function redisSlot(key){var a=key.indexOf('{'),b=a>=0?key.indexOf('}',a+1):-1;var value=a>=0&&b>a+1?key.slice(a+1,b):key;return crc16(value)%16384;}
  function owner(layout,key,n,total){return layout==='range'?Math.min(n-1,Math.floor(key*n/total)):hash('id:'+key)%n;}
  function partition(layout,n,workload,lo,hi){
    var total=10000,rows=Array(n).fill(0),load=Array(n).fill(0),matches=0;
    for(var k=0;k<total;k++){var p=owner(layout,k,n,total);rows[p]++;
      load[p]+=workload==='tail'?(k>=9000?10:0):workload==='one'?1+(k===9999?10000:0):1;
      if(k>=lo&&k<=hi)matches++;
    }
    var targets=[];
    if(layout==='hash'&&lo!==hi)targets=Array.from({length:n},function(_,i){return i;});
    else for(var i=0;i<n;i++)if(layout==='hash'?i===owner(layout,lo,n,total):Math.ceil((i+1)*total/n)>lo&&Math.ceil(i*total/n)<=hi)targets.push(i);
    return {rows:rows,load:load,targets:targets,matches:matches,maxLoad:Math.max.apply(null,load),
      bounds:Array.from({length:n},function(_,i){return [Math.ceil(i*total/n),Math.ceil((i+1)*total/n)];})};
  }
  function hot(n,salts,kind,cacheHit){
    var buckets=kind==='append'?salts:1,load=Array(n).fill(0),hotCount=kind==='read'?Math.round(10000*(1-cacheHit/100)):10000;
    for(var i=0;i<4000;i++)load[i%n]++;
    for(var j=0;j<buckets;j++)load[hash('tenant:42:bucket:'+j)%n]+=Math.floor(hotCount/buckets)+(j<hotCount%buckets?1:0);
    return {load:load,hot:hotCount,buckets:buckets,queryBuckets:buckets,total:4000+hotCount,
      peak:Math.max.apply(null,load),capacity:6000,split:kind==='append'&&salts>1};
  }
  function indexes(layout,term,caughtUp,revalidate,covering){
    var n=4,posts=[],truth=[],baseTargets=new Set(),changed=42;
    for(var id=0;id<10000;id++){
      var old=id%10===0?'paid':'open',current=id===changed?'paid':old;
      if(current===term)truth.push(id);
      var indexed=layout==='local'||caughtUp?current:old;
      if(indexed===term&&(!revalidate||current===term))posts.push(id);
    }
    posts.forEach(function(id){baseTargets.add(owner('range',id,n,10000));});
    var truthSet=new Set(truth),postSet=new Set(posts);
    var missing=truth.filter(function(id){return !postSet.has(id);}),extra=posts.filter(function(id){return !truthSet.has(id);});
    return {indexPartitions:layout==='local'?[0,1,2,3]:[hash('status:'+term)%n],
      basePartitions:covering&&!revalidate?[]:Array.from(baseTargets).sort(),results:posts.length,truth:truth.length,
      missing:missing,extra:extra,changed:changed};
  }
  function tokens(n,vnodes){var ts=[];for(var i=0;i<n;i++)for(var v=0;v<vnodes;v++)ts.push({at:hash('node:'+i+':v'+v),node:i});return ts.sort(function(a,b){return a.at-b.at||a.node-b.node;});}
  function ringOwner(h,ts){var lo=0,hi=ts.length;while(lo<hi){var m=(lo+hi)>>>1;if(ts[m].at<h)lo=m+1;else hi=m;}return ts[lo===ts.length?0:lo].node;}
  function placement(method,vnodes){
    var before=Array(3).fill(0),after=Array(4).fill(0),moves=0,betweenOld=0,movedIds=[],oldRing=method==='ring'?tokens(3,vnodes):[],newRing=method==='ring'?tokens(4,vnodes):[];
    for(var key=0;key<10000;key++){
      var h=hash('id:'+key),a,b;
      if(method==='modulo'){a=h%3;b=h%4;}
      else if(method==='ring'){a=ringOwner(h,oldRing);b=ringOwner(h,newRing);}
      else{var slot=h%256;a=slot%3;b=slot%4===0?3:a;}
      before[a]++;after[b]++;if(a!==b){moves++;movedIds.push(key);if(b!==3)betweenOld++;}
    }
    return {before:before,after:after,moved:moves,movedIds:movedIds,betweenOld:betweenOld,total:10000};
  }
  function migration(stage,capture,fence){
    var source={item:'v1',removed:'present'},target={},events=[];
    if(stage!=='initial'){
      target={item:'v1',removed:'present'};source={item:'v2'};events.push('Snapshot copied, then source acknowledged an update and a deletion.');
    }
    if((stage==='catchup'||stage==='cutover')&&capture){target={item:'v2'};events.push('The drill assumes complete ordered replay through the chosen boundary.');}
    var ready=stage==='cutover',preCutover=JSON.stringify(target)===JSON.stringify(source),dual=false;
    if(ready){target.item='new-B';if(!fence){source.item='late-A';dual=true;}}
    return {source:source,target:target,active:ready?'B':'A',caughtUp:preCutover,dual:dual,
      resurrected:ready&&Object.prototype.hasOwnProperty.call(target,'removed'),events:events};
  }
  function routing(stage,policy){
    var trace=[],cache='A',ok=false;
    if(stage==='stable'){trace.push(['GET A','value']);ok=true;}
    else if(stage==='moving'){
      trace.push(['GET A','ASK B for this moved key']);
      if(policy==='correct'){trace.push(['ASKING then GET B, same connection','value']);ok=true;}
      else if(policy==='noasking')trace.push(['GET B without ASKING','MOVED A: importing node is not yet owner']);
    }else{
      trace.push(['GET A','MOVED B: ownership changed']);
      if(policy!=='ignore'){cache='B';trace.push(['refresh owner map; GET B','value']);ok=true;}
    }
    return {trace:trace,cache:cache,ok:ok,authoritative:stage==='done'?'B':'A',
      why:stage==='moving'?'ASK is a one-request exception; the cached owner remains A until ownership changes.':
        stage==='done'?'MOVED is evidence to update or refresh the slot-to-node map; maps can change again.':'The cached route and current owner agree.'};
  }
  window.PartitionSim={hash:hash,crc16:crc16,redisSlot:redisSlot,owner:owner,partition:partition,hot:hot,indexes:indexes,
    tokens:tokens,ringOwner:ringOwner,placement:placement,migration:migration,routing:routing};
})();
