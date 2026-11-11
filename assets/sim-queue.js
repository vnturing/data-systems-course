/* Lesson 0009: a single-server FIFO queue simulated with Lindley's recursion, checked against closed forms.
   Mean service time is 1 unit, so utilization rho = arrival rate. Poisson arrivals; service-time shape is a parameter:
   deterministic (SCV 0), exponential (SCV 1), hyperexponential (SCV 4). Seeded, deterministic. */
(function(){
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  var P1=0.5*(1+Math.sqrt(3/5)),MU1=2*P1,MU2=2*(1-P1); /* balanced-means H2: mean 1, SCV 4 */
  var DISTS={
    det:{name:'Deterministic (every request takes the same time)',scv:0,draw:function(r){return 1;}},
    exp:{name:'Exponential (the textbook M/M/1 case)',scv:1,draw:function(r){return -Math.log(1-r());}},
    h2:{name:'High variance (SCV 4: mostly quick, occasionally very slow)',scv:4,draw:function(r){return r()<P1?-Math.log(1-r())/MU1:-Math.log(1-r())/MU2;}}
  };
  function simulate(rho,dist,n,seed){
    var r=rng(seed||5),d=DISTS[dist],w=0,resp=new Float64Array(n),warm=Math.floor(n*0.05),k=0,sum=0;
    for(var i=0;i<n;i++){
      var s=d.draw(r),a=-Math.log(1-r())/rho;           /* next inter-arrival ~ Exp(rate rho) */
      var rt=w+s; if(i>=warm){resp[k++]=rt;sum+=rt;}
      w=Math.max(0,w+s-a);
    }
    var a2=Array.prototype.slice.call(resp,0,k).sort(function(x,y){return x-y;});
    function q(p){return a2[Math.min(a2.length-1,Math.floor(p*a2.length))];}
    return {rho:rho,mean:sum/k,p50:q(.5),p99:q(.99),p999:q(.999)};
  }
  /* Pollaczek-Khinchine mean response time for M/G/1 with mean service 1 and squared coefficient of variation scv */
  function theoryMean(rho,scv){return 1+rho*(1+scv)/(2*(1-rho));}
  function theoryP99Exp(rho){return Math.log(100)/(1-rho);}  /* M/M/1 FCFS: response time ~ Exp(mean 1/(1-rho)) */
  /* Little's law: average number in system L = arrival rate * average time in system W */
  function little(ratePerSec,seconds){return ratePerSec*seconds;}
  window.QueueSim={DISTS:DISTS,simulate:simulate,theoryMean:theoryMean,theoryP99Exp:theoryP99Exp,little:little};

  document.addEventListener('DOMContentLoaded',function(){
    var h=document.getElementById('sim-queue');
    if(h){
      var cur='exp',RH=[0.3,0.5,0.7,0.8,0.9,0.95,0.99],cache={};
      h.innerHTML='<h4>Interactive 1 &middot; The latency cliff</h4><p>Every row is a fresh simulation of 300,000 requests. Times are in multiples of the <i>average service time</i> (so 1.0 = no waiting at all).</p><div class="row" id="q-d"></div><div id="q-chart"></div><div id="q-tab"></div>';
      var db=document.getElementById('q-d');
      Object.keys(DISTS).forEach(function(k){var b=document.createElement('button');b.className='btn ghost';b.dataset.k=k;b.textContent=DISTS[k].name;b.onclick=function(){cur=k;draw();};db.appendChild(b);});
      function draw(){
        [].forEach.call(db.children,function(b){b.classList.toggle('sel',b.dataset.k===cur);});
        var rows=cache[cur]||(cache[cur]=RH.map(function(r){return simulate(r,cur,300000,5);})),scv=DISTS[cur].scv;
        var W=640,H=190,pad=34,maxY=60,x=function(r){return pad+(r-0.25)/(1.0-0.25)*(W-pad-10);},y=function(v){return H-18-Math.min(v,maxY)/maxY*(H-30);};
        var g='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto" role="img" aria-label="Response time versus utilization">';
        [[10,'10'],[30,'30'],[60,'60+']].forEach(function(t){g+='<line x1="'+pad+'" x2="'+(W-10)+'" y1="'+y(t[0])+'" y2="'+y(t[0])+'" stroke="var(--rule)"/><text x="2" y="'+(y(t[0])+3)+'" font-size="10" fill="var(--muted)">'+t[1]+'x</text>';});
        function line(key,col){var d='';rows.forEach(function(r,i){d+=(i?'L':'M')+x(r.rho)+','+y(r[key]);});return '<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2"/>';}
        g+=line('mean','var(--ok)')+line('p99','var(--bad)');
        rows.forEach(function(r){g+='<text x="'+x(r.rho)+'" y="'+(H-4)+'" font-size="10" text-anchor="middle" fill="var(--muted)">'+Math.round(r.rho*100)+'%</text>';});
        g+='<text x="'+(pad+6)+'" y="14" font-size="11" fill="var(--ok)">mean</text><text x="'+(pad+50)+'" y="14" font-size="11" fill="var(--bad)">p99</text></svg>';
        document.getElementById('q-chart').innerHTML=g;
        var t='<table><tr><th>Utilization</th><th>Mean (simulated)</th><th>Mean (formula)</th><th>p50</th><th>p99</th><th>p99.9</th></tr>';
        rows.forEach(function(r){t+='<tr><td>'+Math.round(r.rho*100)+'%</td><td>'+r.mean.toFixed(1)+'x</td><td>'+theoryMean(r.rho,scv).toFixed(1)+'x</td><td>'+r.p50.toFixed(1)+'x</td><td>'+r.p99.toFixed(1)+'x</td><td>'+r.p999.toFixed(1)+'x</td></tr>';});
        document.getElementById('q-tab').innerHTML=t+'</table><p style="color:var(--muted)">The 99% row is noisy: near saturation the queue takes very long to settle, so even 300,000 requests give a wide error band. The seed is fixed so the page is reproducible.</p>';
      }
      draw();
    }
    var l=document.getElementById('sim-little');
    if(l){
      l.innerHTML='<h4>Interactive 2 &middot; Little&rsquo;s law: how many requests are in flight?</h4>'+
        '<div class="row"><label>Request rate: <b id="lt-rv"></b> req/s <input id="lt-r" type="range" min="10" max="5000" step="10" value="500"></label>'+
        '<label>Average time per request: <b id="lt-wv"></b> ms <input id="lt-w" type="range" min="5" max="2000" step="5" value="40"></label></div><div id="lt-out"></div>';
      function d2(){var r=+document.getElementById('lt-r').value,w=+document.getElementById('lt-w').value;
        document.getElementById('lt-rv').textContent=r;document.getElementById('lt-wv').textContent=w;
        document.getElementById('lt-out').innerHTML='<p>Average requests in flight: <b>'+little(r,w/1000).toFixed(1)+'</b>. If the downstream gets 4&times; slower: <b>'+little(r,4*w/1000).toFixed(1)+'</b>. Any pool, thread or connection limit smaller than that number becomes the new bottleneck, even though your request <i>rate</i> never changed.</p>';}
      ['lt-r','lt-w'].forEach(function(id){document.getElementById(id).oninput=d2;});d2();
    }
  });
})();
