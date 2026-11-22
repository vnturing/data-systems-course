/* DOM adapters: state transitions live in sim-transactions.js; evidence is embedded JSON. */
(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded',function(){
    var S=window.TransactionSim;
    function $(id){return document.getElementById(id);}
    function esc(x){return String(x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function select(id,label,options){return '<div class="row"><label for="'+id+'">'+label+'</label><select id="'+id+'">'+options.map(function(o){return '<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>';}).join('')+'</select></div>';}
    function table(head,rows){return '<div class="table-scroll"><table><thead><tr>'+head.map(function(h){return '<th scope="col">'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(v){return '<td>'+esc(typeof v==='object'?JSON.stringify(v):v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
    function status(ok,text){return '<p><b class="tag '+(ok?'ok':'bad')+'">'+esc(text)+'</b></p>';}
    function mount(id,title,html,fields,draw){var host=$(id);if(!host)return;host.innerHTML='<h4>Interactive · '+title+'</h4>'+html+'<div id="'+id+'-out" aria-live="polite"></div>';fields.forEach(function(f){$(f).addEventListener('input',function(){draw($(id+'-out'));});});draw($(id+'-out'));}
    mount('sim-tx-acid','Crash the transfer',
      '<p>Start with A=100 and B=100. Transfer 30, then lose the host at the selected boundary. These are explicit recovery assumptions, not a hardware durability test.</p>'+
      select('ac-mode','Database boundary',[['transaction','One InnoDB transaction'],['autocommit','Separate autocommit updates']])+
      select('ac-phase','Crash after',[['1','Debit only'],['2','Both updates, before COMMIT'],['3','COMMIT, before reply'],['4','Success reply']])+
      select('ac-durable','Persistence assumption',[['yes','Committed log survives host loss'],['no','Log only in volatile host memory']])+
      select('ac-external','Notification',[['no','Written to an outbox in the transaction'],['yes','External send immediately after debit']]),
      ['ac-mode','ac-phase','ac-durable','ac-external'],function(out){var r=S.transfer($('ac-mode').value==='transaction',+$('ac-phase').value,$('ac-durable').value==='yes',$('ac-external').value==='yes');
        out.innerHTML=table(['Recovered A','Recovered B','Total'],[[r.balances[0],r.balances[1],r.total]])+'<p>'+esc(r.why)+'</p><p>Success reply observed: <b>'+(r.acknowledged?'yes':'no')+'</b>. External send escaped: <b>'+(r.externalEffect?'yes':'no')+'</b>.</p><p>With autocommit, each completed update is already committed. The crash menu’s COMMIT boundary applies to the grouped transaction.</p>';
      });
    mount('sim-tx-reads','One reader, three writes',
      select('rd-level','Reader isolation',[['rc','MySQL read committed'],['rr','MySQL repeatable read'],['ru','MySQL read uncommitted']]),['rd-level'],function(out){var r=S.reads($('rd-level').value);out.innerHTML=table(['Session','Event'],r.steps)+'<p>Reader values: <b>'+esc(r.values.join(' → '))+'</b>. '+esc(r.why)+'</p><p>Writers still lock: changing this read policy does not permit overwriting another transaction’s uncommitted row.</p>';});
    mount('sim-tx-mvcc','Walk a version chain',
      '<p>Newest to oldest: reader’s uncommitted 130, T3=120 committed at event 4, T2=110 at event 3, T1=100 at event 1. Boundaries are logical events, not timestamps.</p>'+
      select('mv-boundary','Committed view through event',[['2','2: before T2 commits'],['3','3: T2 committed'],['4','4: T3 committed']])+
      select('mv-own','Reader’s own write',[['no','No own write: skip uncommitted 130'],['yes','Reader wrote 130: own write visible']]),['mv-boundary','mv-own'],function(out){var r=S.mvcc(+$('mv-boundary').value,$('mv-own').value==='yes');out.innerHTML=table(['Visible value','Version owner','Versions examined'],[[r.value,r.tx,r.examined]])+'<p>A long-lived view can need an old version after newer writers commit. Purging that required history would make this read impossible. This chain omits physical pages, undo encoding and secondary-index checks.</p>';});
    mount('sim-tx-lost','Two additions of ten',
      select('lu-method','Update protocol',[['blind','Read in app, assign old value + 10'],['atomic','UPDATE v = v + 10'],['lock','Lock row before reading'],['cas','Compare version, rollback and retry on zero rows'],['si','Snapshot write-conflict detection and retry']]),['lu-method'],function(out){var r=S.lostUpdate($('lu-method').value,100,10);out.innerHTML=table(['Session','Step'],r.steps)+status(r.safe,'Final '+r.balance+'; required '+r.expected)+'<p>Committed operations: '+r.commits+'. Whole retries: '+r.retries+'. The snapshot-conflict option describes an ideal SI same-row conflict rule, checked separately against PostgreSQL; it is not a guarantee of MySQL repeatable read.</p>';});
    mount('sim-tx-skew','Can both doctors leave?',
      select('sk-policy','Admission protocol',[['snapshot','Plain snapshot reads, different row writes'],['ownlock','Lock only the doctor being changed'],['guard','Common guard, then a fresh count'],['ssi','Serializable dependency check and retry']]),['sk-policy'],function(out){var r=S.skew($('sk-policy').value);out.innerHTML=table(['Session','Step'],r.steps)+table(['Doctor 1','Doctor 2','Still on call'],[[r.state[0],r.state[1],r.remaining]])+status(r.safe,r.safe?'Invariant holds':'Invariant broken: nobody remains')+'<p>Read counts: '+esc(r.counts.join(', '))+'. Aborts: '+r.aborts+'. '+(r.edges.length?'Anti-dependencies: A → B and B → A; each decision read a row the other changed.':'Both decisions see a valid sequential state.')+'</p>';});
    mount('sim-tx-phantom','Absence is a decision input',
      select('pt-mode','Exact-slot admission',[['rc','Read committed plain absence check'],['snapshot','Snapshot plain absence check'],['range','Indexed locking range read'],['unique','Unique constraint on exact room/slot']]),['pt-mode'],function(out){var r=S.phantom($('pt-mode').value);out.innerHTML=table(['Matches in first view','Matches after competing insert','Competing insert commits'],[[r.before,r.after,r.insertCommitted?'yes':'no']])+'<p>'+esc(r.why)+'</p>'+status(r.admitted===1,'Accepted bookings after both decisions: '+r.admitted)+'<p>This is a bounded admission counterexample. Range mode assumes all paths use the same protected index range; the waiting transaction must revalidate. Unique mode is for identical discrete slots, not arbitrary interval overlap.</p>';});
    mount('sim-tx-locks','Build a wait graph',
      select('lk-order','Two-row acquisition order',[['opposite','A locks x then y; B locks y then x'],['same','Both lock x then y']])+
      select('lk-reads','Read mechanism',[['locking','Shared locking reads in a 2PL design'],['snapshot','Nonlocking MVCC reads']]),['lk-order','lk-reads'],function(out){var r=S.locks($('lk-order').value,$('lk-reads').value==='locking');out.innerHTML=table(['Transaction','Request result'],r.steps)+status(!r.deadlock,r.deadlock?'Deadlock cycle':'Wait without a cycle')+'<p>'+esc(r.why)+'</p><p>Plain readers block on these X locks in the selected design: <b>'+(r.readersBlock?'yes':'no')+'</b>. Writes use X locks in both choices. This model uses only exclusive write requests; shared-lock compatibility is explained in the text.</p>';});
    mount('sim-tx-serial','Same invariant, three execution rules',
      select('sr-method','Execution rule',[['snapshot','Snapshot isolation only'],['ssi','Serializable snapshot isolation'],['serial','Actual serial execution']]),['sr-method'],function(out){var r=S.serial($('sr-method').value);out.innerHTML=table(['Session','Result'],r.steps)+status(r.safe,'On-call doctors: '+r.remaining)+'<p>'+esc(r.mechanism)+'</p><p>Aborts in this selected witness: '+r.aborts+'. No latency, throughput, production detector or distributed scheduling is modeled.</p>';});
    var raw=$('transaction-observations');
    if(raw){var evidence=JSON.parse(raw.textContent);
      mount('sim-tx-lab','Inspect the recorded server outcomes',
        '<p>These are embedded copies of committed observations from the reproduction script, not browser predictions or live queries.</p>'+
        select('lab-engine','Engine',[['mysql','MySQL / InnoDB'],['postgres','PostgreSQL']])+
        '<div class="row"><label for="lab-case">Recorded schedule</label><select id="lab-case"></select></div>',
        ['lab-engine','lab-case'],function(out){var engine=$('lab-engine').value,d=evidence[engine],c=$('lab-case');if(c.dataset.engine!==engine){c.innerHTML=Object.keys(d.cases).map(function(k){return '<option>'+esc(k)+'</option>';}).join('');c.dataset.engine=engine;}
          var selected=d.cases[c.value];out.innerHTML='<p>Server version: <b>'+esc(d.version)+'</b>.</p>'+table(['Observation','Result'],Object.keys(selected).map(function(k){return [k,selected[k]];}))+'<p><a href="../experiments/transactions/results/'+engine+'-transcript.json">Exact ordered SQL and server responses</a> · <a href="../experiments/transactions/results/'+engine+'-results.json">Result fixture</a></p>';
        });
    }
    mount('sim-tx-choice','Defend a protocol for the invariant',
      select('ch-feature','Feature',[['roster','At least one doctor on call'],['counter','Two increments must both count'],['slot','One booking per exact room/slot'],['report','Consistent multi-statement report']])+
      select('ch-strategy','Candidate protocol',[['snapshot','One stable snapshot'],['atomic','Atomic in-database increment'],['lock','Lock the one row before reading'],['guard','Common guard and fresh validation'],['unique','Exact-slot unique constraint'],['ssi','Serializable transactions and retries']]),['ch-feature','ch-strategy'],function(out){var r=S.recommendation($('ch-feature').value,$('ch-strategy').value);out.innerHTML=status(r.fits,r.fits?'Candidate can protect this stated invariant':'Candidate alone does not establish this invariant')+'<p>'+esc(r.why)+'</p><p>'+esc(r.condition)+'</p><p>The exercise checks a declared contract. It cannot infer your SQL, indexes, other writers or retry side effects.</p>';});
  });
})();
