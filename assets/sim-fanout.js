/* Lesson 0008: fan-out on write vs fan-out on read vs hybrid, as a two-objective cost model.
   Objective 1: total work per day (inserts + read-time merges).
   Objective 2: worst-case delivery time of ONE tweet fanned out on the write path = followers / insert throughput.
   Followers per author follow a capped Pareto distribution, integrated over log-spaced quantile bins so the
   extreme tail (the celebrity accounts) is represented. Deterministic: no randomness.
   EVERY PARAMETER IS ILLUSTRATIVE. Published figures for Twitter vary between sources, so none are baked in. */
(function(){
  var DEF={users:1e8,alpha:1.2,fmin:20,capFrac:0.3,tweetsPerUser:3,readsPerUser:60,insertCost:1,mergeCost:0.2,
           insertRate:50000,deadline:5,bins:4000};
  /* returns [{f, authors}] ; authors = number of authors represented by the bin */
  function bins(o){
    var out=[],U=o.users,K=o.bins,cap=o.capFrac*U,lo=Math.log(1/U);
    var j;
    /* bin boundaries in u = 1-q space, geometric from 1 down to 1/U, then one final bin [0,1/U] */
    var edges=[1];for(j=1;j<=K;j++)edges.push(Math.exp(lo*(j/K)));edges.push(0);
    for(j=0;j<edges.length-1;j++){
      var hi=edges[j],lw=edges[j+1],mass=hi-lw,mid=lw>0?Math.sqrt(hi*lw):hi*0.5;
      if(j===edges.length-2)mid=0.5/U;      /* the very top sliver: one author's worth */
      var f=Math.max(1,Math.min(cap,o.fmin*Math.pow(mid,-1/o.alpha)));
      out.push({f:f,authors:mass*U});
    }
    return out;
  }
  function row(B,o,T){ /* authors with f < T fan out on write; f >= T are read-merged. T=0 => pure pull; T=Infinity => pure push */
    var ins=0,celeb=0,maxBurst=0,k;
    for(k=0;k<B.length;k++){var b=B[k];
      if(b.f<T){ins+=b.f*b.authors;if(b.f>maxBurst)maxBurst=b.f;}else celeb+=b.f*b.authors;}
    var writes=o.tweetsPerUser*ins*o.insertCost,reads=o.readsPerUser*o.users*(1+o.mergeCost*celeb/o.users),secs=maxBurst/o.insertRate;
    return {T:T,writes:writes,reads:reads,total:writes+reads,maxBurst:maxBurst,burstSeconds:secs,feasible:secs<=o.deadline,celebFollowees:celeb/o.users};
  }
  var THRESH=[0,100,1e3,1e4,1e5,1e6,1e7,Infinity];
  function model(o){
    var B=bins(o),edges=0,maxF=0;B.forEach(function(b){edges+=b.f*b.authors;if(b.f>maxF)maxF=b.f;});
    var rows=THRESH.map(function(T){return row(B,o,T);}),best=null;
    rows.forEach(function(r){if(r.feasible&&(!best||r.total<best.total))best=r;});
    var cheapest=rows.reduce(function(a,r){return r.total<a.total?r:a;},rows[0]);
    return {meanF:edges/o.users,maxF:maxF,rows:rows,bestFeasible:best,cheapest:cheapest,
            pull:rows[0],push:rows[rows.length-1],bins:B};
  }
  window.FanoutSim={defaults:DEF,model:model,row:row,bins:bins,thresholds:THRESH};

  function fmt(x){if(x===Infinity)return '&infin;';return x>=1e12?(x/1e12).toFixed(2)+'T':x>=1e9?(x/1e9).toFixed(1)+'B':x>=1e6?(x/1e6).toFixed(1)+'M':x>=1e3?(x/1e3).toFixed(0)+'K':x.toFixed(0);}
  function secs(s){return s>=1?s.toFixed(1)+' s':(s*1000).toFixed(0)+' ms';}
  document.addEventListener('DOMContentLoaded',function(){
    var h=document.getElementById('sim-fanout');if(!h)return;
    h.innerHTML='<h4>Interactive &middot; Two objectives, one threshold (a 100-million-user network, per day)</h4>'+
      '<div class="row"><label>Timeline reads per user per day: <b id="fa-rv"></b> <input id="fa-r" type="range" min="1" max="200" value="60"></label></div>'+
      '<div class="row"><label>Cost of merging one read-time account, relative to a timeline insert: <b id="fa-mv"></b> <input id="fa-m" type="range" min="1" max="50" value="20"></label></div>'+
      '<div class="row"><label>Insert throughput for one tweet&rsquo;s fan-out: <b id="fa-iv"></b> <input id="fa-i" type="range" min="1" max="40" value="5"></label>'+
      '<label>Delivery deadline: <b id="fa-dv"></b> <input id="fa-d" type="range" min="1" max="30" value="5"></label></div><div id="fa-out"></div>';
    function draw(){
      var o=Object.assign({},DEF);o.readsPerUser=+document.getElementById('fa-r').value;o.mergeCost=(+document.getElementById('fa-m').value)/100;
      o.insertRate=(+document.getElementById('fa-i').value)*10000;o.deadline=+document.getElementById('fa-d').value;
      document.getElementById('fa-rv').textContent=o.readsPerUser;document.getElementById('fa-mv').textContent=o.mergeCost.toFixed(2)+'x';
      document.getElementById('fa-iv').textContent=(o.insertRate/1000)+'K inserts/s';document.getElementById('fa-dv').textContent=o.deadline+' s';
      var m=model(o),t='<table><tr><th>Who is fanned out on write</th><th>Total work / day</th><th>Biggest single-tweet fan-out</th><th>Time to deliver it</th><th>Meets deadline?</th></tr>';
      m.rows.forEach(function(r){var nm=r.T===0?'Nobody (pure fan-out on read)':r.T===Infinity?'Everybody (pure fan-out on write)':'Accounts with fewer than '+r.T.toLocaleString()+' followers';
        var mark=r===m.bestFeasible?' style="background:var(--ok-soft)"':'';
        t+='<tr'+mark+'><td>'+nm+'</td><td><b>'+fmt(r.total)+'</b>'+(r===m.cheapest?' <span class="tag">least total work</span>':'')+'</td><td>'+fmt(r.maxBurst)+' inserts</td><td>'+secs(r.burstSeconds)+'</td><td>'+(r.feasible?'<span class="tag ok">yes</span>':'<span class="tag bad">no</span>')+(r===m.bestFeasible?' <span class="tag ok">chosen</span>':'')+'</td></tr>';});
      document.getElementById('fa-out').innerHTML='<p>Mean followers per author: <b>'+m.meanF.toFixed(0)+'</b>. Largest account: <b>'+fmt(m.maxF)+'</b> followers.</p>'+t+'</table>'+
        '<p style="color:var(--muted)">Green row: the cheapest design that still delivers every write-path tweet within the deadline. Try to make &ldquo;least total work&rdquo; and &ldquo;chosen&rdquo; land on different rows, then try to make them land on the same one.</p>';
    }
    ['fa-r','fa-m','fa-i','fa-d'].forEach(function(id){document.getElementById(id).oninput=draw;});draw();
  });
})();
