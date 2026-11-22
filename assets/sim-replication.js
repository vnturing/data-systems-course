/* Module 5: deliberately bounded, deterministic mechanism models, not database protocols.
   Logical ticks are illustrative. Pure functions; DOM lives in ui-replication.js. */
(function(){
  'use strict';
  function ack(mode,b,c,fallback,crash){
    var received={A:1,B:b?3:Infinity,C:c?6:Infinity},applied={A:1,B:b?8:Infinity,C:c?12:Infinity};
    var at=mode==='async'?1:mode==='semi'?Math.min(received.B,received.C):Math.max(applied.B,applied.C),fellBack=false;
    if(mode==='semi'&&fallback&&at>5){at=5;fellBack=true;}
    return {ackAt:Number.isFinite(at)?at:null,acked:at<=crash,fallback:fellBack&&crash>=5,
      nodes:['A','B','C'].map(function(id){return {id:id,durable:received[id]<=crash,applied:applied[id]<=crash};}),
      remoteCopies:['B','C'].filter(function(id){return received[id]<=crash;}).length};
  }
  function failover(candidate,fenced,drain){
    var disks={A:[1,2,3],B:[1,2,3],C:[1,2]},visible=candidate==='B'&&drain?[1,2,3]:[1,2];
    var before=visible.slice(),missing=[1,2,3].filter(function(x){return visible.indexOf(x)<0;});
    visible.push(5);var old=disks.A.slice();if(!fenced)old.push(4);
    return {candidate:candidate,promotedBeforeWrites:before,promoted:visible,old:old,missing:missing,
      recoverableElsewhere:missing.filter(function(x){return disks.B.indexOf(x)>=0;}),splitBrain:!fenced,
      why:missing.length?'The new read path omits acknowledged transaction 3; B still has its relay-log copy.':'The promoted node applied all three acknowledged transactions.'};
  }
  function logReplay(format,drift,replay,dedupe){
    var before=100-drift,value=before,seen=false,applications=0;
    for(var i=0;i<(replay?2:1);i++){
      if(dedupe&&seen)continue;
      value=format==='statement'?value+10:110;applications++;seen=true;
    }
    return {sourceBefore:100,sourceAfter:110,replicaBefore:before,replicaAfter:value,applications:applications,
      unrelatedSource:70,unrelatedReplica:60};
  }
  function lag(kind,policy){
    if(kind==='prefix')return {rows:[['create order',policy==='barrier'?'not served':'missing'],['confirm order',policy==='barrier'?'not served':'present']],
      blocked:policy==='barrier',violation:policy!=='barrier',why:policy==='barrier'?'The dependency is absent, so this path waits or refuses the read.':'The confirmation is visible without its prerequisite on another stream.'};
    var stale=policy==='any';
    return {rows:kind==='ryw'?[['write at A','v2 acknowledged'],['read routed to '+(stale?'B':'A'),stale?'v1':'v2']]:
      [['first read at A','v2'],['second read at '+(stale?'B':'A'),stale?'v1':'v2']],blocked:false,violation:stale,
      why:stale?'Routing to lagging B violates the selected guarantee.':policy==='barrier'?'The read is served only after its required version is present (or routed to an eligible node).':'Staying at A works in this trace; failover needs another eligible node or an unavailable response.'};
  }
  function multi(kind,policy,skew){
    if(kind==='inventory')return {a:'one local sale accepted',b:'one local sale accepted',result:'two sales for one unit',lost:true,
      why:'Merging both decrements gives stock -1. Convergence does not enforce a nonnegative-stock invariant.'};
    var a={name:'Alice',city:'Harare'},b={name:kind==='same'?'Alicia':'Ada',city:kind==='same'?'Harare':'Mutare'},winner=1+skew>=2?'A':'B',result;
    if(policy==='lww')result=winner==='A'?a:b;
    else if(kind==='different')result={name:'Alice',city:'Mutare'};
    else result={name:['Alice','Alicia'],city:'Harare'};
    return {a:JSON.stringify(a),b:JSON.stringify(b),result:JSON.stringify(result),winner:winner,
      stamps:{A:1+skew,B:2},lost:policy==='lww',why:policy==='lww'?'Whole-record timestamp selection discards the other update. Clock order is not causal order.':
        kind==='different'?'The example merges independent fields; this policy would need a real field-level protocol.':'Same-field alternatives remain explicit; application resolution is still required.'};
  }
  function combinations(xs,k){if(k===0)return [[]];if(k>xs.length)return [];var out=[];xs.forEach(function(x,i){combinations(xs.slice(i+1),k-1).forEach(function(rest){out.push([x].concat(rest));});});return out;}
  function quorum(n,w,r){
    var ids=Array.from({length:n},function(_,i){return String.fromCharCode(65+i);}),writes=combinations(ids,w),reads=combinations(ids,r),disjoint=[];
    writes.forEach(function(a){reads.forEach(function(b){if(!a.some(function(x){return b.indexOf(x)>=0;}))disjoint.push({write:a,read:b});});});
    return {pairs:writes.length*reads.length,disjoint:disjoint.length,witness:disjoint[0]||null,intersects:disjoint.length===0,
      writeWrite:2*w>n};
  }
  function quorumTrace(kind,repair,handoff){
    var nodes={A:0,B:0,C:0,D:0},writes,reads,first=null,acked=true,notes=[];
    if(kind==='sloppy'){
      writes=['A','D'];nodes.A=nodes.D=1;
      if(handoff){nodes.B=nodes.D;notes.push('D delivers its saved hint to recovered home B.');}
      reads=['B','C'];notes.push('D is outside the fixed home set {A,B,C}.');
    }else if(kind==='partial'){
      writes=['A'];nodes.A=1;acked=false;first=1;
      if(repair){nodes.B=1;notes.push('First read {A,B} repairs B to v1 before returning.');}
      else notes.push('First read {A,B} returns v1 without repairing B.');
      reads=['B','C'];
    }else{
      writes=['A','B'];nodes.A=nodes.B=1;reads=['B','C'];
    }
    var value=Math.max.apply(null,reads.map(function(id){return nodes[id];})),before=Object.assign({},nodes);
    if(repair)reads.forEach(function(id){nodes[id]=value;});
    return {writes:writes,reads:reads,acked:acked,firstRead:first,read:value,before:before,nodes:nodes,
      overlap:writes.filter(function(id){return reads.indexOf(id)>=0;}),notes:notes,
      why:kind==='sloppy'&&!handoff?'R+W=4 exceeds N=3, yet the contacted sets are disjoint: the read is stale.':
        kind==='partial'?'A failed write can leave visible state. Read repair changes the second read in this controlled trace.':'The read finds v1 under the stated single-writer, fixed-membership assumptions.'};
  }
  function join(a,b){var out={};Object.keys(a).concat(Object.keys(b)).forEach(function(k){out[k]=Math.max(a[k]||0,b[k]||0);});return out;}
  function relation(a,b){
    var less=false,greater=false;Object.keys(join(a,b)).forEach(function(k){if((a[k]||0)<(b[k]||0))less=true;if((a[k]||0)>(b[k]||0))greater=true;});
    return less&&greater?'concurrent':less?'before':greater?'after':'equal';
  }
  function advance(context,actor){var v=Object.assign({},context);v[actor]=(v[actor]||0)+1;return v;}
  function siblings(versions){return versions.filter(function(v,i){return !versions.some(function(other,j){return i!==j&&relation(v.clock,other.clock)==='before';});});}
  function vector(kind){
    var base={A:1},a={value:'Alice',clock:{A:2}},b={value:'Alicia',clock:kind==='observed'?{A:2,B:1}:{A:1,B:1}},values=[a,b];
    if(kind==='resolved')values.push({value:'Alice (confirmed)',clock:advance(join(a.clock,b.clock),'C')});
    return {base:base,versions:values,relation:relation(a.clock,b.clock),survivors:siblings(values)};
  }
  function tombstone(early){return {old:{value:'old profile',clock:{A:1}},deleted:{value:null,clock:{A:2}},
    result:early?'old profile':null,why:early?'Discarding all deletion metadata lets an old replica reintroduce the value.':'Retained deletion version A:2 dominates the old value A:1.'};}
  // State-based PN counter: each actor owns its monotone components. Merge is componentwise max.
  function counter(){return {p:{},n:{}};}
  function counterUpdate(s,actor,delta){var out={p:Object.assign({},s.p),n:Object.assign({},s.n)},part=delta>=0?'p':'n';out[part][actor]=(out[part][actor]||0)+Math.abs(delta);return out;}
  function counterMerge(a,b){return {p:join(a.p,b.p),n:join(a.n,b.n)};}
  function counterValue(s){return Object.values(s.p).reduce(function(a,b){return a+b;},0)-Object.values(s.n).reduce(function(a,b){return a+b;},0);}
  // Small state-based observed-remove set with permanent tombstones, not an optimized ORSWOT.
  function setMerge(a,b){return {adds:Object.assign({},a.adds,b.adds),removed:Array.from(new Set(a.removed.concat(b.removed))).sort()};}
  function setValue(s){return Array.from(new Set(Object.keys(s.adds).filter(function(tag){return s.removed.indexOf(tag)<0;}).map(function(tag){return s.adds[tag];}))).sort();}
  function observedRemove(s,value){return {adds:Object.assign({},s.adds),removed:Array.from(new Set(s.removed.concat(Object.keys(s.adds).filter(function(tag){return s.adds[tag]===value;})))).sort()};}
  function setDemo(concurrent){
    var seed={adds:{'S:1':'book'},removed:[]},a=observedRemove(seed,'book'),b={adds:Object.assign({},seed.adds),removed:[]};
    if(concurrent)b.adds['B:1']='book';else b=observedRemove(b,'book');
    var merged=setMerge(a,b);return {a:a,b:b,merged:merged,value:setValue(merged)};
  }
  window.ReplicationSim={ack:ack,failover:failover,logReplay:logReplay,lag:lag,multi:multi,combinations:combinations,quorum:quorum,
    quorumTrace:quorumTrace,join:join,relation:relation,advance:advance,siblings:siblings,vector:vector,tombstone:tombstone,
    counter:counter,counterUpdate:counterUpdate,counterMerge:counterMerge,counterValue:counterValue,setMerge:setMerge,setValue:setValue,observedRemove:observedRemove,setDemo:setDemo};
})();
