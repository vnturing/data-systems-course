/* Lesson 0004 simulator: one Kafka partition, replication factor 3, brokers A/B/C.
   A SIMPLIFIED model built to expose the safety/liveness trade-off of acks, min.insync.replicas and
   unclean.leader.election.enable. It is not a faithful Kafka implementation. Simplifications:
   - Failure of a broker is noticed immediately (real clusters take time: session timeouts, controller).
   - "replicate" stands for time passing so live followers fetch the leader's log. With acks=1 followers lag
     until you press it; with acks=all, in-sync followers are updated before the ack.
   - Messages are opaque ids; there is no batching, high watermark, leader epoch or offset translation. */
(function(){
  var IDS=['A','B','C'];
  function init(cfg){
    var w={cfg:{acks:cfg.acks,minIsr:cfg.minIsr,unclean:!!cfg.unclean},n:0,acked:[],events:[],
      brokers:{},leader:'A',isr:['A','B','C']};
    IDS.forEach(function(i){w.brokers[i]={up:true,log:[]};});
    return w;
  }
  function note(w,t,k){w.events.push({t:t,k:k||''});}
  function commonPrefix(a,b){var i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;return i;}
  function followerSync(w,id){ /* truncate divergence, then copy from leader */
    var L=w.brokers[w.leader].log,B=w.brokers[id],cp=commonPrefix(L,B.log);
    B.log=L.slice(0);
  }
  function preferred(w,list){return IDS.filter(function(i){return list.indexOf(i)>=0;});}
  function produce(w){
    var id='m'+(++w.n),c=w.cfg;
    if(!w.leader){note(w,'produce '+id+' FAILED: partition offline (no leader)','x');return false;}
    var L=w.brokers[w.leader];
    if(c.acks==='all'){
      if(w.isr.length<c.minIsr){note(w,'produce '+id+' REJECTED: NotEnoughReplicas (ISR size '+w.isr.length+' < min.insync.replicas '+c.minIsr+')','x');return false;}
      L.log.push(id);
      w.isr.forEach(function(r){if(r!==w.leader&&w.brokers[r].up)w.brokers[r].log.push(id);});
      w.acked.push(id);note(w,'produce '+id+' acked after all in-sync replicas ('+w.isr.join(',')+') wrote it','g');
    } else {
      L.log.push(id);w.acked.push(id);
      note(w,'produce '+id+' acked by leader '+w.leader+' alone (acks=1)','g');
    }
    return true;
  }
  function replicate(w){
    if(!w.leader){note(w,'followers cannot catch up: no leader','x');return;}
    IDS.forEach(function(i){
      if(i!==w.leader&&w.brokers[i].up){followerSync(w,i);if(w.isr.indexOf(i)<0)w.isr=preferred(w,w.isr.concat([i]));}
    });
    note(w,'live followers caught up; ISR = {'+w.isr.join(',')+'}');
  }
  function kill(w,id){
    var b=w.brokers[id]; if(!b.up) return; b.up=false; note(w,'broker '+id+' DOWN','x');
    var wasLeader=(w.leader===id), rest=w.isr.filter(function(i){return i!==id;});
    if(!wasLeader){w.isr=rest;return;}
    var up=rest.filter(function(i){return w.brokers[i].up;});
    if(up.length){w.leader=preferred(w,up)[0];w.isr=rest;note(w,'leader election: '+w.leader+' (from ISR) is the new leader','g');return;}
    /* no live ISR member */
    var others=IDS.filter(function(i){return w.brokers[i].up;});
    if(w.cfg.unclean&&others.length){
      w.leader=others[0];w.isr=[w.leader];
      note(w,'UNCLEAN election: out-of-sync replica '+w.leader+' becomes leader','x');return;
    }
    w.leader=null; w.isr=rest.length?rest:[id]; /* last ISR member stays recorded; partition offline */
    note(w,'no eligible leader: partition OFFLINE'+(w.cfg.unclean?'':' (unclean election disabled; waiting for an ISR member)'),'x');
  }
  function restart(w,id){
    var b=w.brokers[id]; if(b.up) return; b.up=true; note(w,'broker '+id+' UP');
    if(w.leader){ /* rejoin as follower: truncate any divergent tail, then it may catch up */
      var L=w.brokers[w.leader].log, cp=commonPrefix(L,b.log);
      if(cp<b.log.length) note(w,'broker '+id+' truncates '+(b.log.length-cp)+' record(s) that the current leader does not have','x');
      b.log=b.log.slice(0,cp);return;
    }
    if(w.isr.indexOf(id)>=0){w.leader=id;w.isr=[id];note(w,id+' (last ISR member) returns and becomes leader: partition ONLINE','g');}
    else if(w.cfg.unclean){w.leader=id;w.isr=[id];note(w,'UNCLEAN election: out-of-sync replica '+id+' becomes leader','x');}
    else note(w,id+' is not in the ISR and unclean election is disabled: partition stays OFFLINE','x');
  }
  /* Permanent disk loss: the broker goes down and its log is gone for good. */
  function wipe(w,id){ kill(w,id); w.brokers[id].log=[]; note(w,'broker '+id+' DISK DESTROYED: its log is gone permanently','x'); }
  /* Strongest loss: acknowledged messages that exist on NO surviving disk (up or down). */
  function unrecoverable(w){
    return w.acked.filter(function(m){return IDS.every(function(i){return w.brokers[i].log.indexOf(m)<0;});});
  }
  /* Safety check: which acknowledged messages are absent from the authoritative log? */
  function lost(w){
    var auth;
    if(w.leader) auth=w.brokers[w.leader].log;
    else auth=(w.isr.length?w.brokers[w.isr[0]].log:[]);
    return w.acked.filter(function(m){return auth.indexOf(m)<0;});
  }
  var SCEN=[
    {name:'Leader dies right after an acks=1 write',steps:['p','r','p','k:A']},
    {name:'Cascading broker failures, then a stale replica returns',steps:['p','k:C','p','k:B','p','k:A','s:C','p','s:A','p']}
  ];
  function runSteps(w,steps){
    steps.forEach(function(s){
      if(s==='p')produce(w);else if(s==='r')replicate(w);
      else if(s.indexOf('k:')===0)kill(w,s.slice(2));else if(s.indexOf('x:')===0)wipe(w,s.slice(2));else if(s.indexOf('s:')===0)restart(w,s.slice(2));
    });return w;
  }
  /* Worst-case cascade used for the config matrix (followers never get a chance to catch up under acks=1
     except after m1, which is the point: failures arrive faster than replication). */
  var DISKLOSS=['p','r','k:C','p','k:B','p','x:A'];
  var CASCADE=['p','r','k:C','p','k:B','p','k:A','s:C','p','s:A','p'];
  function matrix(){
    var rows=[];
    [['1',1],['1',2],['all',1],['all',2]].forEach(function(a){
      [false,true].forEach(function(u){
        var w=init({acks:a[0],minIsr:a[1],unclean:u});
        var sentOk=0,attempts=0;
        CASCADE.forEach(function(s){
          if(s==='p'){attempts++;if(produce(w))sentOk++;} else runSteps(w,[s]);
        });
        var w2=init({acks:a[0],minIsr:a[1],unclean:u}); runSteps(w2,['p','r','p','k:A']); /* leader dies while a follower lags */
        var w3=init({acks:a[0],minIsr:a[1],unclean:u}); runSteps(w3,DISKLOSS); /* ISR shrinks to the leader, then its disk dies */
        rows.push({acks:a[0],minIsr:a[1],unclean:u,attempts:attempts,accepted:sentOk,rejected:attempts-sentOk,lost:lost(w).length,
          lostIds:lost(w),online:!!w.leader,leaderDeathLost:lost(w2).length,diskLost:unrecoverable(w3).length});
      });
    });
    return rows;
  }
  window.KafkaSim={init:init,produce:produce,replicate:replicate,kill:kill,restart:restart,lost:lost,runSteps:runSteps,
    SCEN:SCEN,CASCADE:CASCADE,DISKLOSS:DISKLOSS,wipe:wipe,unrecoverable:unrecoverable,matrix:matrix};

  function esc(x){return String(x).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]});}
  document.addEventListener('DOMContentLoaded',function(){
    var host=document.getElementById('sim-kafka');
    if(host){
      var w=init({acks:'all',minIsr:2,unclean:false});
      host.innerHTML='<h4>Interactive 1 &middot; One partition, three brokers</h4>'+
        '<div class="row"><b>acks</b> <span id="k-acks"></span> <b>min.insync.replicas</b> <span id="k-min"></span> <b>unclean.leader.election.enable</b> <span id="k-unc"></span></div>'+
        '<div class="row" id="k-scen"></div>'+
        '<div class="row" id="k-actions"></div><div id="k-state"></div><div id="k-log"></div>';
      var cfgNames={acks:['1','all'],min:[1,2],unc:[false,true]};
      function cfgButtons(){
        function mk(hostId,vals,get,set,label){var h=document.getElementById(hostId);h.innerHTML='';
          vals.forEach(function(v){var b=document.createElement('button');b.className='btn ghost'+(get()===v?' sel':'');b.textContent=label?label(v):String(v);
            b.onclick=function(){set(v);reset();};h.appendChild(b);});}
        mk('k-acks',cfgNames.acks,function(){return w.cfg.acks},function(v){cfg.acks=v});
        mk('k-min',cfgNames.min,function(){return w.cfg.minIsr},function(v){cfg.minIsr=v});
        mk('k-unc',cfgNames.unc,function(){return w.cfg.unclean},function(v){cfg.unclean=v},function(v){return v?'true':'false'});
      }
      var cfg={acks:'all',minIsr:2,unclean:false};
      function reset(){w=init(cfg);cfgButtons();draw();}
      var sc=document.getElementById('k-scen');
      SCEN.forEach(function(s){var b=document.createElement('button');b.className='btn';b.textContent='Run preset: '+s.name;
        b.onclick=function(){w=init(cfg);runSteps(w,s.steps);cfgButtons();draw();};sc.appendChild(b);});
      var act=document.getElementById('k-actions');
      function addBtn(label,fn){var b=document.createElement('button');b.className='btn ghost';b.textContent=label;b.onclick=function(){fn();draw();};act.appendChild(b);}
      addBtn('Produce a message',function(){produce(w)});
      addBtn('Let followers catch up',function(){replicate(w)});
      IDS.forEach(function(i){addBtn('Kill '+i,function(){kill(w,i)});});
      IDS.forEach(function(i){addBtn('Restart '+i,function(){restart(w,i)});});
      IDS.forEach(function(i){addBtn('Destroy '+i+' disk',function(){wipe(w,i)});});
      addBtn('Reset',function(){reset();});
      function draw(){
        var l=lost(w),h='<div class="tl" style="grid-template-columns:repeat(3,1fr)">';
        IDS.forEach(function(i){var b=w.brokers[i];
          h+='<div><h5>Broker '+i+(w.leader===i?' &middot; LEADER':'')+(w.isr.indexOf(i)>=0?' &middot; in ISR':'')+'</h5>'+
            '<div style="color:'+(b.up?'var(--ok)':'var(--bad)')+'">'+(b.up?'up':'DOWN')+'</div>'+
            '<div class="ev">'+(b.log.length?b.log.map(function(m){return w.acked.indexOf(m)>=0?'<b>'+m+'</b>':m;}).join(' '):'(empty log)')+'</div></div>';});
        h+='</div><p><b>Partition:</b> '+(w.leader?'<span class="tag ok">online, leader '+w.leader+'</span>':'<span class="tag bad">OFFLINE</span>')+
          ' &nbsp; <b>Acknowledged, missing from the leader\'s log:</b> '+(l.length?'<span class="tag bad">'+l.join(', ')+'</span>':'<span class="tag ok">none</span>')+' &nbsp; <b>On no disk anywhere:</b> '+(unrecoverable(w).length?'<span class="tag bad">'+unrecoverable(w).join(', ')+'</span>':'<span class="tag ok">none</span>')+'</p>'+
          '<p style="color:var(--muted)">Bold = acknowledged to the producer. <b>Safety</b> (nothing acknowledged is lost) and <b>liveness</b> (produces keep succeeding) are the two things to watch.</p>';
        document.getElementById('k-state').innerHTML=h;
        document.getElementById('k-log').innerHTML='<div class="tl" style="grid-template-columns:1fr"><div><h5>Event log</h5>'+
          w.events.map(function(e,i){return '<div class="ev '+e.k+'"><span class="t">'+(i+1)+'.</span><span>'+esc(e.t)+'</span></div>';}).join('')+'</div></div>';
      }
      reset();
    }
    var mh=document.getElementById('sim-kafka-matrix');
    if(mh){
      var rows=matrix(),h='<h4>Interactive 2 &middot; Same disaster, eight configurations</h4>'+
        '<p><b>Cascade:</b> five produces while brokers fail one by one, a stale replica comes back, then the original leader returns. <b>Leader dies, follower lagging:</b> m1 replicated, m2 produced, the leader dies before followers fetch m2. <b>Disk loss:</b> the two followers fail one by one, the lone leader keeps accepting writes if the settings allow it, then its disk is destroyed. (acks=1 runs assume failures outpace replication.)</p>'+
        '<table><tr><th>acks</th><th>min ISR</th><th>unclean</th><th>produces accepted</th><th>produces rejected or failed</th><th>acked lost: cascade</th><th>acked lost: leader dies, follower lagging</th><th>acked on no disk: ISR shrank to leader, then its disk died</th></tr>';
      rows.forEach(function(r){
        var cls=r.lost?'bad':(r.rejected?'warn':'ok');
        h+='<tr><td>'+r.acks+'</td><td>'+r.minIsr+'</td><td>'+(r.unclean?'true':'false')+'</td><td>'+r.accepted+' / '+r.attempts+'</td><td>'+r.rejected+'</td><td><span class="tag '+cls+'">'+r.lost+(r.lost?' ('+r.lostIds.join(', ')+')':'')+'</span></td><td><span class="tag '+(r.leaderDeathLost?'bad':'ok')+'">'+r.leaderDeathLost+'</span></td><td><span class="tag '+(r.diskLost?'bad':'ok')+'">'+r.diskLost+'</span></td></tr>';});
      mh.innerHTML=h+'</table>';
    }
  });
})();
