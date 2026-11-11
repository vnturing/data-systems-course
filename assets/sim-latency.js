/* Lesson 0007 simulators: (1) why averages and averaged percentiles lie, (2) fan-out and hedged requests,
   (3) coordinated omission. Synthetic latencies: a fast mode and a rare slow mode. All parameters illustrative. */
(function(){
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function gauss(r){var u=1-r(),v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
  /* latency in ms: lognormal fast mode (median 50) with probability 1-slowFrac, lognormal slow mode (median 2000) otherwise */
  function sample(r,o){var slow=r()<o.slowFrac;return slow?2000*Math.exp(0.2*gauss(r)):50*Math.exp(0.25*gauss(r));}
  function samples(n,o,seed){var r=rng(seed||7),a=new Array(n);for(var i=0;i<n;i++)a[i]=sample(r,o);return a;}
  function pct(sorted,q){return sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))];}
  function stats(a){var s=a.slice().sort(function(x,y){return x-y;}),m=0;for(var i=0;i<a.length;i++)m+=a[i];
    return {n:a.length,mean:m/a.length,p50:pct(s,.5),p90:pct(s,.9),p99:pct(s,.99),p999:pct(s,.999),max:s[s.length-1]};}
  /* P(at least one of N independent calls is slow) when each is slow with probability q */
  function fanoutSlowProb(q,N){return 1-Math.pow(1-q,N);}
  /* Fan-out: a user request waits for the slowest of N backend calls. hedge: if a call is still outstanding
     after `hedgeAfter` ms, send a second copy and take whichever finishes first. */
  function fanout(N,o,hedgeAfter,trials,seed){
    var r=rng(seed||11),res=new Array(trials),calls=0,extra=0;
    for(var t=0;t<trials;t++){var mx=0;
      for(var i=0;i<N;i++){var l=sample(r,o);calls++;
        if(hedgeAfter&&l>hedgeAfter){extra++;l=Math.min(l,hedgeAfter+sample(r,o));}
        if(l>mx)mx=l;}
      res[t]=mx;}
    var s=stats(res);s.extraLoad=hedgeAfter?extra/calls:0;return s;
  }
  /* Coordinated omission. Server: one FIFO worker, service time `service` ms, frozen during [stallAt, stallAt+stallLen).
     Open loop: requests are issued on schedule; latency is measured from the scheduled time.
     Closed loop: the next request is issued only after the previous reply, never earlier than `interval` after the previous send. */
  function co(o){
    function finishAt(start){var s=start;if(s>=o.stallAt&&s<o.stallAt+o.stallLen)s=o.stallAt+o.stallLen;return s+o.service;}
    var open=[],closed=[],i,prev=0,comp;
    for(i=0;i<o.n;i++){var sched=i*o.interval,st=Math.max(sched,prev);comp=finishAt(st);prev=comp;open.push(comp-sched);}
    var send=0,pc=0;prev=0;
    while(send<o.n*o.interval){var start=Math.max(send,pc);comp=finishAt(start);closed.push(comp-send);pc=comp;send=Math.max(send+o.interval,comp);}
    return {open:stats(open),closed:stats(closed)};
  }
  var DEF={slowFrac:0.012},COD={n:10000,interval:1,service:0.5,stallAt:5000,stallLen:500};
  window.LatencySim={rng:rng,samples:samples,stats:stats,fanoutSlowProb:fanoutSlowProb,fanout:fanout,co:co,defaults:DEF,coDefaults:COD};

  function f(x){return x>=100?x.toFixed(0):x.toFixed(1);}
  document.addEventListener('DOMContentLoaded',function(){
    var a=document.getElementById('sim-percentiles');
    if(a){
      a.innerHTML='<h4>Interactive 1 &middot; One minute of traffic, five different numbers</h4>'+
        '<div class="row"><label>Share of requests that stall: <b id="pc-sv"></b> <input id="pc-s" type="range" min="0" max="40" value="12"></label></div><div id="pc-out"></div>';
      function draw(){var sf=parseInt(document.getElementById('pc-s').value,10)/1000;document.getElementById('pc-sv').textContent=(sf*100).toFixed(1)+'%';
        var o={slowFrac:sf},A=samples(50000,o,7),B=samples(50000,{slowFrac:sf*0.1},8),sa=stats(A),sb=stats(B);
        var fleet=stats(A.concat(B)),avg=(sa.p99+sb.p99)/2;
        a.querySelector('#pc-out').innerHTML='<table><tr><th>Statistic (ms)</th><th>Host A (stall-prone)</th><th>Host B (healthy)</th><th>Fleet of A+B</th></tr>'+
          ['mean','p50','p90','p99','p999'].map(function(k){return '<tr><td>'+({p999:'p99.9'}[k]||k)+'</td><td>'+f(sa[k])+'</td><td>'+f(sb[k])+'</td><td>'+f(fleet[k])+'</td></tr>';}).join('')+'</table>'+
          '<p><b>Average of the two hosts&rsquo; p99s:</b> '+f(avg)+' ms &nbsp; <b>True fleet p99:</b> '+f(fleet.p99)+' ms. <span style="color:var(--muted)">A percentile of percentiles is not the percentile of anything. Merge histograms, never percentiles.</span></p>'+
          '<p style="color:var(--muted)">The mean sits in a region where almost no request actually lives. Watch it relative to p50 and p99 as you move the slider.</p>';}
      document.getElementById('pc-s').oninput=draw;draw();
    }
    var b=document.getElementById('sim-fanout-tail');
    if(b){
      b.innerHTML='<h4>Interactive 2 &middot; Fan-out and hedged requests</h4>'+
        '<p>Each backend call is slow about 1.2% of the time. A user request calls <i>N</i> backends in parallel and waits for all of them.</p>'+
        '<div class="row"><label>Backends per request (N): <b id="fo-nv"></b> <input id="fo-n" type="range" min="0" max="3" value="2"></label></div><div id="fo-out"></div>';
      var NS=[1,10,100,1000];
      function draw2(){var N=NS[parseInt(document.getElementById('fo-n').value,10)];document.getElementById('fo-nv').textContent=N;
        var trials=Math.min(50000,Math.max(2000,Math.floor(200000/N))),base=fanout(N,DEF,0,trials,11);
        var sorted=samples(100000,DEF,9).sort(function(x,y){return x-y;}),h95=pct(sorted,0.95),hh=fanout(N,DEF,h95,trials,11);
        document.getElementById('fo-out').innerHTML='<table><tr><th></th><th>p50</th><th>p99</th><th>Extra calls sent</th></tr>'+
          '<tr><td>Plain</td><td>'+f(base.p50)+' ms</td><td>'+f(base.p99)+' ms</td><td>0%</td></tr>'+
          '<tr><td>Hedged after the single-call p95 ('+f(h95)+' ms)</td><td>'+f(hh.p50)+' ms</td><td>'+f(hh.p99)+' ms</td><td>'+(hh.extraLoad*100).toFixed(1)+'%</td></tr></table>'+
          '<p><b>Chance a user request hits at least one slow call:</b> '+(fanoutSlowProb(0.012,N)*100).toFixed(1)+'% <span style="color:var(--muted)">(1 &minus; 0.988<sup>N</sup>)</span></p>';}
      document.getElementById('fo-n').oninput=draw2;draw2();
    }
    var c=document.getElementById('sim-co');
    if(c){
      var r=co(COD);
      c.innerHTML='<h4>Interactive 3 &middot; Coordinated omission</h4><p>A load test targets 1 request per millisecond against a server that freezes for 500 ms once. Same server, same freeze, two load generators.</p>'+
        '<table><tr><th>Generator</th><th>Samples recorded</th><th>p50</th><th>p99</th><th>p99.9</th><th>Max</th></tr>'+
        [['Closed loop (waits for each reply before sending the next)',r.closed],['Open loop (sends on schedule, measures from the scheduled time)',r.open]].map(function(x){
          return '<tr><td>'+x[0]+'</td><td>'+x[1].n+'</td><td>'+f(x[1].p50)+' ms</td><td>'+f(x[1].p99)+' ms</td><td>'+f(x[1].p999)+' ms</td><td>'+f(x[1].max)+' ms</td></tr>';}).join('')+'</table>'+
        '<p style="color:var(--muted)">The closed-loop tool is not wrong about the requests it measured. It omitted the ~500 requests that would have been sent during the freeze, which are exactly the ones that would have been slow.</p>';
    }
  });
})();
