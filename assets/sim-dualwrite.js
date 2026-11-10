/* Lesson 0002 simulator: crash-point explorer for "write MySQL, then tell Kafka".
   Data-driven: each strategy is an ordered list of steps with effects on a tiny world state.
   Pure model first (tested by tools/test-dualwrite.js), DOM second. */
(function(){
  var STRATS={
    commitFirst:{name:'A. Commit, then publish',
      steps:[
        {w:'service',t:'INSERT order (uncommitted)',fx:function(s){s.pending=true}},
        {w:'service',t:'COMMIT to MySQL',fx:function(s){if(s.pending){s.db=true;s.pending=false}}},
        {w:'service',t:'PRODUCE event to Kafka',fx:function(s){s.kafka++}},
        {w:'service',t:'Reply 201 to client',fx:function(s){s.client='201'}}]},
    publishFirst:{name:'B. Publish, then commit',
      steps:[
        {w:'service',t:'INSERT order (uncommitted)',fx:function(s){s.pending=true}},
        {w:'service',t:'PRODUCE event to Kafka',fx:function(s){s.kafka++}},
        {w:'service',t:'COMMIT to MySQL',fx:function(s){if(s.pending){s.db=true;s.pending=false}}},
        {w:'service',t:'Reply 201 to client',fx:function(s){s.client='201'}}]},
    outbox:{name:'C. Outbox (order + event row in one transaction)',
      steps:[
        {w:'service',t:'INSERT order + INSERT outbox row (uncommitted)',fx:function(s){s.pending=true}},
        {w:'service',t:'COMMIT to MySQL (both rows, atomically)',fx:function(s){if(s.pending){s.db=true;s.outbox='unsent';s.pending=false}}},
        {w:'service',t:'Reply 201 to client',fx:function(s){s.client='201'}},
        {w:'relay',t:'Relay: SELECT unsent outbox rows',fx:function(s){s.relayRead=(s.outbox==='unsent')}},
        {w:'relay',t:'Relay: PRODUCE event to Kafka',fx:function(s){if(s.relayRead)s.kafka++}},
        {w:'relay',t:'Relay: UPDATE outbox row to sent',fx:function(s){if(s.relayRead&&s.outbox==='unsent')s.outbox='sent'}}]}
  };
  function fresh(){return {pending:false,db:false,outbox:null,kafka:0,client:'timeout',relayRead:false};}
  /* crashAfter: index of the last step that completed (-1 = crash before step 0), or null for no crash.
     fault 'commitError': the COMMIT fails with an error (deadlock, constraint, lost connection with known failure). */
  function run(key,crashAfter,fault){
    var S=STRATS[key].steps, s=fresh(), crashedActor=null;
    if(crashAfter===-1) return classify(s); /* died before doing anything */
    for(var i=0;i<S.length;i++){
      if(crashedActor&&S[i].w===crashedActor) continue;
      if(fault==='commitError'&&/COMMIT/.test(S[i].t)&&S[i].w==='service'){
        s.pending=false; s.client='500';
        crashedActor='service'; continue; /* service aborts; relay (if any) still runs */
      }
      S[i].fx(s);
      if(crashAfter!==null&&i===crashAfter){
        crashedActor=S[i].w;
        if(S[i].w==='service'&&s.pending){s.pending=false;} /* uncommitted work is rolled back */
      }
    }
    if(crashedActor==='relay'){ /* relay restarts and re-drives from the outbox table */
      s.relayRead=(s.outbox==='unsent');
      if(s.relayRead){s.kafka++;s.outbox='sent';}
    }
    return classify(s);
  }
  function classify(s){
    var v,cls;
    if(s.db&&s.kafka===0){v='LOST EVENT: order exists, nobody downstream was told';cls='bad';}
    else if(!s.db&&s.kafka>0){v='PHANTOM EVENT: downstream saw an order that does not exist';cls='bad';}
    else if(s.db&&s.kafka>1){v='DUPLICATE EVENT: delivered '+s.kafka+' times (safe only if consumers dedupe)';cls='warn';}
    else if(s.db&&s.kafka===1){v='Consistent';cls='ok';}
    else {v='Clean: nothing happened anywhere';cls='ok';}
    return {db:s.db,kafka:s.kafka,client:s.client,verdict:v,cls:cls,outbox:s.outbox};
  }
  function allPoints(key){
    var S=STRATS[key].steps, rows=[{label:'Crash before any step',crash:-1}];
    S.forEach(function(st,i){rows.push({label:'Crash after: '+st.t,crash:i});});
    return rows;
  }
  window.DualWriteSim={STRATS:STRATS,run:run,allPoints:allPoints};

  function esc(x){return String(x).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]});}
  document.addEventListener('DOMContentLoaded',function(){
    var host=document.getElementById('sim-dualwrite'); if(!host) return;
    var cur='commitFirst', dedupe=false;
    host.innerHTML='<h4>Interactive &middot; Crash-point explorer</h4>'+
      '<p>Pick a design, then read down the table: every row is a place the process could die. <b>Predict the verdict before looking at it</b> (cover the last column).</p>'+
      '<div class="row" id="dw-strats"></div>'+
      '<label class="opt" style="max-width:32rem"><input type="checkbox" id="dw-dedupe"> Downstream consumers dedupe by event id (idempotent)</label>'+
      '<div id="dw-out"></div>';
    var sb=document.getElementById('dw-strats');
    Object.keys(STRATS).forEach(function(k){
      var b=document.createElement('button'); b.className='btn ghost'; b.textContent=STRATS[k].name; b.dataset.k=k;
      b.onclick=function(){cur=k;draw();}; sb.appendChild(b);
    });
    document.getElementById('dw-dedupe').onchange=function(e){dedupe=e.target.checked;draw();};
    function draw(){
      [].forEach.call(sb.children,function(b){b.classList.toggle('sel',b.dataset.k===cur)});
      var rows=allPoints(cur).map(function(p){return {p:p,r:run(cur,p.crash===-1?-1:p.crash,null)};});
      rows.push({p:{label:'COMMIT fails with an error (deadlock, constraint)'},r:run(cur,null,'commitError')});
      var h='<table><tr><th>Where it dies</th><th>MySQL has order</th><th>Kafka events</th><th>Client sees</th><th>Verdict</th></tr>';
      rows.forEach(function(x){
        var v=x.r.verdict,c=x.r.cls;
        if(dedupe&&/DUPLICATE/.test(v)){v='Duplicate absorbed by idempotent consumers';c='ok';}
        var client=x.r.client==='201'?'201 Created':x.r.client==='500'?'500 error':'timeout (unknown outcome)';
        h+='<tr><td>'+esc(x.p.label)+'</td><td>'+(x.r.db?'yes':'no')+'</td><td>'+x.r.kafka+'</td><td>'+client+'</td><td><span class="tag '+c+'">'+esc(v)+'</span></td></tr>';
      });
      document.getElementById('dw-out').innerHTML=h+'</table>'+
        '<p style="color:var(--muted)">Every &ldquo;timeout&rdquo; row invites the client to retry. That brings back Lesson 1: a retry on top of a half-finished handler can duplicate the order itself.</p>';
    }
    draw();
  });
})();
