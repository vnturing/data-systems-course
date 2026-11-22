/* Bounded teaching models, not an SQL engine or a production isolation checker.
   Logical commit boundaries below are event order, never wall-clock timestamps. */
(function(){
  'use strict';
  function transfer(transactional,phase,durable,external){
    var initial=[100,100],working=initial.slice(),events=[],committed=phase>=3;
    if(phase>=1){working[0]-=30;events.push('Debit A by 30.');}
    if(external&&phase>=1)events.push('An external notification escaped after the debit.');
    if(phase>=2){working[1]+=30;events.push('Credit B by 30.');}
    var recovered=transactional?(committed&&durable?working:initial):working;
    if(!transactional&&!durable)recovered=initial;
    return {balances:recovered,total:recovered[0]+recovered[1],committed:committed,
      acknowledged:phase>=4,externalEffect:external&&phase>=1,events:events,
      why:!transactional?'Each autocommit statement has its own boundary; a crash between them can leave only the debit.':
        !committed?'The crash aborts the uncommitted database changes.':
        !durable?'This scenario assumes acknowledged log bytes were only in volatile host memory. A host loss discards them.':
        'The committed database transfer survives the assumed host crash, even if the reply was lost.'};
  }
  function reads(level){
    var dirty=level==='ru',repeat=level==='rr';
    return {values:[dirty?900:100,100,repeat?100:110],steps:[
      ['A','write 900, still uncommitted'],['B','read '+(dirty?900:100)],
      ['A','ROLLBACK'],['B','read 100'],['C','write 110 and COMMIT'],
      ['B','read '+(repeat?100:110)]],
      why:dirty?'The first value never committed. This is a dirty read.':repeat?
        'The first consistent read fixes B’s view; later plain reads reuse it.':
        'Each plain statement gets a committed view; separate statements may see different commits.'};
  }
  function visible(versions,boundary,own){
    var examined=[];
    for(var i=versions.length-1;i>=0;i--){
      var v=versions[i];examined.push(v.tx);
      if(v.tx===own||(v.commit!==null&&v.commit<=boundary))return {value:v.value,tx:v.tx,examined:examined};
    }
    return {value:null,tx:null,examined:examined};
  }
  var versions=[{tx:'T1',value:100,commit:1},{tx:'T2',value:110,commit:3},
    {tx:'T3',value:120,commit:4},{tx:'reader',value:130,commit:null}];
  function mvcc(boundary,own){return visible(versions,boundary,own?'reader':null);}
  function lostUpdate(method,initial,delta){
    var balance=initial,steps=[],aborts=0,commits=0,reads=[initial,initial];
    if(method==='lock'){
      steps.push(['A','lock row; read '+balance]);balance+=delta;commits++;
      steps.push(['B','wait until A commits; lock and read '+balance]);balance+=delta;commits++;
    }else{
      steps.push(['A + B','both plain reads return '+initial]);
      balance=method==='atomic'?balance+delta:reads[0]+delta;commits++;
      steps.push(['A','write '+balance+'; COMMIT']);
      if(method==='cas'||method==='si'){
        aborts++;steps.push(['B',method==='cas'?'version predicate affects zero rows; explicitly ROLLBACK':'overlapping same-row change triggers a serialization failure']);
        steps.push(['B retry','new transaction reads '+balance+' and recomputes']);balance+=delta;commits++;
      }else{balance=method==='atomic'?balance+delta:reads[1]+delta;commits++;}
    }
    steps.push(['B','final committed value '+balance]);
    return {balance:balance,expected:initial+2*delta,commits:commits,retries:aborts,steps:steps,
      safe:balance===initial+2*delta};
  }
  function skew(policy){
    var state=[1,1],counts=[2,2],aborts=0,steps=[];
    if(policy==='guard'||policy==='serial'){
      counts=[2,1];state=[0,1];
      steps.push(['A','admit with count 2; commit off-call']);
      steps.push(['B','after A, read count 1; refuse off-call']);
    }else if(policy==='ssi'){
      state=[0,1];aborts=1;steps.push(['A + B','both read the two on-call doctors']);
      steps.push(['A','commit off-call']);steps.push(['B','abort; whole retry sees only one on-call doctor']);
    }else{
      state=[0,0];steps.push(['A + B','both read count 2']);
      steps.push(['A','write doctor 1 off-call; commit']);steps.push(['B','write doctor 2 off-call; commit']);
    }
    return {state:state,counts:counts,remaining:state[0]+state[1],aborts:aborts,steps:steps,
      edges:policy==='guard'||policy==='serial'?[]:[['A','B','A read doctor 2 before B changed it'],['B','A','B read doctor 1 before A changed it']],
      safe:state[0]+state[1]>=1};
  }
  function phantom(mode){
    var blocks=mode==='range',snapshot=mode==='snapshot';
    return {before:0,after:blocks||snapshot?0:1,insertCommitted:!blocks,
      admitted:mode==='unique'||blocks?1:2,
      why:blocks?'An indexed locking range read prevents this insert until the reader ends.':
        snapshot?'The inserted row stays invisible to the old view, but that alone does not protect admission.':
        mode==='unique'?'Both can observe absence, but the unique constraint rejects one exact-slot insert.':
        'A later committed view sees the new match. The initial absence was not reserved.'};
  }
  function locks(order,sharedReads){
    var requests=order==='same'?[['A','x'],['B','x'],['A','y']]:[['A','x'],['B','y'],['A','y'],['B','x']];
    var holders={},waits=[],steps=[];
    requests.forEach(function(r){var tx=r[0],key=r[1],h=holders[key];
      if(h&&h!==tx){waits.push([tx,h]);steps.push([tx,'wait for '+key+' held by '+h]);}
      else{holders[key]=tx;steps.push([tx,'hold X('+key+') until transaction end']);}
    });
    var cycle=waits.some(function(a){return waits.some(function(b){return a[0]===b[1]&&a[1]===b[0];});});
    return {steps:steps,waits:waits,deadlock:cycle,readersBlock:!!sharedReads,
      why:cycle?'The wait graph has A → B → A. Abort a victim, then retry the full transaction.':
        'B waits, but A can finish and release locks. A common acquisition order removes this two-row cycle.'};
  }
  function serial(method){
    var r=skew(method==='snapshot'?'snapshot':method==='ssi'?'ssi':'serial');
    r.mechanism=method==='snapshot'?'Both disjoint writes commit: the read/write cycle is unchecked.':
      method==='ssi'?'Track read/write anti-dependencies; abort a participant before both commit. This is a two-transaction illustration, not PostgreSQL’s full SSI detector.':
      'Run each complete transaction in turn; the second sees the first’s committed choice.';
    return r;
  }
  function recommendation(feature,strategy){
    var good={counter:['atomic','lock','ssi'],roster:['guard','ssi'],slot:['unique','guard','ssi'],report:['snapshot','ssi']};
    var fits=good[feature].indexOf(strategy)>=0;
    var reasons={counter:'Both admitted increments must contribute; a stale absolute assignment can lose one.',
      roster:'The invariant spans rows, so every decision path needs a common guard or serializable execution.',
      slot:'Use UNIQUE(room_id, slot_id) for a discretized exact slot. Overlapping arbitrary intervals need a different proof.',
      report:'One consistent read view keeps the report’s statements on the same committed snapshot; it need not be the latest state.'};
    return {fits:fits,why:reasons[feature],condition:strategy==='ssi'?
      'Use a verified serializable implementation for all participating paths, with whole-transaction retries.':
      strategy==='guard'?'All writers must acquire the same guard before fresh validation; this model assumes read committed after the lock.':
      strategy==='lock'?'Lock before reading the protected row; keep the read, decision and write in one transaction.':
      strategy==='unique'?'Handle the constraint failure as a business conflict, not an unconditional retry loop.':
      strategy==='atomic'?'Use an in-database expression and validate any admission predicate in the same statement.':
      'Declare the snapshot boundary and retention cost; a stable view does not serialize decisions.'};
  }
  window.TransactionSim={transfer:transfer,reads:reads,visible:visible,versions:versions,mvcc:mvcc,
    lostUpdate:lostUpdate,skew:skew,phantom:phantom,locks:locks,serial:serial,recommendation:recommendation};
})();
