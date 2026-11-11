/* Lesson 0010: error-budget arithmetic. Pure functions plus a small UI.
   Assumption (stated in the lesson): traffic is uniform over time, so "minutes of full outage" and
   "fraction of requests that failed" convert into each other: bad-minute-equivalents = minutes * errorRate. */
(function(){
  var MIN_PER_DAY=1440;
  function budgetMinutes(slo,days){return days*MIN_PER_DAY*(1-slo/100);}
  function consumed(incident){return incident.minutes*incident.errorRate;}            /* in bad-minute-equivalents */
  function burnRate(slo,errorRate){return errorRate/(1-slo/100);}                     /* 1 = spending exactly on budget */
  function hoursToExhaust(slo,days,errorRate){return days*24/burnRate(slo,errorRate);}
  function timeline(slo,days,incidents){
    var budget=budgetMinutes(slo,days),spent=0,exhaustedDay=null,steps=[{day:0,remaining:budget}];
    incidents.slice().sort(function(a,b){return a.day-b.day;}).forEach(function(inc){
      spent+=consumed(inc);steps.push({day:inc.day+inc.minutes/MIN_PER_DAY,remaining:budget-spent,name:inc.name});
      if(exhaustedDay===null&&spent>budget)exhaustedDay=inc.day;});
    steps.push({day:days,remaining:budget-spent});
    return {budget:budget,spent:spent,remaining:budget-spent,exhaustedDay:exhaustedDay,steps:steps};
  }
  function composite(avails){return avails.reduce(function(a,x){return a*x;},1);}   /* serial hard dependencies, independent failures */
  var NINES=[99,99.5,99.9,99.95,99.99,99.999];
  var INCIDENTS=[
    {name:'Bad deploy, rolled back',day:4,minutes:12,errorRate:1},
    {name:'Slow shard, partial errors',day:11,minutes:90,errorRate:0.05},
    {name:'Dependency outage',day:17,minutes:25,errorRate:1},
    {name:'Config push breaks one route',day:23,minutes:8,errorRate:1},
    {name:'Noisy neighbor, 20% of requests fail',day:27,minutes:40,errorRate:0.2}
  ];
  window.SloSim={budgetMinutes:budgetMinutes,consumed:consumed,burnRate:burnRate,hoursToExhaust:hoursToExhaust,timeline:timeline,composite:composite,NINES:NINES,INCIDENTS:INCIDENTS};

  function fmtMin(m){return m>=120?(m/60).toFixed(1)+' hours':m>=1?m.toFixed(1)+' minutes':(m*60).toFixed(1)+' seconds';}
  function esc(x){return String(x).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]});}
  document.addEventListener('DOMContentLoaded',function(){
    var h=document.getElementById('sim-slo');
    if(h){
      h.innerHTML='<h4>Interactive 1 &middot; A 30-day error budget</h4>'+
        '<div class="row"><label>SLO: <b id="sl-v"></b> <input id="sl-s" type="range" min="0" max="5" value="2"></label></div><div id="sl-inc"></div><div id="sl-chart"></div><div id="sl-tab"></div>';
      var incHost=document.getElementById('sl-inc'),on=INCIDENTS.map(function(){return true;});
      incHost.innerHTML=INCIDENTS.map(function(i,k){return '<label class="opt"><input type="checkbox" data-k="'+k+'" checked> Day '+i.day+': '+esc(i.name)+' ('+i.minutes+' min at '+Math.round(i.errorRate*100)+'% errors)</label>';}).join('');
      [].forEach.call(incHost.querySelectorAll('input'),function(c){c.onchange=function(){on[+c.dataset.k]=c.checked;draw();};});
      function draw(){
        var slo=NINES[+document.getElementById('sl-s').value];document.getElementById('sl-v').textContent=slo+'%';
        var inc=INCIDENTS.filter(function(_,k){return on[k];}),t=timeline(slo,30,inc),W=640,H=170,pad=40;
        var lo=Math.min(0,t.steps.reduce(function(m,s){return Math.min(m,s.remaining);},t.budget)),hi=t.budget,rng=(hi-lo)||1;
        var x=function(d){return pad+d/30*(W-pad-10);},y=function(v){return 10+(hi-v)/rng*(H-30);};
        var g='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto" role="img" aria-label="Error budget remaining over 30 days">'+
          '<line x1="'+pad+'" x2="'+(W-10)+'" y1="'+y(0)+'" y2="'+y(0)+'" stroke="var(--fg)" stroke-dasharray="4 3"/><text x="2" y="'+(y(0)+3)+'" font-size="10" fill="var(--muted)">0</text>';
        var d='';t.steps.forEach(function(s,i){d+=(i?'L':'M')+x(s.day)+','+y(s.remaining);if(i<t.steps.length-1)d+='L'+x(t.steps[i+1].day)+','+y(s.remaining);});
        g+='<path d="'+d+'" fill="none" stroke="'+(t.remaining<0?'var(--bad)':'var(--ok)')+'" stroke-width="2"/>'+
           '<text x="'+pad+'" y="'+(H-3)+'" font-size="10" fill="var(--muted)">day 0 &rarr; day 30: error budget remaining (minutes of full outage)</text></svg>';
        document.getElementById('sl-chart').innerHTML=g;
        var tab='<p>Budget: <b>'+fmtMin(t.budget)+'</b> of full outage per 30 days. Spent: <b>'+fmtMin(t.spent)+'</b> ('+(t.spent/t.budget*100).toFixed(0)+'%). '+
          (t.exhaustedDay===null?'<span class="tag ok">budget remains: releases may continue</span>':'<span class="tag bad">budget exhausted on day '+t.exhaustedDay+': example policy freezes risky releases</span>')+'</p>'+
          '<table><tr><th>Incident</th><th>Budget consumed</th><th>Burn rate</th><th>At that rate the whole budget lasts</th></tr>';
        inc.forEach(function(i){tab+='<tr><td>'+esc(i.name)+'</td><td>'+(consumed(i)/t.budget*100).toFixed(0)+'%</td><td>'+burnRate(slo,i.errorRate).toFixed(0)+'&times;</td><td>'+fmtMin(hoursToExhaust(slo,30,i.errorRate)*60)+'</td></tr>';});
        document.getElementById('sl-tab').innerHTML=tab+'</table><p style="color:var(--muted)">Burn rate 1 means spending the budget at exactly the pace that lasts the whole window. A 100%-error incident against a 99.9% SLO burns at 1,000&times;. Assumes uniform traffic, so minutes &times; error rate converts to budget.</p>';
      }
      document.getElementById('sl-s').oninput=draw;draw();
    }
    var c=document.getElementById('sim-composite');
    if(c){
      c.innerHTML='<h4>Interactive 2 &middot; Dependencies multiply</h4><div class="row"><label>Hard dependencies in the request path: <b id="cp-nv"></b> <input id="cp-n" type="range" min="1" max="12" value="4"></label>'+
        '<label>Each one&rsquo;s availability: <b id="cp-av"></b> <input id="cp-a" type="range" min="0" max="4" value="2"></label></div><div id="cp-out"></div>';
      function d2(){var n=+document.getElementById('cp-n').value,a=[99,99.5,99.9,99.95,99.99][+document.getElementById('cp-a').value];
        document.getElementById('cp-nv').textContent=n;document.getElementById('cp-av').textContent=a+'%';
        var all=[];for(var i=0;i<n;i++)all.push(a/100);var A=composite(all);
        document.getElementById('cp-out').innerHTML='<p>Best case for your service, before its own faults: <b>'+(A*100).toFixed(3)+'%</b>, which is '+fmtMin((1-A)*30*MIN_PER_DAY)+' of allowed downtime per 30 days. Your own SLO cannot honestly exceed this unless the dependencies are made optional or redundant.</p>';}
      ['cp-n','cp-a'].forEach(function(id){document.getElementById(id).oninput=d2;});d2();
    }
  });
})();
