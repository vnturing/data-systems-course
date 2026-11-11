/* Lesson 0006: redundancy masks independent faults, not common-mode ones; plus the fault/error/failure drill.
   Model: each replica is unavailable with probability p, independently, EXCEPT that with probability c a
   common-mode fault (same zone, same bad deploy, same bug) takes every replica out at once.
   ILLUSTRATIVE: p and c are inputs, not measurements. Failover is assumed instantaneous and perfect. */
(function(){
  var SCHEMES={
    single:{name:'1 replica',f:function(p){return p;}},
    any2:{name:'2 replicas, either can serve (perfect failover)',f:function(p){return p*p;}},
    maj3:{name:'3 replicas, need a majority (2 of 3)',f:function(p){return 3*p*p-2*p*p*p;}},
    any3:{name:'3 replicas, any one can serve',f:function(p){return p*p*p;}}
  };
  function unavailability(key,p,c){return c+(1-c)*SCHEMES[key].f(p);}
  function minutesPerYear(u){return u*525600;}
  window.RedundancySim={SCHEMES:SCHEMES,unavailability:unavailability,minutesPerYear:minutesPerYear};

  /* Drill: classify each statement as Fault / Error / Failure / Masked (relative to a stated boundary). */
  var DRILL=[
    {s:'A config with a mistyped timeout value is deployed to the checkout service.',a:0,
     why:'A fault is the adjudged or hypothesized cause of an error. The bad config is the cause; nothing has gone wrong in the running state yet (a dormant fault).'},
    {s:'The service loads it. Its connection pool is now sized to 1 in memory.',a:1,
     why:'An error is the part of the system state that may lead to a service failure. The wrong in-memory value is the error; customers have not noticed yet.'},
    {s:'Customers receive HTTP 500 on checkout.',a:2,
     why:'A failure is a deviation of the delivered service from correct service. This is what the customer sees.'},
    {s:'Seen from your checkout service: the payment provider returns 503 for two minutes.',a:0,
     why:'Failure of a component you depend on is a fault from your system\'s point of view: the possible cause of errors in yours. The same event is a failure (of the provider\'s service) and a fault (for you). It depends on where you draw the boundary.'},
    {s:'Your retry logic absorbs that 503 and the customer sees a normal confirmation.',a:3,
     why:'The error was detected and handled before it reached the service interface. That is fault tolerance doing its job: a fault and an error occurred, but no service failure.'},
    {s:'A replica silently holds stale data because its replication stream lagged. Nothing has read it yet.',a:1,
     why:'Wrong state that has not yet been noticed or used is a latent error. It becomes a failure only if it propagates to the service interface.'}
  ];
  window.RedundancySim.DRILL=DRILL;

  function esc(x){return String(x).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]});}
  document.addEventListener('DOMContentLoaded',function(){
    var d=document.getElementById('sim-drill');
    if(d){
      var labels=['Fault','Error','Failure','No failure (error masked)'];
      d.innerHTML='<h4>Interactive 1 &middot; Fault, error, failure: classify each step</h4><p>One incident, told in six steps. Classify each step. Commit to an answer before reading the explanation.</p>';
      DRILL.forEach(function(it,i){
        var box=document.createElement('div');box.className='q';
        box.innerHTML='<div class="n">Step '+(i+1)+'</div><div class="p">'+esc(it.s)+'</div>';
        var fb=document.createElement('div');fb.className='fb';var btns=[];
        labels.forEach(function(l,j){var b=document.createElement('button');b.className='o';b.type='button';b.textContent=l;
          b.onclick=function(){if(box.dataset.done)return;box.dataset.done='1';btns.forEach(function(x,k){x.disabled=true;if(k===it.a)x.classList.add('right');});
            if(j===it.a)fb.innerHTML='<b style="color:var(--ok)">Right.</b> ';else{b.classList.add('wrong');fb.innerHTML='<b style="color:var(--bad)">Not quite.</b> ';}
            fb.appendChild(document.createTextNode(it.why));};
          btns.push(b);box.appendChild(b);});
        box.appendChild(fb);d.appendChild(box);
      });
    }
    var h=document.getElementById('sim-redundancy');
    if(h){
      h.innerHTML='<h4>Interactive 2 &middot; What redundancy buys, and what it cannot</h4>'+
        '<div class="row"><label>Chance a single replica is down: <b id="rd-pv"></b> <input id="rd-p" type="range" min="1" max="50" value="10"></label></div>'+
        '<div class="row"><label>Chance of a common-mode fault (takes every replica out at once): <b id="rd-cv"></b> <input id="rd-c" type="range" min="0" max="20" value="0"></label></div><div id="rd-out"></div>';
      function draw(){
        var p=parseInt(document.getElementById('rd-p').value,10)/1000,c=parseInt(document.getElementById('rd-c').value,10)/10000;
        document.getElementById('rd-pv').textContent=(p*100).toFixed(1)+'%';document.getElementById('rd-cv').textContent=(c*100).toFixed(2)+'%';
        var t='<table><tr><th>Design</th><th>Unavailability</th><th>Availability</th><th>Downtime per year</th></tr>';
        Object.keys(SCHEMES).forEach(function(k){var u=unavailability(k,p,c),m=minutesPerYear(u);
          t+='<tr><td>'+esc(SCHEMES[k].name)+'</td><td>'+(u*100).toPrecision(3)+'%</td><td>'+((1-u)*100).toFixed(4)+'%</td><td>'+(m>=120?(m/60).toFixed(1)+' hours':m.toFixed(1)+' minutes')+'</td></tr>';});
        document.getElementById('rd-out').innerHTML=t+'</table><p style="color:var(--muted)">With the common-mode slider at zero, each extra replica is a huge win. Raise it: every design converges on the same floor, because the replicas share the fault.</p>';
      }
      ['rd-p','rd-c'].forEach(function(id){document.getElementById(id).oninput=draw;});draw();
    }
  });
})();
