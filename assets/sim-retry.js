/* Lesson 0005 simulator: retry storms after an outage.
   Deterministic expected-value model (no randomness; jitter is modeled as an even spread over delay slots).
   One tick = one time unit. Each tick `rate` fresh requests arrive. The server has capacity `cap`, except during
   the outage window where its capacity is `outageCap`.
   ILLUSTRATIVE ASSUMPTION (stated in the lesson): even a rejected attempt costs the server real work (parsing,
   auth, queueing), a fraction `rejCost` of a served request. So when offered load exceeds capacity, useful
   work is served = (cap - rejCost*offered) / (1 - rejCost), floored at 0. This is a toy, not a measurement of
   any real service, and it does NOT model lock/contention effects (the setting of AWS's jitter experiments). */
(function(){
  var STRATS={
    none:{name:'No retries'},
    immediate:{name:'Retry immediately'},
    backoff:{name:'Exponential backoff, no jitter'},
    jitter:{name:'Exponential backoff + full jitter'},
    budget:{name:'Full jitter + retry budget'}
  };
  var LAB_STRATS=['none','immediate','jitter','budget']; /* backoff-vs-jitter is parameter-sensitive in this toy; see herd lab */
  function maxDelay(a,base,cap){return Math.min(cap,base*Math.pow(2,a));}
  function simulate(key,o){
    var T=o.horizon,due=[],i;
    for(i=0;i<T+200;i++)due.push({});               /* due[t][attempt] = count of requests attempting at t */
    var tokens=o.budgetCap,tot={fresh:0,attempts:0,ok:0,dropped:0},series=[],lastBad=-1;
    for(var t=0;t<T;t++){
      due[t][0]=(due[t][0]||0)+o.rate; tot.fresh+=o.rate;
      var offered=0,a; for(a in due[t])offered+=due[t][a];
      var inOut=(t>=o.outStart&&t<o.outStart+o.outLen), cap=inOut?o.outageCap:o.cap;
      var served=offered<=cap?offered:Math.max(0,(cap-o.rejCost*offered)/(1-o.rejCost));
      var p=offered>0?served/offered:0;
      tot.attempts+=offered; tot.ok+=served;
      series.push({t:t,fresh:o.rate,retries:offered-o.rate,offered:offered,served:served,out:inOut});
      if(offered>1.25*o.rate&&t>=o.outStart+o.outLen)lastBad=t;
      if(key==='budget')tokens=Math.min(o.budgetCap,tokens+0.1*served);
      for(a in due[t]){
        var cnt=due[t][a],fail=cnt*(1-p),att=parseInt(a,10);
        if(fail<=0)continue;
        if(key==='none'||att>=o.maxRetries){tot.dropped+=fail;continue;}
        if(key==='budget'){var allow=Math.min(fail,tokens);tokens-=allow;tot.dropped+=fail-allow;fail=allow;if(fail<=0)continue;}
        var md=maxDelay(att,o.base,o.capDelay);
        if(key==='immediate'){due[t+1][att+1]=(due[t+1][att+1]||0)+fail;}
        else if(key==='backoff'){due[t+md][att+1]=(due[t+md][att+1]||0)+fail;}
        else{for(var d=1;d<=md;d++)due[t+d][att+1]=(due[t+d][att+1]||0)+fail/md;} /* jitter / budget */
      }
    }
    var peak=0;series.forEach(function(s){if(s.offered>peak)peak=s.offered;});
    var end=o.outStart+o.outLen, rec=lastBad<0?0:(lastBad>=T-1?null:lastBad-end+1);
    return {series:series,peak:peak,amplification:tot.attempts/tot.fresh,successPct:100*tot.ok/tot.fresh,
      dropped:tot.dropped,recovery:rec};
  }
  var DEF={horizon:90,rate:100,cap:150,outStart:10,outLen:5,outageCap:0,maxRetries:5,base:2,capDelay:16,budgetCap:150,rejCost:0.2};
  window.RetrySim={STRATS:STRATS,LAB_STRATS:LAB_STRATS,simulate:simulate,defaults:DEF};
  /* HERD model: `n` clients all fail at the same instant (deploy, cache flush, failover blip) and each retries
     until it succeeds. Server serves `cap` attempts per tick; the rest fail and retry again. No other load.
     `rejCost` = fraction of a served request's work that a REJECTED attempt still consumes (0 = failures are free).
     Isolates the synchronization effect that jitter exists to break. */
  function herd(key,o){
    var due=[],i,t,a,d,series=[],calls=0,peak=0,last=0;
    for(i=0;i<o.horizon+o.capDelay+5;i++)due.push({});
    due[1][0]=o.n; /* first retry of everyone happens at tick 1 after the common failure at tick 0 */
    for(t=1;t<o.horizon;t++){
      var off=0;for(a in due[t])off+=due[t][a];
      var served=off<=o.cap?off:Math.max(0,(o.cap-o.rejCost*off)/(1-o.rejCost)),p=off>0?served/off:0;
      if(off>0){calls+=off;if(off>peak)peak=off;last=t;}
      series.push({t:t,offered:off,served:served});
      for(a in due[t]){
        var fail=due[t][a]*(1-p),att=parseInt(a,10);if(fail<=1e-9)continue;
        var md=maxDelay(att+1,o.base,o.capDelay);
        if(key==='immediate')due[t+1][att+1]=(due[t+1][att+1]||0)+fail;
        else if(key==='backoff')due[t+md][att+1]=(due[t+md][att+1]||0)+fail;
        else for(d=1;d<=md;d++)due[t+d][att+1]=(due[t+d][att+1]||0)+fail/md; /* full jitter: even spread over 1..md */
      }
    }
    var pend=0;for(i=o.horizon;i<due.length;i++)for(a in due[i])pend+=due[i][a];
    return {series:series,calls:calls,peak:peak,finish:last,callsPerClient:calls/o.n,finished:pend<0.5};
  }
  var HERD_DEF={n:1000,cap:100,base:1,capDelay:32,horizon:400,rejCost:0};
  window.RetrySim.herd=herd; window.RetrySim.herdDefaults=HERD_DEF;


  function esc(x){return String(x).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]});}
  document.addEventListener('DOMContentLoaded',function(){

    var hh=document.getElementById('sim-herd');
    if(hh){
      var hk='backoff', ho=Object.assign({},HERD_DEF);
      hh.innerHTML='<h4>Interactive 1 &middot; The thundering herd</h4>'+
        '<p><b>Lab A.</b> 1,000 clients all fail at the same instant. The server can serve 100 attempts per tick. Each client retries until it succeeds. Watch what the retry <i>schedule</i> does to the load the server sees.</p>'+
        '<div class="row"><label>What a rejected attempt costs the server (as a share of a real request): <b id="h-rcv"></b> <input id="h-rc" type="range" min="0" max="30" step="5" value="0"></label></div><div class="row" id="h-s"></div><div id="h-chart"></div><div id="h-tab"></div>';
      var hs=document.getElementById('h-s');
      ['immediate','backoff','jitter'].forEach(function(k){var b=document.createElement('button');b.className='btn ghost';b.dataset.k=k;
        b.textContent={immediate:'Retry immediately',backoff:'Exponential backoff, no jitter',jitter:'Exponential backoff + full jitter'}[k];
        b.onclick=function(){hk=k;hdraw();};hs.appendChild(b);});
      function hchart(r){
        var W=640,H=170,pad=26,n=Math.min(r.series.length,80),bw=(W-pad)/n,maxY=Math.max(r.peak,ho.cap)*1.08,y=function(v){return H-14-(v/maxY)*(H-26);},g='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto" role="img" aria-label="Attempts per tick">';
        for(var i=0;i<n;i++){var s=r.series[i],x=pad+i*bw;if(s.offered>0.5)g+='<rect x="'+x+'" y="'+y(s.offered)+'" width="'+Math.max(1,bw-1)+'" height="'+(H-14-y(s.offered))+'" fill="var(--bad)" opacity=".8"/>';}
        return g+'<line x1="'+pad+'" x2="'+W+'" y1="'+y(ho.cap)+'" y2="'+y(ho.cap)+'" stroke="var(--fg)" stroke-dasharray="4 3"/><text x="'+(pad+2)+'" y="'+(y(ho.cap)-3)+'" font-size="10" fill="var(--fg)">server capacity '+ho.cap+'/tick</text><text x="'+pad+'" y="'+(H-2)+'" font-size="10" fill="var(--muted)">first 80 ticks &rarr; attempts arriving per tick</text></svg>';
      }
      function hdraw(){
        ho.rejCost=(+document.getElementById('h-rc').value)/100; document.getElementById('h-rcv').textContent=Math.round(ho.rejCost*100)+'%';
        [].forEach.call(hs.children,function(b){b.classList.toggle('sel',b.dataset.k===hk)});
        document.getElementById('h-chart').innerHTML=hchart(herd(hk,ho));
        var h='<table><tr><th>Strategy</th><th>Peak attempts in one tick</th><th>Total calls per client</th><th>Everyone served by tick</th></tr>';
        ['immediate','backoff','jitter'].forEach(function(k){var r=herd(k,ho),nm={immediate:'Retry immediately',backoff:'Exponential backoff, no jitter',jitter:'Exponential backoff + full jitter'}[k];
          h+='<tr'+(k===hk?' style="background:var(--accent-soft)"':'')+'><td>'+nm+'</td><td>'+r.peak.toFixed(0)+'</td><td>'+r.callsPerClient.toFixed(1)+'</td><td>'+(r.finished?r.finish:'<span class="tag bad">not within '+ho.horizon+' ticks</span>')+'</td></tr>';});
        document.getElementById('h-tab').innerHTML=h+'</table>';
      }
      document.getElementById('h-rc').oninput=hdraw;
      hdraw();
    }
    var host=document.getElementById('sim-retry'); if(!host) return;
    var cur='immediate', o=Object.assign({},DEF);
    host.innerHTML='<h4>Interactive 2 &middot; Outage and retry amplification</h4>'+
      '<p><b>Lab B.</b> A service handles 100 requests per tick with capacity 150. It goes completely down for a few ticks, then comes back. Same outage, four client behaviors. Try raising max retries and outage length.</p>'+
      '<div class="row"><label>Outage length: <b id="r-ol"></b> ticks <input id="r-o" type="range" min="1" max="15" value="5"></label>'+
      '<label>Max retries per request: <b id="r-mr"></b> <input id="r-m" type="range" min="1" max="12" value="5"></label></div>'+
      '<div class="row" id="r-s"></div><div id="r-chart"></div><div id="r-tab"></div>';
    var sb=document.getElementById('r-s');
    LAB_STRATS.forEach(function(k){var b=document.createElement('button');b.className='btn ghost';b.dataset.k=k;b.textContent=STRATS[k].name;
      b.onclick=function(){cur=k;draw();};sb.appendChild(b);});
    function chart(r){
      var W=640,H=190,pad=26,n=r.series.length,bw=(W-pad)/n,maxY=Math.max(r.peak,o.cap)*1.08,y=function(v){return H-14-(v/maxY)*(H-26);};
      var g='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto" role="img" aria-label="Offered load per tick">';
      r.series.forEach(function(s,i){var x=pad+i*bw;
        if(s.out)g+='<rect x="'+x+'" y="0" width="'+bw+'" height="'+(H-14)+'" fill="var(--warn-soft)"/>';
        g+='<rect x="'+x+'" y="'+y(s.fresh)+'" width="'+Math.max(1,bw-1)+'" height="'+(H-14-y(s.fresh))+'" fill="var(--ok)" opacity=".75"/>';
        if(s.retries>0.5)g+='<rect x="'+x+'" y="'+y(s.offered)+'" width="'+Math.max(1,bw-1)+'" height="'+(y(s.fresh)-y(s.offered))+'" fill="var(--bad)" opacity=".8"/>';});
      g+='<line x1="'+pad+'" x2="'+W+'" y1="'+y(o.cap)+'" y2="'+y(o.cap)+'" stroke="var(--fg)" stroke-dasharray="4 3"/>'+
        '<text x="'+(pad+2)+'" y="'+(y(o.cap)-3)+'" font-size="10" fill="var(--fg)">capacity '+o.cap+'</text>'+
        '<text x="'+pad+'" y="'+(H-2)+'" font-size="10" fill="var(--muted)">time &rarr; (shaded = outage; green = fresh requests, red = retries)</text></svg>';
      return g;
    }
    function draw(){
      o.outLen=+document.getElementById('r-o').value;o.maxRetries=+document.getElementById('r-m').value;
      document.getElementById('r-ol').textContent=o.outLen;document.getElementById('r-mr').textContent=o.maxRetries;
      [].forEach.call(sb.children,function(b){b.classList.toggle('sel',b.dataset.k===cur)});
      document.getElementById('r-chart').innerHTML=chart(simulate(cur,o));
      var h='<table><tr><th>Strategy</th><th>Peak offered load</th><th>Attempts per request</th><th>Requests succeeded</th><th>Recovery after outage</th></tr>';
      LAB_STRATS.forEach(function(k){var r=simulate(k,o);
        h+='<tr'+(k===cur?' style="background:var(--accent-soft)"':'')+'><td>'+esc(STRATS[k].name)+'</td><td>'+r.peak.toFixed(0)+'</td><td>'+r.amplification.toFixed(2)+'&times;</td><td>'+r.successPct.toFixed(0)+'%</td><td>'+(r.recovery===null?'<span class="tag bad">not within '+o.horizon+' ticks</span>':r.recovery+' ticks')+'</td></tr>';});
      document.getElementById('r-tab').innerHTML=h+'</table>';
    }
    ['r-o','r-m'].forEach(function(id){document.getElementById(id).oninput=draw;});
    draw();
  });
})();
