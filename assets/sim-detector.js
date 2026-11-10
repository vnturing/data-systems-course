/* Lesson 0003 simulator: timeout-based failure detector under partial synchrony.
   A node sends a heartbeat every `interval` seconds. Network delay is mostly small, with occasional
   correlated stalls (GC pause, queueing, congestion). The detector suspects the node if no heartbeat has arrived
   for `timeout` seconds. All parameters are ILLUSTRATIVE, not measurements of any real system. */
(function(){
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  /* Returns send times and arrival times. A "stall" (GC pause, congestion episode, failover blip) is
     correlated: every heartbeat sent during the stall is held until it ends. Independent per-message
     delays would never create a gap, because the next heartbeat still arrives on time. */
  function trace(o){
    var r=rng(o.seed||42), n=Math.floor(o.horizon/o.interval), sends=[], arr=[], stallEnd=-1;
    for(var k=0;k<n;k++){
      var t=k*o.interval;
      if(t>=stallEnd && r()<o.spikeP){
        var L=o.heavy?Math.min(300,0.5/Math.pow(1-r(),1/1.3))   /* Pareto-like tail: no practical upper bound */
                     :0.5+r()*(o.spikeMax-0.5);                  /* bounded: a known worst case exists */
        stallEnd=t+L;
      }
      var d=0.02-0.03*Math.log(1-r());               /* ~20ms base + exp(mean 30ms) */
      sends.push(t); arr.push(Math.max(t,t<stallEnd?stallEnd:t)+d);
    }
    return {sends:sends,arr:arr};
  }
  /* false suspicions for a given timeout; mean/p99 detection delay for a real crash */
  function evaluate(tr,o,T){
    var sorted=tr.arr.slice().sort(function(a,b){return a-b;}), fs=0, i;
    for(i=1;i<sorted.length;i++) if(sorted[i]-sorted[i-1]>T) fs++;
    var det=[], runMax=-Infinity;
    for(i=0;i<tr.sends.length-1;i++){
      runMax=Math.max(runMax,tr.arr[i]);
      var crash=tr.sends[i]+o.interval*0.5;           /* crash mid-interval after beat i was sent */
      det.push(runMax+T-crash);
    }
    det.sort(function(a,b){return a-b;});
    var mean=det.reduce(function(a,b){return a+b;},0)/det.length;
    return {T:T,falsePerDay:fs*86400/o.horizon,meanDetect:mean,p99Detect:det[Math.floor(det.length*0.99)]};
  }
  function sweep(o,Ts){
    var tr=trace(o); return Ts.map(function(T){
      var e=evaluate(tr,o,T);
      e.pain=e.falsePerDay*o.failoverCost+o.crashesPerDay*e.meanDetect; return e;});
  }
  window.DetectorSim={trace:trace,evaluate:evaluate,sweep:sweep,
    defaults:{heavy:false,interval:1,horizon:86400,spikeP:0.001,spikeMax:8,seed:42,failoverCost:15,crashesPerDay:3}};

  document.addEventListener('DOMContentLoaded',function(){
    var host=document.getElementById('sim-detector'); if(!host) return;
    var o=Object.assign({},DetectorSim.defaults), Ts=[1.5,2,3,5,8,12,20,30,60];
    host.innerHTML='<h4>Interactive &middot; Failure-detector lab (one simulated day, heartbeat every second)</h4>'+
      '<p>Each row is one timeout setting applied to the <i>same</i> day of traffic. A &ldquo;false suspicion&rdquo; is a healthy node declared dead. &ldquo;Detection delay&rdquo; is how long a real crash goes unnoticed.</p>'+
      '<div class="row"><label>Stall frequency: a stall starts at <b id="d-sp"></b> of heartbeats (bounded mode: 0.5 to 8 s long) <input id="d-sps" type="range" min="0" max="20" step="1" value="2"></label></div>'+
      '<div class="row"><label>Cost of one false failover: <input id="d-fc" type="number" value="15" min="0" style="width:4.5rem"> s of disruption</label>'+
      '<label>Real crashes per day: <input id="d-cr" type="number" value="3" min="0" step="0.5" style="width:4.5rem"></label></div>'+
      '<label class="opt" style="max-width:34rem"><input type="checkbox" id="d-heavy"> Heavy-tailed stalls: no known upper bound (closer to real systems)</label><div id="d-out"></div>';
    function draw(){
      o.spikeP=parseInt(document.getElementById('d-sps').value,10)*0.0005;
      o.heavy=document.getElementById('d-heavy').checked; o.failoverCost=+document.getElementById('d-fc').value; o.crashesPerDay=+document.getElementById('d-cr').value;
      document.getElementById('d-sp').textContent=(o.spikeP*100).toFixed(1)+'%';
      var rows=sweep(o,Ts), best=0; rows.forEach(function(r,i){if(r.pain<rows[best].pain)best=i;});
      var h='<table><tr><th>Timeout</th><th>False suspicions / day</th><th>Mean detection delay</th><th>p99 delay</th><th>Disruption / day (s)</th></tr>';
      rows.forEach(function(r,i){
        h+='<tr'+(i===best?' style="background:var(--ok-soft)"':'')+'><td><b>'+r.T+' s</b></td><td>'+r.falsePerDay.toFixed(1)+'</td><td>'+r.meanDetect.toFixed(1)+' s</td><td>'+r.p99Detect.toFixed(1)+' s</td><td>'+r.pain.toFixed(0)+(i===best?' &larr; lowest':'')+'</td></tr>';
      });
      document.getElementById('d-out').innerHTML=h+'</table><p style="color:var(--muted)">Disruption = false suspicions &times; failover cost + real crashes &times; mean detection delay. The best timeout moves when you change the inputs; it is a business decision with a measurable shape, not a constant.</p>';
    }
    ['d-sps','d-fc','d-cr'].forEach(function(id){document.getElementById(id).oninput=draw;});
    document.getElementById('d-heavy').onchange=draw;
    draw();
  });
})();
