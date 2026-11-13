/* Lessons 0012 and 0017: where does the cost go for relational vs document layouts of the same profile data?
   Counts: rows or documents read from storage, client round trips, rows or documents written, and "torn" intermediate states
   (crash points that leave a shared fact partially updated) when the engine cannot make a multi-document write atomic.
   Calibrated against MySQL 8.0.46 measurements (experiments/mysql/layout_*.sql): N=20,000 employees, P=4 positions, E=2 educations,
   M=200 companies. ILLUSTRATIVE: ignores caches, page sizes and network latency. */
(function(){
  var DEF={N:20000,P:4,E:2,M:200,reverseIndex:true,multiDocTxn:true};
  var LAYOUTS={
    rel:{name:'Relational (normalized tables)'},
    embed:{name:'Document, company data embedded in each position'},
    ref:{name:'Document, companies in their own collection (referenced)'}
  };
  var OPS={
    profile:{name:'Load one full profile page'},
    summary:{name:'Load only the person\'s name'},
    rename:{name:'Rename a company that many people list'},
    reverse:{name:'List everyone who ever worked at company X'},
    append:{name:'Add one position to one person'}
  };
  function C(o){return o.N*o.P/o.M;}                       /* positions (people) per company */
  function docBytes(o){return 40+o.P*70+o.E*35;}           /* calibrated: 390 bytes at P=4,E=2 */
  function cost(layout,op,o){
    o=Object.assign({},DEF,o);var c=C(o),r={reads:0,trips:1,writes:0,bytes:0,torn:0};
    if(layout==='rel'){
      if(op==='profile'){r.reads=3+2*o.P+o.E;r.trips=3;r.bytes=45+o.P*(60+45)+o.E*45;}
      if(op==='summary'){r.reads=1;r.bytes=45;}
      if(op==='rename'){r.reads=1;r.writes=1;r.bytes=45;}
      if(op==='reverse'){r.reads=1+2*c;r.bytes=c*(60+45);}
      if(op==='append'){r.writes=1;r.bytes=60;}
    }else{
      var b=docBytes(o);
      if(op==='profile'){if(layout==='embed'){r.reads=1;r.bytes=b;}else{r.reads=1+o.P;r.trips=2;r.bytes=b+o.P*45;}}
      if(op==='summary'){r.reads=1;r.bytes=b;}                                 /* the whole document is the unit of storage */
      if(op==='rename'){if(layout==='embed'){r.reads=(o.reverseIndex?1+c:o.N+3);r.writes=c;r.bytes=c*b;r.torn=o.multiDocTxn?0:Math.max(0,c-1);r.trips=c+1;}
                         else{r.reads=1;r.writes=1;r.bytes=45;}}
      if(op==='reverse'){r.reads=o.reverseIndex?1+c:o.N+3;r.bytes=c*b;}
      if(op==='append'){r.writes=1;r.bytes=b;}                                 /* rewrite of the one document */
    }
    return r;
  }
  /* weights = operations per day; returns totals per layout */
  function workbook(weights,o){
    var out={};Object.keys(LAYOUTS).forEach(function(l){var t={reads:0,trips:0,writes:0,torn:0};
      Object.keys(OPS).forEach(function(op){var x=cost(l,op,o),w=weights[op]||0;t.reads+=w*x.reads;t.trips+=w*x.trips;t.writes+=w*x.writes;t.torn+=(w>0&&x.torn>0)?1:0;});out[l]=t;});
    return out;
  }
  window.LayoutSim={DEF:DEF,LAYOUTS:LAYOUTS,OPS:OPS,cost:cost,workbook:workbook,C:C,docBytes:docBytes};

  function f(x){return x>=1e9?(x/1e9).toFixed(2)+'B':x>=1e6?(x/1e6).toFixed(2)+'M':Math.round(x).toLocaleString();}
  document.addEventListener('DOMContentLoaded',function(){
    var h=document.getElementById('sim-layout');
    if(h){
      h.innerHTML='<h4>Interactive &middot; The same profiles, three layouts</h4>'+
        '<div class="row"><label>Positions per person: <b id="ly-pv"></b> <input id="ly-p" type="range" min="1" max="12" value="4"></label>'+
        '<label>People per company: <b id="ly-cv"></b> <input id="ly-c" type="range" min="1" max="12" value="6"></label></div>'+
        '<div class="row"><label class="opt"><input type="checkbox" id="ly-i" checked> index that finds people by company (multi-valued/array index)</label>'+
        '<label class="opt"><input type="checkbox" id="ly-t" checked> engine can commit many documents atomically (e.g. MySQL transaction)</label></div><div id="ly-out"></div>';
      var CS=[10,25,50,100,200,400,1000,2000,5000,10000,20000,50000];
      function draw(){
        var o={N:20000,P:+document.getElementById('ly-p').value,E:2,reverseIndex:document.getElementById('ly-i').checked,multiDocTxn:document.getElementById('ly-t').checked};
        var m=CS[+document.getElementById('ly-c').value-1];o.M=Math.max(1,Math.round(o.N*o.P/m));
        document.getElementById('ly-pv').textContent=o.P;document.getElementById('ly-cv').textContent=Math.round(C(o)).toLocaleString();
        var t='<table><tr><th>Operation</th>'+Object.keys(LAYOUTS).map(function(l){return '<th>'+LAYOUTS[l].name+'</th>';}).join('')+'</tr>';
        Object.keys(OPS).forEach(function(op){t+='<tr><td>'+OPS[op].name+'</td>'+Object.keys(LAYOUTS).map(function(l){var x=cost(l,op,o);
          return '<td>'+f(x.reads)+' read'+(x.reads===1?'':'s')+', '+x.trips+' trip'+(x.trips===1?'':'s')+(x.writes?', '+f(x.writes)+' write'+(x.writes===1?'':'s'):'')+
            (x.torn?'<br><span class="tag bad">'+f(x.torn)+' torn states</span>':'')+'</td>';}).join('')+'</tr>';});
        document.getElementById('ly-out').innerHTML=t+'</table><p style="color:var(--muted)">Defaults reproduce the measurements in the lesson (20,000 people, 4 positions, 400 people per company). &ldquo;Reads&rdquo; counts rows or whole documents fetched from storage.</p>';
      }
      ['ly-p','ly-c','ly-i','ly-t'].forEach(function(id){document.getElementById(id).oninput=draw;document.getElementById(id).onchange=draw;});
      document.getElementById('ly-c').value=6;draw();
    }
    var w=document.getElementById('sim-workbook');
    if(w){
      var defs={profile:1000,summary:200,rename:1,reverse:5,append:20};
      w.innerHTML='<h4>Interactive &middot; Workload workbook</h4><p>Set how often each operation happens per day. The totals tell you which layout the <i>workload</i> favors, not which layout is &ldquo;better&rdquo;.</p>'+
        Object.keys(OPS).map(function(op){return '<div class="row"><label style="min-width:19rem">'+OPS[op].name+': <b id="wb-'+op+'v"></b> /day <input id="wb-'+op+'" type="range" min="0" max="3" value="0" data-op="'+op+'"></label></div>';}).join('')+
        '<div class="row"><label class="opt"><input type="checkbox" id="wb-i" checked> reverse lookups are indexed</label><label class="opt"><input type="checkbox" id="wb-t" checked> engine commits many documents atomically</label></div><div id="wb-out"></div>';
      var scale={profile:[10,1000,100000,1000000],summary:[0,200,20000,200000],rename:[0,1,10,100],reverse:[0,5,500,5000],append:[0,20,2000,20000]};
      Object.keys(OPS).forEach(function(op){var el=document.getElementById('wb-'+op);el.value=1;});
      function draw3(){
        var wt={};Object.keys(OPS).forEach(function(op){var el=document.getElementById('wb-'+op);wt[op]=scale[op][+el.value];document.getElementById('wb-'+op+'v').textContent=wt[op].toLocaleString();});
        var o={reverseIndex:document.getElementById('wb-i').checked,multiDocTxn:document.getElementById('wb-t').checked,P:4,E:2,N:20000,M:200};
        var W=workbook(wt,o),t='<table><tr><th>Layout</th><th>Rows or documents read / day</th><th>Round trips / day</th><th>Rows or documents written / day</th><th>Operations that can leave torn states</th></tr>';
        var best=Object.keys(W).reduce(function(a,l){return W[l].reads+W[l].writes<W[a].reads+W[a].writes?l:a;},'rel');
        Object.keys(W).forEach(function(l){t+='<tr'+(l===best?' style="background:var(--ok-soft)"':'')+'><td>'+LAYOUTS[l].name+(l===best?' <span class="tag ok">least reads+writes</span>':'')+'</td><td>'+f(W[l].reads)+'</td><td>'+f(W[l].trips)+'</td><td>'+f(W[l].writes)+'</td><td>'+(W[l].torn?'<span class="tag bad">rename</span>':'<span class="tag ok">none</span>')+'</td></tr>';});
        document.getElementById('wb-out').innerHTML=t+'</table>';
      }
      w.querySelectorAll('input').forEach(function(el){el.oninput=draw3;el.onchange=draw3;});draw3();
    }
  });
})();
