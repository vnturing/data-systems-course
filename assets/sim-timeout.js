/* Simulator for Lesson 0001: the timeout problem.
   Two widgets: (A) "Worlds" explorer and (B) "Retry lab" + full outcome matrix.
   Pure functions at top so the model is easy to audit and test. */
(function(){
  var SCEN={
    lost:{name:'Request lost in network',
      server:[['0 ms','never receives the request','x'],['-','ledger unchanged: 0 charges','']],
      net:'request dropped', committed:false, serverSaw:false},
    crash:{name:'Server crashes mid-request',
      server:[['40 ms','receives request, starts work',''],['60 ms','CRASH before committing','x'],['-','ledger unchanged: 0 charges','']],
      net:'request delivered, server dies', committed:false, serverSaw:true},
    lostresp:{name:'Charge succeeds, reply lost',
      server:[['40 ms','receives request',''],['60 ms','commits charge','g'],['70 ms','sends reply','' ],['-','reply dropped; ledger: 1 charge','x']],
      net:'reply dropped', committed:true, serverSaw:true},
    slow:{name:'Charge succeeds, reply is slow',
      server:[['40 ms','receives request',''],['60 ms','commits charge','g'],['3200 ms','reply finally sent (GC pause / queueing)',''],['-','ledger: 1 charge','']],
      net:'reply arrives after client gave up', committed:true, serverSaw:true}
  };
  var STRAT={
    none:{name:'Give up on timeout (no retry)'},
    blind:{name:'Retry once, same request, no key'},
    key:{name:'Retry once with idempotency key (key + charge commit atomically)'},
    keynonatomic:{name:'Retry once with key (key saved in a separate step before the charge)'}
  };

  /* Core model. Attempt 1 behaves per scenario. Attempt 2 (if any) reaches a healthy server. */
  function simulate(sc,st){
    var s=SCEN[sc], log=[], charges=0, belief, note='';
    log.push(['0 ms','client','send charge($50) [attempt 1'+(st==='key'||st==='keynonatomic'?', key=K1':'')+']','']);
    if(sc==='lost') log.push(['~','net','request dropped','x']);
    if(sc==='crash'){
      if(st==='keynonatomic'){log.push(['60 ms','server','records key K1 as "done"','']);}
      log.push(['60 ms','server','crashes before charge commits (restarts shortly)','x']);
    }
    if(s.committed){charges=1;log.push(['60 ms','server','commits charge'+(st==='key'||st==='keynonatomic'?' + key K1 atomically':''),'g']);
      log.push([sc==='slow'?'3200 ms':'70 ms','net',sc==='slow'?'reply arrives, but client already gave up':'reply dropped','x']);}
    log.push(['2000 ms','client','TIMEOUT: no reply. Client knows nothing else.','x']);
    if(st==='none'){
      belief='failed';
    } else {
      log.push(['2000 ms','client','send charge($50) [attempt 2'+(st==='blind'?'':', key=K1')+']','']);
      if(st==='blind'){
        charges+=1; belief='success';
        log.push(['2040 ms','server','commits charge (no way to know it is a repeat)','g']);
      } else if(st==='key'){
        if(s.committed){log.push(['2040 ms','server','key K1 already present: returns saved result, no new charge','g']);}
        else{charges+=1;log.push(['2040 ms','server','key K1 absent (rolled back with the crash): commits charge + key','g']);}
        belief='success';
      } else { /* keynonatomic */
        if(sc==='crash'){log.push(['2040 ms','server','key K1 already "done": returns success WITHOUT charging','x']);}
        else if(s.committed){log.push(['2040 ms','server','key K1 present: returns saved result, no new charge','g']);}
        else{charges+=1;log.push(['2040 ms','server','key K1 absent: records key, commits charge','g']);}
        belief='success';
      }
      log.push(['2060 ms','client','receives reply for attempt 2','g']);
    }
    var verdict, cls;
    if(charges===1&&belief==='success'){verdict='Correct: charged once, client knows.';cls='ok';}
    else if(charges===0&&belief==='failed'){verdict='Honest failure: nothing happened, client says so.';cls='ok';}
    else if(charges>1){verdict='DOUBLE CHARGE: customer charged '+charges+' times.';cls='bad';}
    else if(charges===1&&belief==='failed'){verdict='False failure: money moved but client reports an error.';cls='warn';}
    else {verdict='SILENT LOSS: client reports success, but 0 charges exist.';cls='bad';}
    return {log:log,charges:charges,belief:belief,verdict:verdict,cls:cls};
  }
  window.TimeoutSim={simulate:simulate,SCEN:SCEN,STRAT:STRAT};

  function esc(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]});}
  function evHtml(e){return '<div class="ev '+(e[3]||'')+'"><span class="t">'+esc(e[0])+'</span><span>'+(e[1]?'<b>'+esc(e[1])+'</b> ':'')+esc(e[2])+'</span></div>';}

  document.addEventListener('DOMContentLoaded',function(){
    /* ---------- Widget A: worlds explorer ---------- */
    var A=document.getElementById('sim-worlds');
    if(A){
      var keys=Object.keys(SCEN);
      A.innerHTML='<h4>Interactive 1 &middot; What did the client actually learn?</h4>'+
        '<p>The client sent <code>charge($50)</code> and heard nothing for 2 seconds. <b>Before you look:</b> tick every world you think is <i>consistent with what the client observed</i>.</p>'+
        keys.map(function(k){return '<label class="opt"><input type="checkbox" value="'+k+'"> '+esc(SCEN[k].name)+'</label>';}).join('')+
        '<div class="row"><button class="btn" id="w-reveal">Check my prediction</button></div><div id="w-out"></div>';
      document.getElementById('w-reveal').onclick=function(){
        var picked=[].slice.call(A.querySelectorAll('input:checked')).map(function(i){return i.value});
        var missed=keys.filter(function(k){return picked.indexOf(k)<0});
        var msg=missed.length===0?
          '<div class="callout win"><b class="t">Right</b>All four are consistent. The client observation is identical in every world.</div>':
          '<div class="callout warn"><b class="t">Look again</b>'+(picked.length===0?'You ticked none, but ':'You missed ')+
          'every one of these is consistent with a 2-second silence: <b>'+missed.map(function(k){return esc(SCEN[k].name)}).join('; ')+'</b>. A timeout is not evidence of failure.</div>';
        var html=msg+'<div class="tl"><div><h5>Client view (identical in all 4 worlds)</h5>'+
          evHtml(['0 ms','client','send charge($50)','']) + evHtml(['2000 ms','client','TIMEOUT: nothing received','x'])+
          '</div><div><h5>Choose a world to see the truth</h5><div id="w-pick" class="row"></div><div id="w-truth"></div></div></div>';
        document.getElementById('w-out').innerHTML=html;
        var pk=document.getElementById('w-pick');
        keys.forEach(function(k){
          var b=document.createElement('button'); b.className='btn ghost'; b.textContent=SCEN[k].name;
          b.onclick=function(){
            [].forEach.call(pk.children,function(x){x.classList.remove('sel')}); b.classList.add('sel');
            document.getElementById('w-truth').innerHTML=SCEN[k].server.map(function(e){return evHtml([e[0],'server',e[1],e[2]])}).join('');
          };
          pk.appendChild(b);
        });
      };
    }
    /* ---------- Widget B: retry lab ---------- */
    var B=document.getElementById('sim-lab');
    if(B){
      var sk=Object.keys(SCEN), tk=Object.keys(STRAT), cs=sk[2], ct='none';
      B.innerHTML='<h4>Interactive 2 &middot; Retry lab</h4>'+
        '<div class="row"><b>World:</b> <span id="l-sc"></span></div>'+
        '<div class="row"><b>Client strategy:</b> <span id="l-st"></span></div>'+
        '<div class="row"><button class="btn" id="l-run">Run</button></div><div id="l-out"></div>'+
        '<h4 style="margin-top:1.2rem">Full outcome matrix (click a cell to load it above)</h4><div id="l-mx"></div>';
      function mkButtons(host,keysArr,table,get,setf){
        var h=document.getElementById(host); h.innerHTML='';
        keysArr.forEach(function(k){
          var b=document.createElement('button'); b.className='btn ghost'+(get()===k?' sel':''); b.textContent=table[k].name;
          b.onclick=function(){setf(k);mkButtons(host,keysArr,table,get,setf);run();};
          h.appendChild(b);
        });
      }
      function run(){
        var r=simulate(cs,ct);
        document.getElementById('l-out').innerHTML=
          '<div class="tl" style="grid-template-columns:1fr"><div><h5>Event log</h5>'+r.log.map(function(e){return evHtml([e[0],e[1],e[2],e[3]])}).join('')+'</div></div>'+
          '<div class="callout '+(r.cls==='ok'?'win':r.cls==='warn'?'warn':'')+'" style="'+(r.cls==='bad'?'border-color:var(--bad);background:var(--bad-soft)':'')+'"><b class="t">Outcome</b>'+
          'Charges in ledger: <b>'+r.charges+'</b> &middot; Client believes: <b>'+r.belief+'</b><br>'+esc(r.verdict)+'</div>';
      }
      function matrix(){
        var h='<table class="matrix"><tr><th></th>'+sk.map(function(k){return '<th>'+esc(SCEN[k].name)+'</th>'}).join('')+'</tr>';
        tk.forEach(function(t){
          h+='<tr><th style="text-transform:none;letter-spacing:0;font-size:.74rem">'+esc(STRAT[t].name)+'</th>';
          sk.forEach(function(s){var r=simulate(s,t);h+='<td class="cell '+r.cls+'" data-s="'+s+'" data-t="'+t+'" style="cursor:pointer">'+r.charges+' charge'+(r.charges===1?'':'s')+'<br>'+esc(r.verdict.split(':')[0])+'</td>';});
          h+='</tr>';
        });
        var m=document.getElementById('l-mx'); m.innerHTML=h+'</table>';
        [].forEach.call(m.querySelectorAll('td.cell'),function(td){td.onclick=function(){cs=td.dataset.s;ct=td.dataset.t;
          mkButtons('l-sc',sk,SCEN,function(){return cs},function(v){cs=v});mkButtons('l-st',tk,STRAT,function(){return ct},function(v){ct=v});run();};});
      }
      mkButtons('l-sc',sk,SCEN,function(){return cs},function(v){cs=v});
      mkButtons('l-st',tk,STRAT,function(){return ct},function(v){ct=v});
      document.getElementById('l-run').onclick=run; run(); matrix();
    }
  });
})();
