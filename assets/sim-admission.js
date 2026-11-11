/* Lesson 0011: admission control. A deterministic fluid model of a FIFO service.
   Each tick, `arrivals(t)` requests arrive; the server can process `cap` requests per tick, oldest first.
   Clients give up after `deadline` ticks of waiting: a request served after that is WASTED work (nobody is listening).
   Policies:
     none     - unbounded queue, serve everything oldest-first
     bounded  - queue limited to `queueCap` requests; the excess is rejected immediately
     deadline - unbounded queue, but requests already past their deadline are dropped at the head without costing capacity
     both     - bounded + deadline
   ILLUSTRATIVE: a toy that isolates one mechanism. It ignores retries (see Lesson 5), priorities and multiple servers. */
(function(){
  var DEF={horizon:120,cap:100,base:70,surgeStart:20,surgeEnd:50,surge:160,deadline:5};
  function arrivals(o,t){return (t>=o.surgeStart&&t<o.surgeEnd)?o.surge:o.base;}
  function run(policy,o){
    var q=[],useB=(policy==='bounded'||policy==='both'),useD=(policy==='deadline'||policy==='both'),
        queueCap=o.queueCap!==undefined?o.queueCap:o.cap*o.deadline/2,
        T={arrived:0,good:0,wasted:0,rejected:0,dropped:0,latSum:0},series=[];
    function len(){return q.reduce(function(a,c){return a+c.n;},0);}
    for(var t=0;t<o.horizon;t++){
      var a=arrivals(o,t),acc=useB?Math.max(0,Math.min(a,queueCap-len())):a;
      T.arrived+=a;T.rejected+=a-acc;if(acc>0)q.push({t:t,n:acc});
      var cap=o.cap,good=0,wasted=0,dropped=0;
      while(cap>1e-9&&q.length){
        var c=q[0],age=t-c.t;
        if(useD&&age>o.deadline){dropped+=c.n;q.shift();continue;}
        var take=Math.min(cap,c.n);
        if(age<=o.deadline){good+=take;T.latSum+=take*age;}else wasted+=take;
        cap-=take;c.n-=take;if(c.n<=1e-9)q.shift();
      }
      T.good+=good;T.wasted+=wasted;T.dropped+=dropped;
      series.push({t:t,offered:a,good:good,wasted:wasted,queue:len()});
    }
    T.remaining=len();T.meanGoodLatency=T.good>0?T.latSum/T.good:0;
    return {T:T,series:series};
  }
  var POLICIES={none:'No admission control (unbounded FIFO)',bounded:'Bounded queue, reject the excess',deadline:'Drop requests past their deadline',both:'Bounded queue + deadline drop'};
  window.AdmissionSim={defaults:DEF,run:run,POLICIES:POLICIES};

  document.addEventListener('DOMContentLoaded',function(){
    var h=document.getElementById('sim-admission');if(!h)return;
    var cur='none';
    h.innerHTML='<h4>Interactive &middot; The surge, with and without admission control</h4>'+
      '<p>A service handles 100 requests per tick and normally receives 70. Between ticks 20 and 50 a surge arrives. Clients give up after a deadline. Green = requests served in time. Red = work done for clients who already left.</p>'+
      '<div class="row"><label>Surge level: <b id="ad-sv"></b> per tick <input id="ad-s" type="range" min="70" max="300" step="10" value="160"></label>'+
      '<label>Client patience: <b id="ad-dv"></b> ticks <input id="ad-d" type="range" min="2" max="12" value="5"></label></div><div class="row" id="ad-p"></div><div id="ad-chart"></div><div id="ad-tab"></div>';
    var pb=document.getElementById('ad-p');
    Object.keys(POLICIES).forEach(function(k){var b=document.createElement('button');b.className='btn ghost';b.dataset.k=k;b.textContent=POLICIES[k];b.onclick=function(){cur=k;draw();};pb.appendChild(b);});
    function draw(){
      var o=Object.assign({},DEF);o.surge=+document.getElementById('ad-s').value;o.deadline=+document.getElementById('ad-d').value;
      document.getElementById('ad-sv').textContent=o.surge;document.getElementById('ad-dv').textContent=o.deadline;
      [].forEach.call(pb.children,function(b){b.classList.toggle('sel',b.dataset.k===cur);});
      var r=run(cur,o),W=640,H=180,pad=30,bw=(W-pad)/o.horizon,maxY=Math.max(o.surge,o.cap)*1.1,y=function(v){return H-16-v/maxY*(H-28);};
      var g='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto" role="img" aria-label="Served work per tick">';
      r.series.forEach(function(s,i){var x=pad+i*bw;
        if(s.offered>o.cap)g+='<rect x="'+x+'" y="0" width="'+bw+'" height="'+(H-16)+'" fill="var(--warn-soft)"/>';
        g+='<rect x="'+x+'" y="'+y(s.good)+'" width="'+Math.max(1,bw-0.6)+'" height="'+(H-16-y(s.good))+'" fill="var(--ok)"/>';
        if(s.wasted>0.5)g+='<rect x="'+x+'" y="'+y(s.good+s.wasted)+'" width="'+Math.max(1,bw-0.6)+'" height="'+(y(s.good)-y(s.good+s.wasted))+'" fill="var(--bad)"/>';});
      g+='<line x1="'+pad+'" x2="'+W+'" y1="'+y(o.cap)+'" y2="'+y(o.cap)+'" stroke="var(--fg)" stroke-dasharray="4 3"/><text x="'+(pad+2)+'" y="'+(y(o.cap)-3)+'" font-size="10" fill="var(--fg)">capacity</text>'+
        '<text x="'+pad+'" y="'+(H-2)+'" font-size="10" fill="var(--muted)">time &rarr; (shaded = offered load above capacity)</text></svg>';
      document.getElementById('ad-chart').innerHTML=g;
      var t='<table><tr><th>Policy</th><th>Served in time</th><th>Wasted work</th><th>Turned away</th><th>Mean wait of served-in-time</th></tr>';
      Object.keys(POLICIES).forEach(function(k){var x=run(k,o).T;
        t+='<tr'+(k===cur?' style="background:var(--accent-soft)"':'')+'><td>'+POLICIES[k]+'</td><td>'+(x.good/x.arrived*100).toFixed(0)+'%</td><td>'+(x.wasted/x.arrived*100).toFixed(0)+'%</td><td>'+((x.rejected+x.dropped)/x.arrived*100).toFixed(0)+'%</td><td>'+x.meanGoodLatency.toFixed(1)+' ticks</td></tr>';});
      document.getElementById('ad-tab').innerHTML=t+'</table>';
    }
    ['ad-s','ad-d'].forEach(function(id){document.getElementById(id).oninput=draw;});draw();
  });
})();
